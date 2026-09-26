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

/** Returns MP3 bytes, or null in mock mode or on any provider error. */
export async function synthesize(text: string): Promise<Buffer | null> {
  const cfg = ttsConfig();
  if (cfg.mock) return null;
  try {
    return cfg.provider === "elevenlabs"
      ? await synthesizeElevenLabs(text)
      : await synthesizeSpeechify(text);
  } catch (err) {
    console.warn(`[tts] ${cfg.provider} failed:`, (err as Error).message);
    return null;
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
