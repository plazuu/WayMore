import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { buildContext, CHAT_FALLBACK, matchPlaceId, type ChatLlm } from "../src/live/chat";
import { SessionStore } from "../src/live/session";
import type { ChatMessage } from "../src/services/openai";
import type { Place } from "../src/types";

const cacheDir = mkdtempSync(path.join(os.tmpdir(), "tour-chat-test-"));

beforeEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  delete process.env.PUBLIC_BASE_URL;
  Object.assign(process.env, { AUDIO_CACHE_DIR: cacheDir, MOCK_LLM: "1", MOCK_TTS: "1" });
  delete process.env.OPENAI_API_KEY;
});

after(() => rmSync(cacheDir, { recursive: true, force: true }));

/** Turns mock mode off; the injected chatLlm stands in for OpenAI. */
function useLlm() {
  process.env.MOCK_LLM = "0";
  process.env.OPENAI_API_KEY = "test-key";
}

const places: Place[] = [
  { id: "kaseya", name: "Kaseya Center", kind: "landmark", tagline: "Home of the Miami Heat", lat: 25.7814, lng: -80.187 },
  { id: "bayside", name: "Bayside Marketplace", kind: "landmark", lat: 25.7785, lng: -80.1868 },
  { id: "tower", name: "Freedom Tower", kind: "landmark", lat: 25.7797, lng: -80.1897 },
];
const CAR = { lat: 25.776, lng: -80.1882, heading: 0, speedMps: 8 };

async function setup(llm?: ChatLlm, chatTimeoutMs?: number) {
  // Narration isn't under test here; keep it offline.
  const store = new SessionStore({
    narrate: async (p) => ({ placeId: p.id, text: `Line for ${p.name}`, audioUrl: null, durationHintS: 2 }),
  });
  const app = createApp({ store, chatLlm: llm, chatTimeoutMs });
  const sessionId = (await request(app).post("/tour/start").send({ places }).expect(200)).body.sessionId;
  await request(app).post("/tour/tick").send({ sessionId, ...CAR }).expect(200);
  const ask = async (message: string) =>
    (await request(app).post("/tour/chat").send({ sessionId, message }).expect(200)).body;
  return { app, store, sessionId, session: store.get(sessionId)!, ask };
}

test("chat returns the reply, the matched place and the grounding sources", async () => {
  useLlm();
  let seen: { system: string; messages: ChatMessage[]; grounding: boolean } | null = null;
  const llm: ChatLlm = async (system, messages, opts) => {
    seen = { system, messages, grounding: opts.grounding };
    return {
      text: "The **Heat** have played at Kaseya Center since it opened in 1999!",
      sources: [{ title: "nba.com", url: "https://www.nba.com/heat/arena" }],
    };
  };
  const { ask } = await setup(llm);
  const res = await ask("How long has the Heat played there?");
  assert.deepEqual(res, {
    reply: "The Heat have played at Kaseya Center since it opened in 1999!",
    placeId: "kaseya",
    sources: [{ title: "nba.com", url: "https://www.nba.com/heat/arena" }],
  });
  assert.ok(seen!.grounding);
  assert.match(seen!.system, /not sure/);
  assert.match(seen!.system, /prices, opening hours, or phone numbers/);
  const last = seen!.messages.at(-1)!;
  assert.equal(last.role, "user");
  assert.match(last.text, /Car position: 25\.776/);
  assert.match(last.text, /Kaseya Center \(landmark, \d+ m away\)/);
  assert.match(last.text, /How long has the Heat played there\?$/);
});

test("context includes the last 3 narrated places with what was said", async () => {
  const { session } = await setup();
  for (const [i, name] of ["A", "B", "C", "D"].entries()) {
    session.narrated.push({ placeId: name, name, side: "left", text: `Line ${name}`, at: i });
  }
  const ctx = buildContext(session);
  assert.doesNotMatch(ctx, /Line A/);
  assert.match(ctx, /- B \(on the left\): Line B\n- C \(on the left\): Line C\n- D \(on the left\): Line D/);
});

test("chat history is capped at 10 turns and sent as prior messages", async () => {
  useLlm();
  const lengths: number[] = [];
  const llm: ChatLlm = async (_s, messages) => {
    lengths.push(messages.length);
    return { text: `Answer ${lengths.length}.`, sources: [] };
  };
  const { ask, session } = await setup(llm);
  for (let i = 1; i <= 12; i++) await ask(`Question ${i}`);
  assert.equal(session.chat.length, 10);
  assert.equal(session.chat[0].user, "Question 3");
  assert.equal(session.chat[9].reply, "Answer 12.");
  assert.equal(lengths[0], 1);
  assert.equal(lengths.at(-1), 21); // 10 turns x 2 + the new question
});

test("placeId: names in the question or reply, nearest wins, null if none", async () => {
  const { session } = await setup();
  assert.equal(matchPlaceId(session, "What's the Freedom Tower?", "It's a landmark."), "tower");
  // Bayside is nearer to the car than Kaseya.
  assert.equal(matchPlaceId(session, "Kaseya Center or Bayside Marketplace?", ""), "bayside");
  assert.equal(matchPlaceId(session, "Any good tacos?", "Not sure, sorry."), null);
  // Whole-name match only.
  assert.equal(matchPlaceId(session, "Is there a freedom parade?", ""), null);
});

test("an LLM failure gives the fallback reply, no sources, no 5xx", async () => {
  useLlm();
  const { ask, session } = await setup(async () => {
    throw new Error("503 overloaded");
  });
  const res = await ask("What's that building?");
  assert.deepEqual(res, { reply: CHAT_FALLBACK, placeId: null, sources: [] });
  assert.equal(session.chat.length, 0, "fallbacks aren't kept in history");
});

test("a 429 on the grounded call retries once without grounding", async () => {
  useLlm();
  const calls: boolean[] = [];
  const { ask } = await setup(async (system, _m, opts) => {
    calls.push(opts.grounding);
    if (opts.grounding) throw Object.assign(new Error("quota"), { status: 429 });
    assert.doesNotMatch(system, /web search/);
    return { text: "Since 2000, I think, but I'm not totally sure.", sources: [] };
  });
  const res = await ask("How long has the Heat played there?");
  assert.deepEqual(calls, [true, false]);
  assert.equal(res.reply, "Since 2000, I think, but I'm not totally sure.");
});

test("other errors don't retry", async () => {
  useLlm();
  let calls = 0;
  const { ask } = await setup(async () => {
    calls++;
    throw Object.assign(new Error("bad"), { status: 500 });
  });
  assert.equal((await ask("Hi")).reply, CHAT_FALLBACK);
  assert.equal(calls, 1);
});

test("a slow LLM times out into the fallback reply", async () => {
  useLlm();
  const { ask } = await setup(() => new Promise(() => {}), 30);
  assert.equal((await ask("Hello?")).reply, CHAT_FALLBACK);
});

test("mock mode answers without calling the LLM", async () => {
  let called = false;
  const { ask } = await setup(async () => {
    called = true;
    return { text: "x", sources: [] };
  });
  const res = await ask("What's around?");
  assert.equal(called, false);
  assert.match(res.reply, /offline mode/);
  assert.equal(res.placeId, "bayside");
  assert.deepEqual(res.sources, []);
});

test("messages over 500 chars get 400 message_too_long", async () => {
  const { app, sessionId } = await setup();
  const res = await request(app)
    .post("/tour/chat")
    .send({ sessionId, message: "a".repeat(501) })
    .expect(400);
  assert.equal(res.body.error, "message_too_long");
  assert.equal(typeof res.body.message, "string");
  await request(app).post("/tour/chat").send({ sessionId, message: "a".repeat(500) }).expect(200);
});
