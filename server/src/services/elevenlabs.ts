import { ttsConfig } from "../config";

export async function synthesizeElevenLabs(text: string): Promise<Buffer> {
  const { elevenlabs } = ttsConfig();
  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(elevenlabs.voiceId)}` +
    "?output_format=mp3_44100_128";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": elevenlabs.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: elevenlabs.model }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
    throw Object.assign(err, { status: res.status });
  }
  return Buffer.from(await res.arrayBuffer());
}
