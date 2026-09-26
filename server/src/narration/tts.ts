import fs from "node:fs/promises";
import { ttsConfig } from "../config";
import { synthesizeElevenLabs } from "../services/elevenlabs";
import { synthesizeSpeechify } from "../services/speechify";

export function isTtsAvailable(): boolean {
  return !ttsConfig().mock;
}

/** Everything that changes how the audio sounds; part of the cache key. */
export function voiceSignature(): string[] {
  const cfg = ttsConfig();
  return cfg.provider === "speechify"
    ? ["speechify", cfg.speechify.voiceId, cfg.speechify.model, cfg.speechify.rate, cfg.speechify.emotion]
    : ["elevenlabs", cfg.elevenlabs.voiceId, cfg.elevenlabs.model];
}

// Providers cap simultaneous requests per plan, so TTS calls share one
// limiter (TTS_CONCURRENCY) independent of how many places run in parallel.
let active = 0;
const waiting: (() => void)[] = [];

async function withTtsSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (active >= ttsConfig().concurrency) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Returns MP3 bytes, or null in mock mode or on any provider error. */
export async function synthesize(text: string): Promise<Buffer | null> {
  const cfg = ttsConfig();
  if (cfg.mock) return null;
  const call = cfg.provider === "elevenlabs" ? synthesizeElevenLabs : synthesizeSpeechify;
  for (let attempt = 1; ; attempt++) {
    try {
      return await withTtsSlot(() => call(text));
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 429 && attempt < MAX_ATTEMPTS) {
        await sleep(1000 * attempt);
        continue;
      }
      console.warn(`[tts] ${cfg.provider} failed:`, (err as Error).message);
      return null;
    }
  }
}

/** Synthesizes and writes an MP3 atomically. Returns true if the file was written. */
export async function synthesizeToFile(text: string, filePath: string): Promise<boolean> {
  const audio = await synthesize(text);
  if (!audio || audio.length === 0) return false;
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, audio);
  await fs.rename(tmp, filePath);
  return true;
}
