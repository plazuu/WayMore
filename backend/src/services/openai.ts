import OpenAI from "openai";
import { llmConfig, OPENAI_REASONING_TOKEN_ALLOWANCE, openaiReasoningEffort } from "../config";

// The LLM behind narration and chat: generate() writes narration lines,
// chat() answers the chat agent. Both use the Responses API and return plain text.

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface Source {
  title: string;
  url: string;
}

export function isLlmAvailable(): boolean {
  return !llmConfig().mock;
}

/** "openai:<model>" — part of the narration cache key, so a model change regenerates text. */
export function llmSignature(): string {
  return `openai:${llmConfig().narrationModel}`;
}

/** A 429 or an insufficient_quota error: never worth retrying the same call. */
export function isRateLimitOrQuota(err: unknown): boolean {
  const e = err as { status?: number; code?: unknown; type?: unknown; message?: unknown; error?: { code?: unknown; type?: unknown } };
  if (e?.status === 429) return true;
  return [e?.code, e?.type, e?.error?.code, e?.error?.type, e?.message].some(
    (v) => typeof v === "string" && v.includes("insufficient_quota"),
  );
}

/**
 * True when a web-search chat call failed because search itself is
 * unavailable (rate limit, quota, or the tool isn't supported for this
 * model/key). The caller then answers without search straight away; the
 * grounded call is never retried (the client has maxRetries: 0).
 */
export function isSearchUnavailable(err: unknown): boolean {
  if (isRateLimitOrQuota(err)) return true;
  const status = (err as { status?: number }).status;
  const message = String((err as Error)?.message ?? "");
  return (status === 400 || status === 403 || status === 404) && /web_search|tool/i.test(message);
}

/** The slice of the SDK client we use, so tests can inject a fake. */
export interface OpenAIClientLike {
  responses: {
    create(body: Record<string, unknown>, options?: { signal?: AbortSignal; timeout?: number }): Promise<unknown>;
  };
}

let client: OpenAIClientLike | null = null;
let clientKey = "";
let override: OpenAIClientLike | null = null;

/** Tests only: route every call to a fake client (null restores the real one). */
export function setOpenAIClientForTests(fake: OpenAIClientLike | null) {
  override = fake;
}

function getClient(apiKey: string): OpenAIClientLike {
  if (override) return override;
  if (!client || clientKey !== apiKey) {
    // No SDK retries: chat has its own retry/fallback inside a fixed time budget.
    client = new OpenAI({ apiKey, maxRetries: 0, timeout: 15_000 }) as unknown as OpenAIClientLike;
    clientKey = apiKey;
  }
  return client;
}

/**
 * Reasoning models reject temperature; they get the lowest effort they accept
 * and extra output tokens for their reasoning.
 */
function modelParams(model: string, temperature: number, maxTokens: number, webSearch: boolean) {
  const effort = openaiReasoningEffort(model, webSearch);
  return effort
    ? { reasoning: { effort }, max_output_tokens: maxTokens + OPENAI_REASONING_TOKEN_ALLOWANCE }
    : { temperature, max_output_tokens: maxTokens };
}

interface ResponseLike {
  output_text?: string;
  output?: {
    type: string;
    content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] }[];
  }[];
  usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };
}

function textOf(res: ResponseLike): string {
  if (typeof res.output_text === "string") return res.output_text;
  const parts: string[] = [];
  for (const item of res.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) if (c.type === "output_text" && c.text) parts.push(c.text);
  }
  return parts.join("");
}

/** url_citation annotations -> sources, deduped by url, in order of appearance. */
export function sourcesOf(res: ResponseLike): Source[] {
  const sources: Source[] = [];
  for (const item of res.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      for (const a of c.annotations ?? []) {
        if (a.type !== "url_citation" || !a.url || sources.some((s) => s.url === a.url)) continue;
        let title = a.title?.trim();
        if (!title) {
          try {
            title = new URL(a.url).hostname;
          } catch {
            title = a.url;
          }
        }
        sources.push({ title, url: a.url });
      }
    }
  }
  return sources;
}

function logUsage(kind: string, model: string, res: ResponseLike, ms: number) {
  const u = res.usage;
  if (!u) return;
  const reasoning = u.output_tokens_details?.reasoning_tokens;
  console.log(
    `[openai] ${kind} ${model} ${ms} ms, tokens in ${u.input_tokens} / out ${u.output_tokens}` +
      (reasoning ? ` (${reasoning} reasoning)` : ""),
  );
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  /** Overrides OPENAI_NARRATION_MODEL (tests, benchmarks). */
  model?: string;
}

export async function generate(
  system: string,
  prompt: string,
  { temperature = 0.7, maxTokens = 200, model }: GenerateOptions = {},
): Promise<string> {
  const cfg = llmConfig();
  if (cfg.mock) throw new Error("OpenAI is in mock mode (MOCK_LLM set or OPENAI_API_KEY missing)");
  const m = model || cfg.narrationModel;
  const started = Date.now();
  const res = (await getClient(cfg.apiKey).responses.create({
    model: m,
    instructions: system,
    input: prompt,
    ...modelParams(m, temperature, maxTokens, false),
  })) as ResponseLike;
  logUsage("narration", m, res, Date.now() - started);
  return textOf(res);
}

export interface ChatOptions {
  /** Overrides OPENAI_CHAT_MODEL (tests, benchmarks). */
  model?: string;
  /** Enables the web_search tool. Plain-text output either way. */
  grounding: boolean;
  timeoutMs: number;
  temperature?: number;
  maxTokens?: number;
}

export async function chat(
  system: string,
  messages: ChatMessage[],
  { model, grounding, timeoutMs, temperature = 0.6, maxTokens = 400 }: ChatOptions,
): Promise<{ text: string; sources: Source[] }> {
  const cfg = llmConfig();
  if (cfg.mock) throw new Error("OpenAI is in mock mode (MOCK_LLM set or OPENAI_API_KEY missing)");
  const m = model || cfg.chatModel;
  const started = Date.now();
  const res = (await getClient(cfg.apiKey).responses.create(
    {
      model: m,
      instructions: system,
      input: messages.map((msg) => ({ role: msg.role, content: msg.text })),
      ...(grounding ? { tools: [{ type: "web_search", search_context_size: "low" }] } : {}),
      ...modelParams(m, temperature, maxTokens, grounding),
    },
    { signal: AbortSignal.timeout(timeoutMs), timeout: timeoutMs },
  )) as ResponseLike;
  logUsage(grounding ? "chat+search" : "chat", m, res, Date.now() - started);
  return { text: textOf(res), sources: sourcesOf(res) };
}
