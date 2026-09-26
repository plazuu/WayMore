import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { audioCacheDir } from "../config";
import { isLlmAvailable, llmSignature } from "../services/openai";
import type { Narration, Place } from "../types";
import { durationHint, writeScript, type Script } from "./scriptWriter";
import { isTtsAvailable, synthesizeToFile, voiceSignature } from "./tts";

export const AUDIO_ROUTE = "/audio";

/** What's saved in <key>.json next to the MP3: the line and what it was written from. */
export interface CacheEntry {
  placeId: string;
  name: string;
  kind: Place["kind"];
  text: string;
  source: Script["source"];
  /** "provider:model" that wrote the text (or would have, for template lines). */
  llm?: string;
  tagline?: string;
  description?: string;
  facts: string[];
  createdAt: string;
}

export function cacheKey(place: Place): string {
  const safeId = place.id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "place";
  const hash = createHash("sha1")
    .update(
      JSON.stringify([
        place.id,
        place.name,
        place.kind,
        place.side ?? null,
        place.tagline ?? null,
        place.description ?? null,
        place.facts ?? [],
        llmSignature(),
        ...voiceSignature(),
      ]),
    )
    .digest("hex")
    .slice(0, 10);
  return `${safeId}-${hash}`;
}

async function readEntry(jsonPath: string): Promise<CacheEntry | null> {
  try {
    return JSON.parse(await fs.readFile(jsonPath, "utf8")) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filePath);
}

async function buildNarration(place: Place, key: string): Promise<Narration> {
  const dir = audioCacheDir();
  await fs.mkdir(dir, { recursive: true });
  const jsonPath = path.join(dir, `${key}.json`);
  const mp3Path = path.join(dir, `${key}.mp3`);

  let entry = await readEntry(jsonPath);
  // Regenerate text if missing, or if it was a template fallback and the LLM is now available.
  if (!entry || (entry.source === "template" && isLlmAvailable())) {
    const script = await writeScript(place);
    if (entry && entry.text !== script.text) await fs.rm(mp3Path, { force: true });
    entry = {
      placeId: place.id,
      name: place.name,
      kind: place.kind,
      text: script.text,
      source: script.source,
      llm: llmSignature(),
      tagline: place.tagline,
      description: place.description,
      facts: place.facts ?? [],
      createdAt: new Date().toISOString(),
    };
    await writeJsonAtomic(jsonPath, entry);
  }

  // Text cached but audio missing (e.g. generated in mock mode earlier): make only the audio.
  if (!existsSync(mp3Path) && isTtsAvailable()) {
    await synthesizeToFile(entry.text, mp3Path);
  }

  return {
    placeId: place.id,
    text: entry.text,
    audioUrl: existsSync(mp3Path) ? `${AUDIO_ROUTE}/${key}.mp3` : null,
    durationHintS: durationHint(entry.text),
  };
}

// Deduplicates concurrent requests for the same place.
const inFlight = new Map<string, Promise<Narration>>();

export function getNarration(place: Place): Promise<Narration> {
  const key = cacheKey(place);
  let pending = inFlight.get(key);
  if (!pending) {
    pending = buildNarration(place, key).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}
