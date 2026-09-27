// Simulates the demo drive against the live-guide endpoints, in-process.
//
//   npm run replay:drive                     mock mode (template lines, no audio), fast
//   npm run replay:drive -- --real           real OpenAI + Speechify, real-time 3 s ticks; fills data/audio_cache
//   npm run replay:drive -- --real --fresh   same, but with an empty cache to measure cold generation time
//   npm run replay:drive -- --question "..." custom chat question
//
// Received MP3s are copied to tmp/replay/ so you can listen to them.
import "dotenv/config";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { createApp } from "../app";
import { audioCacheDir, llmConfig, ttsConfig } from "../config";
import { DEMO_INTERVAL_MS, demoPath } from "../live/demoPath";
import { distanceMeters } from "../live/geo";
import { SessionStore, type LiveNarration } from "../live/session";
import { getIntroNarration, INTRO_ID } from "../narration/intro";
import type { Place } from "../types";

const args = process.argv.slice(2);
const real = args.includes("--real");
const fresh = args.includes("--fresh");
const qi = args.indexOf("--question");
const question = qi >= 0 && args[qi + 1] ? args[qi + 1] : "How long has the Heat played there?";

const TMP = path.resolve("tmp");
const OUT_DIR = path.join(TMP, "replay");

if (!real) {
  process.env.MOCK_LLM = "1";
  process.env.MOCK_TTS = "1";
  process.env.AUDIO_CACHE_DIR = path.join(TMP, "mock-cache");
} else if (fresh) {
  process.env.AUDIO_CACHE_DIR = path.join(TMP, "fresh-cache");
  fs.rmSync(process.env.AUDIO_CACHE_DIR, { recursive: true, force: true });
}
delete process.env.PUBLIC_BASE_URL; // audio is fetched from the in-process server

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fmtS = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

async function main() {
  const places = JSON.parse(fs.readFileSync("data/demo-places.json", "utf8")) as Place[];
  const points = demoPath();

  // Mock mode runs on a simulated clock; real mode ticks in real time so
  // generation latency is measured against the car's actual progress.
  let simNow = Date.now();
  const store = new SessionStore({ now: real ? Date.now : () => simNow, intro: getIntroNarration });
  const server = createApp({ store }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (url: string, body: unknown) => {
    const res = await fetch(base + url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as any;
  };

  const llm = llmConfig();
  const tts = ttsConfig();
  console.log(
    `Replaying ${points.length} ticks (${fmtS(points.length * DEMO_INTERVAL_MS)} of driving)\n` +
      `  LLM: ${llm.mock ? "mock" : `${llm.narrationModel} (chat: ${llm.chatModel})`}\n` +
      `  TTS: ${tts.mock ? "mock (no audio)" : tts.provider}\n` +
      `  cache: ${audioCacheDir()}\n`,
  );

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { sessionId } = await post("/tour/start", { places });
  const session = store.get(sessionId)!;
  const triggeredAt = new Map<string, number>();
  const delivered: { n: LiveNarration; tick: number; waitMs: number }[] = [];

  const started = Date.now();
  for (const [i, pt] of points.entries()) {
    const tickStart = Date.now();
    const t = `t=${String(i * (DEMO_INTERVAL_MS / 1000)).padStart(3)}s`;
    const { narration, pending } = await post("/tour/tick", { sessionId, ...pt });
    if (pending && !triggeredAt.has(pending)) {
      triggeredAt.set(pending, real ? Date.now() : i * DEMO_INTERVAL_MS);
      const p = places.find((x) => x.id === pending)!;
      console.log(`${t}  trigger   ${p.name}, ${Math.round(distanceMeters(pt, p))} m away`);
    }
    if (narration?.placeId === INTRO_ID) {
      console.log(`${t}  intro     "${narration.text}"${narration.audioUrl ? "" : " (no audio)"}`);
    } else if (narration) {
      const n = narration as LiveNarration;
      const nowMs = real ? Date.now() : i * DEMO_INTERVAL_MS;
      delivered.push({ n, tick: i, waitMs: nowMs - triggeredAt.get(n.placeId)! });
      console.log(`${t}  narrate   ${n.name} (${n.side}): "${n.text}"`);
      if (n.audioUrl) {
        const audio = Buffer.from(await (await fetch(base + n.audioUrl)).arrayBuffer());
        const file = path.join(OUT_DIR, `${delivered.length}-${n.placeId}.mp3`);
        fs.writeFileSync(file, audio);
        console.log(`           audio ${path.relative(process.cwd(), file)}`);
      }
    }
    if (real) {
      await sleep(Math.max(0, DEMO_INTERVAL_MS - (Date.now() - tickStart)));
    } else {
      await sleep(20); // let the background generation run
      simNow += DEMO_INTERVAL_MS;
    }
  }
  await store.idle(session);
  const driveMs = Date.now() - started;

  console.log("\nNarrations");
  const order = (p: Place) => delivered.find((x) => x.n.placeId === p.id)?.tick ?? Infinity;
  for (const p of [...places].sort((a, b) => order(a) - order(b))) {
    const d = delivered.find((x) => x.n.placeId === p.id);
    const stat = session.stats.find((x) => x.placeId === p.id);
    const dists = points.map((pt) => distanceMeters(pt, p));
    const passTick = dists.indexOf(Math.min(...dists));
    if (!d) {
      console.log(`  ${p.name}: NOT narrated${stat ? " (generated but dropped as stale)" : ""}`);
      continue;
    }
    const leadS = (passTick - d.tick) * (DEMO_INTERVAL_MS / 1000);
    console.log(
      `  ${p.name} (${d.n.side})\n` +
        `    generated in ${stat ? fmtS(stat.ms) : "?"}, trigger to delivery ${fmtS(d.waitMs)}, ` +
        `${d.n.audioUrl ? `audio ~${d.n.durationHintS} s` : "no audio"}\n` +
        `    ${leadS > 0 ? `in time: delivered ${leadS} s before passing` : `LATE: delivered ${-leadS} s after passing`}\n` +
        `    "${d.n.text}"`,
    );
  }

  console.log(`\nChat: "${question}"`);
  const chatStart = Date.now();
  const chat = await post("/tour/chat", { sessionId, message: question });
  console.log(`  reply (${fmtS(Date.now() - chatStart)}): ${chat.reply}`);
  console.log(`  placeId: ${chat.placeId}`);
  if (chat.sources?.length) {
    for (const s of chat.sources) console.log(`  source: ${s.title}  ${s.url}`);
  } else {
    console.log("  sources: none");
  }

  await post("/tour/end", { sessionId });
  server.close();
  console.log(`\nDrive replayed in ${fmtS(driveMs)} of wall time.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
