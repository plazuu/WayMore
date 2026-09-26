import { ttsConfig } from "../config";

const ENDPOINT = "https://api.speechify.ai/v1/audio/speech";

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

// Place names like "Bass & Co" would otherwise produce malformed SSML (HTTP 400).
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);
}

export function buildSsml(text: string, opts: { rate: string; emotion?: string }): string {
  let body = escapeXml(text);
  if (opts.emotion) {
    body = `<speechify:style emotion="${escapeXml(opts.emotion)}">${body}</speechify:style>`;
  }
  return `<speak><prosody rate="${escapeXml(opts.rate)}">${body}</prosody></speak>`;
}

interface SpeechifyResponse {
  audio_data: string;
  audio_format: string;
  billable_characters_count?: number;
  speech_marks?: unknown;
}

export async function synthesizeSpeechify(text: string): Promise<Buffer> {
  const { speechify } = ttsConfig();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${speechify.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: buildSsml(text, { rate: speechify.rate, emotion: speechify.emotion }),
      voice_id: speechify.voiceId,
      audio_format: "mp3",
      model: speechify.model,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = new Error(`Speechify ${res.status}: ${(await res.text()).slice(0, 300)}`);
    throw Object.assign(err, { status: res.status });
  }
  const json = (await res.json()) as SpeechifyResponse;
  if (!json.audio_data) throw new Error("Speechify response had no audio_data");
  return Buffer.from(json.audio_data, "base64");
}
