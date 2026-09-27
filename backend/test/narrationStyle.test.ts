import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { SessionStore } from "../src/live/session";
import { INTRO_ID, INTRO_TEXT } from "../src/narration/intro";
import { buildUserPrompt, openingStyle, SYSTEM_PROMPT } from "../src/narration/prompts";
import { countWords, sideIsConsistent } from "../src/narration/scriptWriter";
import type { Narration, Place } from "../src/types";

const cacheDir = mkdtempSync(path.join(os.tmpdir(), "narration-style-test-"));
before(() => Object.assign(process.env, { AUDIO_CACHE_DIR: cacheDir, MOCK_LLM: "1", MOCK_TTS: "1" }));
after(() => rmSync(cacheDir, { recursive: true, force: true }));

const place = (id: string, side?: Place["side"]): Place => ({ id, name: `Place ${id}`, kind: "landmark", lat: 25.78, lng: -80.19, side });

// --- intro ---

test("the intro is short and introduces the copilot", () => {
  assert.ok(countWords(INTRO_TEXT) <= 25, `${countWords(INTRO_TEXT)} words`);
  assert.match(INTRO_TEXT, /scenic copilot/);
});

test("GET /narration/intro returns the greeting as a narration (no audio in mock mode)", async () => {
  const res = await request(createApp()).get("/narration/intro").expect(200);
  assert.equal(res.body.placeId, INTRO_ID);
  assert.equal(res.body.text, INTRO_TEXT);
  assert.equal(res.body.audioUrl, null);
  assert.ok(res.body.durationHintS > 0);
});

const intro = async (): Promise<Narration> => ({ placeId: INTRO_ID, text: INTRO_TEXT, audioUrl: null, durationHintS: 8 });

test("the live guide delivers the intro on the first tick, before any place", async () => {
  const store = new SessionStore({ intro, narrate: async (p) => ({ placeId: p.id, text: `Line ${p.name}`, audioUrl: null, durationHintS: 2 }) });
  const app = createApp({ store });
  const { sessionId } = (await request(app).post("/tour/start").send({ places: [place("a")] }).expect(200)).body;
  await store.idle(store.get(sessionId)!);
  const first = (await request(app).post("/tour/tick").send({ sessionId, lat: 25.78, lng: -80.19 }).expect(200)).body;
  assert.equal(first.narration?.placeId, INTRO_ID);
  await store.idle(store.get(sessionId)!);
  const second = (await request(app).post("/tour/tick").send({ sessionId, lat: 25.78, lng: -80.19 }).expect(200)).body;
  assert.equal(second.narration?.placeId, "a", "the place follows the intro");
});

test("an intro that's ready only after a place was narrated is dropped", async () => {
  const store = new SessionStore({ intro });
  const s = store.create([place("a")]);
  await store.idle(s);
  s.narrated.push({ placeId: "a", name: "Place a", side: "ahead", text: "x", at: 0 });
  assert.equal(store.tick(s, { lat: 0, lng: 0 }).narration, null);
});

test("sessions without places (the app's chat) get no intro", async () => {
  let calls = 0;
  const store = new SessionStore({ intro: async () => (calls++, intro()) });
  store.create([]);
  assert.equal(calls, 0);
});

// --- openers ---

test("the prompt bans the old crutch openers and asks for variety", () => {
  assert.match(SYSTEM_PROMPT, /Never open with "Coming up" or "Up ahead"/);
  assert.match(SYSTEM_PROMPT, /vary your sentence structure/);
  assert.match(SYSTEM_PROMPT, /Never from made-up trivia/);
});

test("each place gets a stable opening style, and places differ", () => {
  assert.equal(openingStyle(place("kaseya", "right")), openingStyle(place("kaseya", "right")));
  const styles = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => openingStyle(place(id, "right"))));
  assert.ok(styles.size >= 3, `only ${styles.size} different styles`);
});

test("opening styles never name the wrong side, and unknown sides name none", () => {
  const ids = Array.from({ length: 40 }, (_, i) => `p${i}`);
  for (const id of ids) {
    for (const side of ["left", "right", "ahead", undefined] as const) {
      const style = openingStyle(place(id, side));
      assert.ok(sideIsConsistent(style, side), `${side}: ${style}`);
      assert.doesNotMatch(style, /coming up|up ahead/i);
    }
  }
});

test("the user prompt carries the side and the opening style", () => {
  const prompt = buildUserPrompt(place("kaseya", "right"));
  assert.match(prompt, /Side of the car: right/);
  assert.match(prompt, /Opening style: /);
  assert.match(buildUserPrompt(place("x")), /Side of the car: unknown/);
});

test("passenger side counts as right and driver's side as left", () => {
  assert.ok(sideIsConsistent("Glance out the passenger-side window at Freedom Tower.", "right"));
  assert.ok(!sideIsConsistent("Glance out the passenger window at Freedom Tower.", "left"));
  assert.ok(sideIsConsistent("If you look out the driver's side, that's Freedom Tower.", "left"));
  assert.ok(!sideIsConsistent("If you look out the driver's side, that's Freedom Tower.", "right"));
  assert.ok(!sideIsConsistent("Look left for Freedom Tower.", "right"));
  assert.ok(!sideIsConsistent("Out the passenger window, Freedom Tower.", undefined));
});
