import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { audioCacheDir } from "../config";
import type { Narration } from "../types";
import { AUDIO_ROUTE } from "./cache";
import { durationHint } from "./scriptWriter";
import { isTtsAvailable, synthesizeToFile, voiceSignature } from "./tts";

export const INTRO_ID = "intro";

// Fixed, not written by the LLM: it states nothing about any place, so there's
// nothing to get wrong, and one voiced copy serves every trip. Under 25 words.
export const INTRO_TEXT =
  "Hey, I'm your scenic copilot! Sit back and enjoy the ride. I'll call out the cool spots as we go. Ask me anything!";

let inFlight: Promise<Narration> | null = null;

/** The trip's opening greeting, voiced once per voice setting and cached with the place clips. */
export function getIntroNarration(): Promise<Narration> {
  inFlight ??= buildIntro().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function buildIntro(): Promise<Narration> {
  const hash = createHash("sha1").update(JSON.stringify([INTRO_TEXT, ...voiceSignature()])).digest("hex").slice(0, 10);
  const key = `${INTRO_ID}-${hash}`;
  const dir = audioCacheDir();
  const mp3Path = path.join(dir, `${key}.mp3`);
  if (!existsSync(mp3Path) && isTtsAvailable()) {
    try {
      await fs.mkdir(dir, { recursive: true });
      await synthesizeToFile(INTRO_TEXT, mp3Path);
    } catch (err) {
      console.warn("[narration] intro voice failed:", (err as Error).message);
    }
  }
  return {
    placeId: INTRO_ID,
    text: INTRO_TEXT,
    audioUrl: existsSync(mp3Path) ? `${AUDIO_ROUTE}/${key}.mp3` : null,
    durationHintS: durationHint(INTRO_TEXT),
  };
}
