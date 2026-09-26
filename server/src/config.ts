import path from "node:path";

// Read lazily (on every call) so tests and scripts can adjust process.env
// after import.

function flag(value: string | undefined): boolean {
  return value !== undefined && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export type TtsProvider = "speechify" | "elevenlabs";

export function geminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  return {
    apiKey,
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    // Mock mode is forced on when there's no key, so teammates can run without one.
    mock: flag(process.env.MOCK_LLM) || !apiKey,
  };
}

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
