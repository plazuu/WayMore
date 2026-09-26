// Usage: npm run pregen:narration [-- path/to/places.json]
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { audioCacheDir, geminiConfig, ttsConfig } from "../config";
import { pregenerate } from "../narration/cache";
import type { Place } from "../types";

async function main() {
  const file = path.resolve(process.argv[2] ?? "data/demo-places.json");
  const places = JSON.parse(fs.readFileSync(file, "utf8")) as Place[];
  const llm = geminiConfig();
  const tts = ttsConfig();
  console.log(
    `Pregenerating ${places.length} places from ${file}\n` +
      `  LLM: ${llm.mock ? "mock (template lines)" : llm.model}\n` +
      `  TTS: ${tts.mock ? "mock (no audio)" : tts.provider}\n` +
      `  cache: ${audioCacheDir()}\n`,
  );

  const results = await pregenerate(places);
  for (const [i, n] of results.entries()) {
    const audio = n.audioUrl ? path.join(audioCacheDir(), path.basename(n.audioUrl)) : "(no audio)";
    console.log(`${places[i].name}  [~${n.durationHintS}s]\n  "${n.text}"\n  ${audio}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
