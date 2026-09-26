import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { cacheKey, getNarration } from "../src/narration/cache";
import type { Narration, Place } from "../src/types";

const cacheDir = mkdtempSync(path.join(os.tmpdir(), "narration-test-"));
const realFetch = globalThis.fetch;

beforeEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  Object.assign(process.env, {
    AUDIO_CACHE_DIR: cacheDir,
    MOCK_LLM: "1",
    MOCK_TTS: "1",
    TTS_PROVIDER: "speechify",
    SPEECHIFY_VOICE_ID: "chase",
    SPEECHIFY_RATE: "+10%",
    SPEECHIFY_EMOTION: "energetic",
  });
  globalThis.fetch = realFetch;
});

after(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  globalThis.fetch = realFetch;
});

const places: Place[] = [
  { id: "kaseya", name: "Kaseya Center", kind: "landmark", tagline: "Home of the Miami Heat", lat: 25.78, lng: -80.19, side: "right" },
  { id: "bass", name: "Bass & Co", kind: "restaurant", lat: 25.77, lng: -80.19, side: "left" },
  { id: "tower", name: "Freedom Tower", kind: "landmark", lat: 25.78, lng: -80.19 },
];

function assertNarration(n: Narration) {
  assert.deepEqual(Object.keys(n).sort(), ["audioUrl", "durationHintS", "placeId", "text"]);
  assert.equal(typeof n.placeId, "string");
  assert.equal(typeof n.text, "string");
  assert.ok(n.audioUrl === null || typeof n.audioUrl === "string");
  assert.equal(typeof n.durationHintS, "number");
}

test("mock mode: template line, no audio", async () => {
  const n = await getNarration(places[0]);
  assertNarration(n);
  assert.equal(n.placeId, "kaseya");
  assert.equal(n.text, "On your right is Kaseya Center, home of the Miami Heat.");
  assert.equal(n.audioUrl, null);
});

test("saves the line and the facts it was written from next to the audio", async () => {
  const place = { ...places[0], facts: ["Opened in 1999."] };
  const n = await getNarration(place);
  const saved = JSON.parse(readFileSync(path.join(cacheDir, `${cacheKey(place)}.json`), "utf8"));
  assert.deepEqual(saved.facts, ["Opened in 1999."]);
  assert.equal(saved.text, n.text);
  assert.match(saved.llm, /^openai:/);
});

test("with TTS on: audio is generated, served at /audio, SSML is escaped, and the second call is a cache hit", async () => {
  process.env.MOCK_TTS = "0";
  process.env.SPEECHIFY_API_KEY = "test-key";
  const bodies: any[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ audio_data: Buffer.from("ID3fake").toString("base64"), audio_format: "mp3" }));
  }) as typeof fetch;

  const n = await getNarration(places[1]);
  assert.match(n.audioUrl!, /^\/audio\/bass-[0-9a-f]{10}\.mp3$/);
  assert.ok(bodies[0].input.includes("Bass &amp; Co"));
  assert.equal(bodies[0].voice_id, "chase");

  const app = createApp();
  const audio = await request(app).get(n.audioUrl!).expect(200);
  assert.equal(audio.headers["content-type"], "audio/mpeg");
  assert.equal(Buffer.from(audio.body).toString(), "ID3fake");
  await request(app).get(n.audioUrl!.replace(".mp3", ".json")).expect(404);

  await getNarration(places[1]);
  assert.equal(bodies.length, 1);
  delete process.env.SPEECHIFY_API_KEY;
});

test("text cached in mock mode gets audio only once TTS becomes available", async () => {
  const first = await getNarration(places[0]);
  assert.equal(first.audioUrl, null);

  process.env.MOCK_TTS = "0";
  process.env.SPEECHIFY_API_KEY = "test-key";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ audio_data: Buffer.from("ID3").toString("base64") }));
  }) as typeof fetch;

  const second = await getNarration(places[0]);
  assert.equal(calls, 1);
  assert.equal(second.text, first.text);
  assert.ok(second.audioUrl && existsSync(path.join(cacheDir, path.basename(second.audioUrl))));
  delete process.env.SPEECHIFY_API_KEY;
});

test("a TTS failure gives audioUrl null instead of failing", async () => {
  process.env.MOCK_TTS = "0";
  process.env.SPEECHIFY_API_KEY = "test-key";
  globalThis.fetch = (async () => new Response("bad ssml", { status: 400 })) as typeof fetch;
  const results = await Promise.all(places.map((p) => getNarration(p)));
  assert.ok(results.every((n) => n.audioUrl === null && n.text.length > 0));
  delete process.env.SPEECHIFY_API_KEY;
});

test("changing voice settings changes the cache key", () => {
  const before = cacheKey(places[0]);
  process.env.SPEECHIFY_EMOTION = "calm";
  assert.notEqual(cacheKey(places[0]), before);
  process.env.SPEECHIFY_EMOTION = "energetic";
  process.env.SPEECHIFY_RATE = "+20%";
  assert.notEqual(cacheKey(places[0]), before);
});

test("concurrent narrations share one TTS slot, and a 429 is retried", async () => {
  process.env.MOCK_TTS = "0";
  process.env.SPEECHIFY_API_KEY = "test-key";
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 20));
    inFlight--;
    if (calls === 1) return new Response("concurrency_limit_reached", { status: 429 });
    return new Response(JSON.stringify({ audio_data: Buffer.from("ID3").toString("base64") }));
  }) as typeof fetch;

  const results = await Promise.all(places.map((p) => getNarration(p)));
  assert.equal(maxInFlight, 1);
  assert.equal(calls, 4); // 3 places + 1 retry
  assert.ok(results.every((n) => typeof n.audioUrl === "string"));
  delete process.env.SPEECHIFY_API_KEY;
});

// --- POST /narration and /narration/pregenerate (the app's current tour mode) ---

test("POST /narration/pregenerate returns one Narration per place, in order", async () => {
  const res = await request(createApp()).post("/narration/pregenerate").send({ places }).expect(200);
  assert.equal(res.body.length, 3);
  res.body.forEach(assertNarration);
  assert.deepEqual(res.body.map((n: Narration) => n.placeId), ["kaseya", "bass", "tower"]);
  assert.equal(res.body[0].text, "On your right is Kaseya Center, home of the Miami Heat.");
});

test("POST /narration returns one Narration", async () => {
  const res = await request(createApp()).post("/narration").send(places[2]).expect(200);
  assertNarration(res.body);
  assert.equal(res.body.placeId, "tower");
});

test("invalid /narration bodies get 400 { error: string }", async () => {
  const app = createApp();
  for (const [url, body] of [
    ["/narration", { id: "x", name: "X", kind: "museum", lat: 1, lng: 2 }],
    ["/narration/pregenerate", { places: [] }],
    ["/narration/pregenerate", { places: [{ id: "x" }] }],
    ["/narration/pregenerate", { places: Array.from({ length: 101 }, () => places[0]) }],
  ] as const) {
    const res = await request(app).post(url).send(body).expect(400);
    assert.equal(typeof res.body.error, "string", `${url}`);
  }
});
