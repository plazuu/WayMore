import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { cacheKey } from "../src/narration/cache";
import type { Narration, Place } from "../src/types";

const cacheDir = mkdtempSync(path.join(os.tmpdir(), "narration-test-"));
const realFetch = globalThis.fetch;

beforeEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  Object.assign(process.env, {
    AUDIO_CACHE_DIR: cacheDir,
    MOCK_LLM: "1",
    MOCK_TTS: "1",
    TTS_PROVIDER: "speechify",
    SPEECHIFY_VOICE_ID: "chase",
    SPEECHIFY_RATE: "+10%",
    SPEECHIFY_EMOTION: "energetic",
  });
  globalThis.fetch = realFetch;
});

after(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  globalThis.fetch = realFetch;
});

const places: Place[] = [
  { id: "kaseya", name: "Kaseya Center", kind: "landmark", tagline: "Home of the Miami Heat", lat: 25.78, lng: -80.19, side: "right" },
  { id: "bass", name: "Bass & Co", kind: "restaurant", lat: 25.77, lng: -80.19, side: "left" },
  { id: "tower", name: "Freedom Tower", kind: "landmark", lat: 25.78, lng: -80.19 },
];

function assertNarration(n: Narration) {
  assert.deepEqual(Object.keys(n).sort(), ["audioUrl", "durationHintS", "placeId", "text"]);
  assert.equal(typeof n.placeId, "string");
  assert.equal(typeof n.text, "string");
  assert.ok(n.audioUrl === null || typeof n.audioUrl === "string");
  assert.equal(typeof n.durationHintS, "number");
}

test("POST /narration/pregenerate returns one Narration per place (mock mode)", async () => {
  const res = await request(createApp()).post("/narration/pregenerate").send({ places }).expect(200);
  assert.equal(res.body.length, 3);
  res.body.forEach(assertNarration);
  assert.deepEqual(res.body.map((n: Narration) => n.placeId), ["kaseya", "bass", "tower"]);
  assert.equal(res.body[0].text, "On your right is Kaseya Center, home of the Miami Heat.");
  assert.ok(res.body.every((n: Narration) => n.audioUrl === null));
});

test("POST /narration returns a Narration and saves grounding facts in the cache", async () => {
  const place = { ...places[0], facts: ["Opened in 1999."] };
  const res = await request(createApp()).post("/narration").send(place).expect(200);
  assertNarration(res.body);
  const saved = JSON.parse(readFileSync(path.join(cacheDir, `${cacheKey(place)}.json`), "utf8"));
  assert.deepEqual(saved.facts, ["Opened in 1999."]);
  assert.equal(saved.text, res.body.text);
});

test("invalid bodies get 400", async () => {
  const app = createApp();
  await request(app).post("/narration").send({ id: "x", name: "X", kind: "museum", lat: 1, lng: 2 }).expect(400);
  await request(app).post("/narration/pregenerate").send({ places: [] }).expect(400);
  await request(app).post("/narration/pregenerate").send({ places: [{ id: "x" }] }).expect(400);
});

test("with TTS on: audio is generated, served at /audio, and SSML is escaped", async () => {
  process.env.MOCK_TTS = "0";
  process.env.SPEECHIFY_API_KEY = "test-key";
  const bodies: any[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ audio_data: Buffer.from("ID3fake").toString("base64"), audio_format: "mp3" }));
  }) as typeof fetch;

  const app = createApp();
  const res = await request(app).post("/narration").send(places[1]).expect(200);
  assert.match(res.body.audioUrl, /^\/audio\/bass-[0-9a-f]{10}\.mp3$/);
  assert.ok(bodies[0].input.includes("Bass &amp; Co"));
  assert.equal(bodies[0].voice_id, "chase");

  const audio = await request(app).get(res.body.audioUrl).expect(200);
  assert.equal(Buffer.from(audio.body).toString(), "ID3fake");
  await request(app).get(res.body.audioUrl.replace(".mp3", ".json")).expect(404);

  // Second call hits the cache: no new TTS request.
  await request(app).post("/narration").send(places[1]).expect(200);
  assert.equal(bodies.length, 1);
  delete process.env.SPEECHIFY_API_KEY;
});

test("text cached in mock mode gets audio only once TTS becomes available", async () => {
  const app = createApp();
  const first = await request(app).post("/narration").send(places[0]).expect(200);
  assert.equal(first.body.audioUrl, null);

  process.env.MOCK_TTS = "0";
  process.env.SPEECHIFY_API_KEY = "test-key";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ audio_data: Buffer.from("ID3").toString("base64") }));
  }) as typeof fetch;

  const second = await request(app).post("/narration").send(places[0]).expect(200);
  assert.equal(calls, 1);
  assert.equal(second.body.text, first.body.text);
  assert.ok(second.body.audioUrl && existsSync(path.join(cacheDir, path.basename(second.body.audioUrl))));
  delete process.env.SPEECHIFY_API_KEY;
});

test("a TTS failure gives audioUrl null instead of failing the request", async () => {
  process.env.MOCK_TTS = "0";
  process.env.SPEECHIFY_API_KEY = "test-key";
  globalThis.fetch = (async () => new Response("bad ssml", { status: 400 })) as typeof fetch;
  const res = await request(createApp()).post("/narration/pregenerate").send({ places }).expect(200);
  assert.ok(res.body.every((n: Narration) => n.audioUrl === null && n.text.length > 0));
  delete process.env.SPEECHIFY_API_KEY;
});

test("changing voice settings changes the cache key", () => {
  const before = cacheKey(places[0]);
  process.env.SPEECHIFY_EMOTION = "calm";
  assert.notEqual(cacheKey(places[0]), before);
  process.env.SPEECHIFY_EMOTION = "energetic";
  process.env.SPEECHIFY_RATE = "+20%";
  assert.notEqual(cacheKey(places[0]), before);
});
