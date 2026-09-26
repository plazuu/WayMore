import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { llmConfig, OPENAI_REASONING_TOKEN_ALLOWANCE, openaiReasoningEffort } from "../src/config";
import { CHAT_FALLBACK } from "../src/live/chat";
import { SessionStore } from "../src/live/session";
import { cacheKey } from "../src/narration/cache";
import { SYSTEM_PROMPT } from "../src/narration/prompts";
import { writeScript } from "../src/narration/scriptWriter";
import { isSearchUnavailable, setOpenAIClientForTests, sourcesOf, type OpenAIClientLike } from "../src/services/openai";
import type { Place } from "../src/types";

const cacheDir = mkdtempSync(path.join(os.tmpdir(), "openai-test-"));

beforeEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  for (const k of ["OPENAI_NARRATION_MODEL", "OPENAI_CHAT_MODEL", "PUBLIC_BASE_URL"]) {
    delete process.env[k];
  }
  Object.assign(process.env, { AUDIO_CACHE_DIR: cacheDir, MOCK_LLM: "0", MOCK_TTS: "1", OPENAI_API_KEY: "test-key" });
});

afterEach(() => {
  setOpenAIClientForTests(null);
});

after(() => rmSync(cacheDir, { recursive: true, force: true }));

type Body = Record<string, any>;

/** A fake OpenAI client: `respond` gets each request body and returns (or throws) the response. */
function fakeClient(respond: (body: Body, opts?: { signal?: AbortSignal }) => unknown | Promise<unknown>) {
  const bodies: Body[] = [];
  const client: OpenAIClientLike = {
    responses: {
      async create(body, opts) {
        bodies.push(body);
        return respond(body, opts);
      },
    },
  };
  setOpenAIClientForTests(client);
  return bodies;
}

function message(text: string, citations: { url: string; title?: string }[] = []) {
  return {
    output: [
      { type: "web_search_call" },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text,
            annotations: citations.map((c) => ({ type: "url_citation", start_index: 0, end_index: 1, ...c })),
          },
        ],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

const kaseya: Place = {
  id: "kaseya",
  name: "Kaseya Center",
  kind: "landmark",
  tagline: "Home of the Miami Heat",
  lat: 25.7814,
  lng: -80.187,
  side: "right",
};

const places: Place[] = [
  { id: "kaseya", name: "Kaseya Center", kind: "landmark", lat: 25.7814, lng: -80.187 },
  { id: "bayside", name: "Bayside Marketplace", kind: "landmark", lat: 25.7785, lng: -80.1868 },
];

async function chatSetup(chatTimeoutMs?: number) {
  const store = new SessionStore({
    narrate: async (p) => ({ placeId: p.id, text: `Line for ${p.name}`, audioUrl: null, durationHintS: 2 }),
  });
  const app = createApp({ store, chatTimeoutMs });
  const sessionId = (await request(app).post("/tour/start").send({ places }).expect(200)).body.sessionId;
  await request(app).post("/tour/tick").send({ sessionId, lat: 25.776, lng: -80.1882, heading: 0, speedMps: 8 });
  const ask = async (message: string) =>
    (await request(app).post("/tour/chat").send({ sessionId, message }).expect(200)).body;
  return { app, ask };
}

// --- config ---

test("mock mode is on without OPENAI_API_KEY or with MOCK_LLM", () => {
  assert.equal(llmConfig().mock, false);
  process.env.MOCK_LLM = "1";
  assert.equal(llmConfig().mock, true);
  process.env.MOCK_LLM = "0";
  delete process.env.OPENAI_API_KEY;
  assert.equal(llmConfig().mock, true);
});

test("model names come from env overrides", () => {
  process.env.OPENAI_NARRATION_MODEL = "n-model";
  process.env.OPENAI_CHAT_MODEL = "c-model";
  assert.equal(llmConfig().narrationModel, "n-model");
  assert.equal(llmConfig().chatModel, "c-model");
});

// --- narration ---

test("narration: OpenAI text flows through the cleaner and guardrails", async () => {
  const bodies = fakeClient(() => ({
    output_text: '**On your right** is "Kaseya Center" (the arena), home of the Miami Heat! Go Heat! 🏀',
  }));
  const script = await writeScript(kaseya);
  assert.deepEqual(script, { text: "On your right is Kaseya Center, home of the Miami Heat! Go Heat.", source: "llm" });
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].model, llmConfig().narrationModel);
  assert.equal(bodies[0].instructions, SYSTEM_PROMPT);
  assert.match(bodies[0].input, /Place name: Kaseya Center/);
  assert.equal(bodies[0].max_output_tokens, 150);
  assert.equal(bodies[0].tools, undefined);
});

test("narration: an OpenAI error or a guardrail miss falls back to the template line", async () => {
  fakeClient(() => {
    throw Object.assign(new Error("boom"), { status: 500 });
  });
  assert.deepEqual(await writeScript(kaseya), {
    text: "On your right is Kaseya Center, home of the Miami Heat.",
    source: "template",
  });
  fakeClient(() => ({ output_text: "What a building?" }));
  assert.equal((await writeScript(kaseya)).source, "template");
});

test("reasoning models get their lowest effort, extra tokens and no temperature; others get a temperature", async () => {
  const bodies = fakeClient(() => ({ output_text: "On your right is Kaseya Center, home of the Miami Heat." }));
  for (const model of ["gpt-5-nano", "gpt-5.4-nano", "gpt-4.1-nano"]) {
    process.env.OPENAI_NARRATION_MODEL = model;
    await writeScript(kaseya);
  }
  assert.deepEqual(bodies[0].reasoning, { effort: "minimal" });
  assert.equal(bodies[0].temperature, undefined);
  assert.equal(bodies[0].max_output_tokens, 150 + OPENAI_REASONING_TOKEN_ALLOWANCE);
  assert.deepEqual(bodies[1].reasoning, { effort: "none" });
  assert.equal(bodies[2].reasoning, undefined);
  assert.equal(bodies[2].temperature, 0.8);
  assert.equal(bodies[2].max_output_tokens, 150);
});

test("lowest reasoning effort per model family, and gpt-5 with web search needs low", () => {
  assert.equal(openaiReasoningEffort("gpt-5-mini", false), "minimal");
  assert.equal(openaiReasoningEffort("gpt-5-mini", true), "low");
  assert.equal(openaiReasoningEffort("gpt-5.4-mini", true), "none");
  assert.equal(openaiReasoningEffort("o4-mini", false), "low");
  assert.equal(openaiReasoningEffort("gpt-4o-mini", true), null);
  assert.equal(openaiReasoningEffort("gpt-5-chat-latest", false), null);
});

test("the narration cache key includes the model", () => {
  const before = cacheKey(kaseya);
  process.env.OPENAI_NARRATION_MODEL = "some-other-model";
  assert.notEqual(cacheKey(kaseya), before);
});

// --- chat ---

test("chat: web search on, url citations become deduped sources, history maps to assistant turns", async () => {
  const bodies = fakeClient(() =>
    message("The Heat have played at Kaseya Center since it opened in 1999.", [
      { url: "https://www.nba.com/heat/arena", title: "Heat arena" },
      { url: "https://en.wikipedia.org/wiki/Kaseya_Center", title: "Kaseya Center - Wikipedia" },
      { url: "https://www.nba.com/heat/arena", title: "Heat arena (again)" },
      { url: "https://example.com/no-title" },
    ]),
  );
  const { ask } = await chatSetup();
  const res = await ask("How long has the Heat played there?");
  assert.deepEqual(res, {
    reply: "The Heat have played at Kaseya Center since it opened in 1999.",
    placeId: "kaseya",
    sources: [
      { title: "Heat arena", url: "https://www.nba.com/heat/arena" },
      { title: "Kaseya Center - Wikipedia", url: "https://en.wikipedia.org/wiki/Kaseya_Center" },
      { title: "example.com", url: "https://example.com/no-title" },
    ],
  });
  assert.deepEqual(bodies[0].tools, [{ type: "web_search", search_context_size: "low" }]);
  assert.equal(bodies[0].model, llmConfig().chatModel);
  assert.match(bodies[0].instructions, /Use web search/);

  await ask("And before that?");
  assert.deepEqual(
    bodies[1].input.map((m: { role: string }) => m.role),
    ["user", "assistant", "user"],
  );
});

test("sourcesOf ignores non-message items and non-url annotations", () => {
  assert.deepEqual(
    sourcesOf({
      output: [
        { type: "web_search_call" },
        { type: "message", content: [{ type: "output_text", text: "x", annotations: [{ type: "file_citation" }] }] },
      ],
    }),
    [],
  );
});

test("chat: a rate limit on the web-search call retries once without web search", async () => {
  const bodies = fakeClient((body) => {
    if (body.tools) throw Object.assign(new Error("Rate limit reached"), { status: 429 });
    return message("Since 1999, I think, but I'm not totally sure.");
  });
  const { ask } = await chatSetup();
  const res = await ask("How long has the Heat played there?");
  assert.equal(res.reply, "Since 1999, I think, but I'm not totally sure.");
  assert.deepEqual(res.sources, []);
  assert.deepEqual(
    bodies.map((b) => Boolean(b.tools)),
    [true, false],
  );
  assert.doesNotMatch(bodies[1].instructions, /web search/);
  assert.match(bodies[1].instructions, /not sure/);
});

test("chat: 'tool not supported' also retries without web search; other errors don't", async () => {
  let bodies = fakeClient((body) => {
    if (body.tools) throw Object.assign(new Error("Tool 'web_search' is not supported with this model."), { status: 400 });
    return message("Answer without search.");
  });
  let { ask } = await chatSetup();
  assert.equal((await ask("Hi")).reply, "Answer without search.");
  assert.equal(bodies.length, 2);

  bodies = fakeClient(() => {
    throw Object.assign(new Error("Internal error"), { status: 500 });
  });
  ({ ask } = await chatSetup());
  assert.deepEqual(await ask("Hi"), { reply: CHAT_FALLBACK, placeId: null, sources: [] });
  assert.equal(bodies.length, 1);
});

test("chat: a timeout returns the fallback reply and aborts the request", async () => {
  let signal: AbortSignal | undefined;
  fakeClient((_body, opts) => {
    signal = opts?.signal;
    return new Promise(() => {});
  });
  const { ask } = await chatSetup(50);
  const started = Date.now();
  assert.deepEqual(await ask("Hello?"), { reply: CHAT_FALLBACK, placeId: null, sources: [] });
  assert.ok(Date.now() - started < 2000);
  assert.ok(signal, "the request gets an abort signal");
});

// --- provider switch ---

test("/health reports the models and mock mode", async () => {
  const res = await request(createApp()).get("/health").expect(200);
  assert.equal(res.body.status, "ok");
  assert.deepEqual(res.body.llm, { narrationModel: "gpt-4.1-nano", chatModel: "gpt-4o-mini", mock: false });
  assert.deepEqual(res.body.tts, { provider: "speechify", mock: true });
  process.env.MOCK_LLM = "1";
  assert.equal((await request(createApp()).get("/health")).body.llm.mock, true);
});

test("chat: citation links and markers are stripped from the reply, sources stay raw", async () => {
  fakeClient(() =>
    message(
      "The Heat have played at Kaseya Center since 1999 [1] ([nba.com](https://www.nba.com/heat/arena)). Per [Wikipedia](https://en.wikipedia.org/wiki/Kaseya_Center) it seats about 20,000 [[2]](https://example.com/a).",
      [{ url: "https://www.nba.com/heat/arena", title: "nba.com" }],
    ),
  );
  const { ask } = await chatSetup();
  const res = await ask("How long has the Heat played there?");
  assert.equal(res.reply, "The Heat have played at Kaseya Center since 1999. Per Wikipedia it seats about 20,000.");
  assert.deepEqual(res.sources, [{ title: "nba.com", url: "https://www.nba.com/heat/arena" }]);
});

test("isSearchUnavailable: 429 and insufficient_quota skip straight to no-search; other errors don't", () => {
  assert.ok(isSearchUnavailable(Object.assign(new Error("Rate limit"), { status: 429 })));
  assert.ok(isSearchUnavailable(Object.assign(new Error("You exceeded your current quota"), { code: "insufficient_quota" })));
  assert.ok(isSearchUnavailable({ error: { type: "insufficient_quota" } }));
  assert.ok(isSearchUnavailable(new Error("429 insufficient_quota")));
  assert.ok(!isSearchUnavailable(Object.assign(new Error("Internal error"), { status: 500 })));
});

test("chat: insufficient_quota on the web-search call answers without search, no second grounded call", async () => {
  const bodies = fakeClient((body) => {
    if (body.tools) throw Object.assign(new Error("You exceeded your current quota"), { status: 429, code: "insufficient_quota" });
    return message("Answer without search.");
  });
  const { ask } = await chatSetup();
  assert.equal((await ask("Hi")).reply, "Answer without search.");
  assert.deepEqual(
    bodies.map((b) => Boolean(b.tools)),
    [true, false],
  );
});
