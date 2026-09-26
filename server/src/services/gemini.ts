import type { GoogleGenAI } from "@google/genai" with { "resolution-mode": "import" };
import { geminiConfig } from "../config";

// Thin, reusable Gemini client. Narration uses it today; the future dialog
// agent (passenger follow-up questions) should call generate() too.

let client: GoogleGenAI | null = null;
let clientKey = "";

// @google/genai's type declarations are ESM-only, so load it with a dynamic
// import (kept as a real import() under module: node16) rather than require().
async function getClient(apiKey: string): Promise<GoogleGenAI> {
  if (!client || clientKey !== apiKey) {
    const { GoogleGenAI } = await import("@google/genai");
    client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 15_000 } });
    clientKey = apiKey;
  }
  return client;
}

export function isGeminiAvailable(): boolean {
  return !geminiConfig().mock;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

export async function generate(
  system: string,
  prompt: string,
  { temperature = 0.7, maxTokens = 200 }: GenerateOptions = {},
): Promise<string> {
  const { apiKey, model, mock } = geminiConfig();
  if (mock) throw new Error("Gemini is in mock mode (MOCK_LLM set or GEMINI_API_KEY missing)");

  const response = await (await getClient(apiKey)).models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: system,
      temperature,
      maxOutputTokens: maxTokens,
      // No thinking: keeps latency low for short outputs.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  return response.text ?? "";
}
