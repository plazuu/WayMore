import path from "node:path";

// Read lazily (on every call) so tests and scripts can adjust process.env
// after import.

function flag(value: string | undefined): boolean {
  return value !== undefined && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export type TtsProvider = "speechify" | "elevenlabs";

export function ttsConfig() {
  const provider: TtsProvider =
    process.env.TTS_PROVIDER === "elevenlabs" ? "elevenlabs" : "speechify";
  const speechify = {
    apiKey: process.env.SPEECHIFY_API_KEY ?? "",
    voiceId: process.env.SPEECHIFY_VOICE_ID || "chase",
    model: process.env.SPEECHIFY_MODEL || "simba-3.2",
    rate: process.env.SPEECHIFY_RATE || "+10%",
    // Empty string is meaningful here: no emotion style wrapper.
    emotion: process.env.SPEECHIFY_EMOTION ?? "energetic",
  };
  const elevenlabs = {
    apiKey: process.env.ELEVENLABS_API_KEY ?? "",
    voiceId: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
    model: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
  };
  const activeKey = provider === "speechify" ? speechify.apiKey : elevenlabs.apiKey;
  return {
    provider,
    speechify,
    elevenlabs,
    mock: flag(process.env.MOCK_TTS) || !activeKey,
    // Simultaneous TTS requests. Speechify's base plan allows only 1.
    concurrency: Math.max(1, Number(process.env.TTS_CONCURRENCY) || 1),
  };
}

export function audioCacheDir(): string {
  return path.resolve(process.cwd(), process.env.AUDIO_CACHE_DIR || "data/audio_cache");
}

// --- Live guide (/tour/*) ---
// Every tunable for live narration and the chat agent lives here, so each is
// a one-line change. Model names can also be overridden from .env.
export const LIVE_GUIDE = {
  /** A place triggers when the car will reach it within this many seconds... */
  triggerEtaS: 40,
  /** ...or is at most this far away. */
  triggerDistanceM: 250,
  /** Speed floor for the ETA, so a stopped car doesn't get an infinite ETA. */
  etaMinSpeedMps: 5,
  /** A place counts as "in front" when its bearing is within this many degrees of the heading. */
  inFrontHalfAngleDeg: 100,
  /** Within this many degrees of the heading, side is "ahead" instead of left/right. */
  aheadHalfAngleDeg: 20,
  /** Below this speed the device heading is treated as unknown. */
  minHeadingSpeedMps: 2,
  /** Minimum movement before a heading is derived from consecutive positions. */
  minMoveForHeadingM: 10,
  /** Hard cap on how long a ready narration waits for a tick before it's dropped. */
  readyMaxAgeS: 45,
  /** A queued/ready narration is dropped after its distance grows this many ticks in a row. */
  distanceGrowTicks: 2,
  /** Sessions expire this long after their last request. */
  sessionTtlMs: 2 * 60 * 60 * 1000,
  /** Chat: give up on the LLM after this long and send the fallback reply. */
  chatTimeoutMs: 12_000,
  chatMaxMessageChars: 500,
  /** Chat turns (question + reply) kept per session and sent as context. */
  chatHistoryTurns: 10,
  /** Chat uses OpenAI's web_search tool for grounded answers with sources. */
  chatGrounding: true,
};

// --- "Where to?" destination guide (/guide/destination) ---
export const GUIDE = {
  /** Conversations expire this long after their last request. */
  conversationTtlMs: 30 * 60 * 1000,
  maxMessageChars: 500,
  /** Turns (user message + reply) kept per conversation, for the LLM's context. */
  historyTurns: 4,
  /** Place search via server/'s POST /places/nearby. */
  searchRadiusMeters: 3000,
  /** "Search farther" after no results. */
  widenedRadiusMeters: 12_000,
  resultsLimit: 5,
  surprise: { radiusMeters: 5000, minRating: 4.5, limit: 3 },
  /** A repeat of the same search within this window reuses its results. */
  repeatSearchWindowMs: 2000,
  /** Must leave room for the LLM budget inside server/'s 20 s proxy timeout. */
  placesTimeoutMs: 6000,
};

/** server/'s base URL; the guide's place search lives there (it holds the Google key). */
export function serverUrl(): string {
  return (process.env.SERVER_URL || "http://localhost:3000").replace(/\/+$/, "");
}

// Picked by benchmarking the key's mini/nano models (see TODO.md M3): 4.1-nano
// writes the most natural spoken lines in ~1-2 s; 4o-mini supports web_search
// and answers with a cited source in ~3 s. Neither is a reasoning model.
const NARRATION_MODEL_DEFAULT = "gpt-4.1-nano";
const CHAT_MODEL_DEFAULT = "gpt-4o-mini";

/**
 * Lowest reasoning effort each OpenAI reasoning-model family accepts (null =
 * not a reasoning model). gpt-5 / -mini / -nano reject "minimal" together with
 * web_search; gpt-5.1 and later accept "none".
 */
export function openaiReasoningEffort(model: string, webSearch: boolean): "none" | "minimal" | "low" | null {
  if (/^gpt-5\.\d/.test(model) || /^gpt-[6-9]/.test(model)) return "none";
  if (/^gpt-5(-|$)/.test(model) && !/^gpt-5-chat/.test(model)) return webSearch ? "low" : "minimal";
  if (/^o\d/.test(model)) return "low";
  return null;
}

/** Extra output budget for reasoning models, so reasoning tokens can't crowd out the reply. */
export const OPENAI_REASONING_TOKEN_ALLOWANCE = 1024;

/**
 * OpenAI writes narration lines and answers chat. Mock mode (template lines,
 * offline chat reply) is on when MOCK_LLM is set or OPENAI_API_KEY is missing.
 */
export function llmConfig() {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  return {
    apiKey,
    narrationModel: process.env.OPENAI_NARRATION_MODEL || NARRATION_MODEL_DEFAULT,
    chatModel: process.env.OPENAI_CHAT_MODEL || CHAT_MODEL_DEFAULT,
    mock: flag(process.env.MOCK_LLM) || !apiKey,
  };
}
