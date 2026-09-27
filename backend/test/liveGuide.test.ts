import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { demoPath } from "../src/live/demoPath";
import { distanceMeters, relativeAngle, sideOf } from "../src/live/geo";
import { SessionStore, type Narrate } from "../src/live/session";
import type { Narration, Place } from "../src/types";
import demoPlaces from "../data/demo-places.json";

const cacheDir = mkdtempSync(path.join(os.tmpdir(), "live-guide-test-"));
const realFetch = globalThis.fetch;

beforeEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.SPEECHIFY_API_KEY;
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

// Background generation must finish before the next test wipes the cache dir.
const stores: SessionStore[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map((s) => s.idleAll()));
});

after(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  globalThis.fetch = realFetch;
});

// Local metric offsets around downtown Miami; the car usually drives north.
const ORIGIN = { lat: 25.78, lng: -80.19 };
const M_PER_DEG = 111_320;
function at(northM: number, eastM: number) {
  return {
    lat: ORIGIN.lat + northM / M_PER_DEG,
    lng: ORIGIN.lng + eastM / (M_PER_DEG * Math.cos((ORIGIN.lat * Math.PI) / 180)),
  };
}
function place(id: string, northM: number, eastM: number, extra: Partial<Place> = {}): Place {
  return { id, name: `Place ${id.toUpperCase()}`, kind: "landmark", ...at(northM, eastM), ...extra };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(places: Place[], narrate?: Narrate) {
  let t = 1_000_000;
  const clock = { advance: (ms: number) => (t += ms) };
  const store = new SessionStore({ now: () => t, narrate });
  stores.push(store);
  const app = createApp({ store });
  return {
    app,
    store,
    clock,
    async start() {
      const res = await request(app).post("/tour/start").send({ places }).expect(200);
      return res.body.sessionId as string;
    },
    async tick(sessionId: string, northM: number, eastM: number, extra: { heading?: number; speedMps?: number } = {}) {
      const body = { sessionId, ...at(northM, eastM), heading: 0, speedMps: 10, ...extra };
      return (await request(app).post("/tour/tick").send(body).expect(200)).body;
    },
  };
}

/** A narrate() whose calls stay pending until the test resolves them. */
function controllable() {
  const calls: { place: Place; resolve: () => void }[] = [];
  let active = 0;
  let maxActive = 0;
  const narrate: Narrate = (p) =>
    new Promise<Narration>((resolve) => {
      active++;
      maxActive = Math.max(maxActive, active);
      calls.push({
        place: p,
        resolve: () => {
          active--;
          resolve({ placeId: p.id, text: `Line for ${p.name}`, audioUrl: null, durationHintS: 2 });
        },
      });
    });
  return { calls, narrate, maxActive: () => maxActive };
}

// --- geometry ---

test("side: left / right / ahead within ±20°", () => {
  assert.equal(sideOf(relativeAngle(0, 45), 20), "right");
  assert.equal(sideOf(relativeAngle(0, 315), 20), "left");
  assert.equal(sideOf(relativeAngle(0, 15), 20), "ahead");
  assert.equal(sideOf(relativeAngle(350, 5), 20), "ahead"); // wraps around north
  assert.equal(sideOf(relativeAngle(90, 180), 20), "right");
  assert.equal(sideOf(relativeAngle(90, 0), 20), "left");
});

// --- trigger rule ---

test("triggers on ETA ≤ 40 s even beyond 250 m", async () => {
  const h = setup([place("a", 350, 0)]);
  const id = await h.start();
  assert.equal((await h.tick(id, 0, 0, { speedMps: 5 })).pending, null); // ETA 70 s
  assert.equal((await h.tick(id, 0, 0, { speedMps: 10 })).pending, "a"); // ETA 35 s
});

test("triggers within 250 m even when the ETA is long", async () => {
  const h = setup([place("a", 240, 0)]);
  const id = await h.start();
  assert.equal((await h.tick(id, 0, 0, { speedMps: 3 })).pending, "a"); // ETA 80 s, 240 m
});

test("a place behind the car never triggers; one in front does", async () => {
  const h = setup([place("behind", -100, 20), place("front", 150, 20)]);
  const id = await h.start();
  assert.equal((await h.tick(id, 0, 0)).pending, "front");
  await h.store.idle(h.store.get(id)!);
  await h.tick(id, 0, 0);
  const r = await h.tick(id, 0, 0);
  assert.deepEqual(r, { narration: null, pending: null });
});

test("picks the nearest qualifying place first", async () => {
  const h = setup([place("far", 200, 0), place("near", 100, 0)]);
  const id = await h.start();
  assert.equal((await h.tick(id, 0, 0)).pending, "near");
});

test("a heritage landmark wins the trigger slot over a closer 5-star chain", async () => {
  const h = setup([
    place("tacobell", 50, 0, { name: "Taco Bell", kind: "restaurant", category: "Fast food restaurant", rating: 5 }),
    place("tower", 240, 0, { name: "Freedom Tower", category: "Historical landmark", rating: 4.2 }),
  ]);
  const id = await h.start();
  assert.equal((await h.tick(id, 0, 0)).pending, "tower");
});

test("a local spot beats a chain; a chain still narrates when nothing else qualifies", async () => {
  const h = setup([
    place("mcd", 30, 0, { name: "McDonald's", kind: "restaurant", category: "Burger", rating: 4.9 }),
    place("local", 200, 0, { name: "Versailles", kind: "restaurant", category: "Cuban", rating: 4.4 }),
  ]);
  const id = await h.start();
  assert.equal((await h.tick(id, 0, 0)).pending, "local");

  const alone = setup([place("mcd", 30, 0, { name: "McDonald's", kind: "restaurant", rating: 4.9 })]);
  const aloneId = await alone.start();
  assert.equal((await alone.tick(aloneId, 0, 0)).pending, "mcd");
});

test("rating must be a number when given", async () => {
  const h = setup([]);
  await request(h.app)
    .post("/tour/start")
    .send({ places: [place("a", 0, 0, { rating: "5" as unknown as number })] })
    .expect(400);
});

test("tick returns pending, then the narration exactly once, and never re-triggers", async () => {
  const h = setup([place("a", 200, 100, { name: "Kaseya Center", tagline: "Home of the Miami Heat" })]);
  const id = await h.start();
  const first = await h.tick(id, 0, 0);
  assert.deepEqual(first, { narration: null, pending: "a" });
  await h.store.idle(h.store.get(id)!);

  const second = await h.tick(id, 10, 0);
  assert.equal(second.pending, null);
  assert.deepEqual(second.narration, {
    placeId: "a",
    name: "Kaseya Center",
    side: "right",
    text: "On your right is Kaseya Center, home of the Miami Heat.",
    audioUrl: null,
    durationHintS: second.narration.durationHintS,
  });
  assert.equal(typeof second.narration.durationHintS, "number");

  for (let i = 0; i < 3; i++) {
    assert.deepEqual(await h.tick(id, 20 + i * 10, 0), { narration: null, pending: null });
  }
});

// --- heading fallbacks ---

test("negative heading is unknown: side is ahead and the in-front check is skipped", async () => {
  const h = setup([place("a", -100, 100)]); // behind-right if heading were north
  const id = await h.start();
  assert.equal((await h.tick(id, 0, 0, { heading: -1 })).pending, "a");
  await h.store.idle(h.store.get(id)!);
  assert.equal((await h.tick(id, 0, 0, { heading: -1 })).narration.side, "ahead");
});

test("heading is ignored below 2 m/s", async () => {
  const h = setup([place("a", 100, 100)]);
  const id = await h.start();
  await h.tick(id, 0, 0, { heading: 0, speedMps: 1 });
  await h.store.idle(h.store.get(id)!);
  assert.equal((await h.tick(id, 0, 0, { heading: 0, speedMps: 1 })).narration.side, "ahead");
});

test("heading is derived from movement of at least 10 m", async () => {
  const h = setup([place("a", 420, 200)]);
  const id = await h.start();
  // No speed: ETA uses 5 m/s → 93 s, no trigger.
  assert.equal((await h.tick(id, 0, 0, { heading: -1, speedMps: undefined })).pending, null);
  // Moved 20 m north with an unusable heading: derived heading 0°, place is ~27° right.
  assert.equal((await h.tick(id, 20, 0, { heading: -1, speedMps: 20 })).pending, "a");
  await h.store.idle(h.store.get(id)!);
  assert.equal((await h.tick(id, 40, 0, { heading: -1, speedMps: 20 })).narration.side, "right");
  assert.equal(h.store.get(id)!.heading, 0);
});

test("movement under 10 m doesn't derive a heading", async () => {
  const h = setup([place("a", 100, 100)]);
  const id = await h.start();
  await h.tick(id, 0, 0, { heading: -1 });
  await h.tick(id, 5, 0, { heading: -1 });
  assert.equal(h.store.get(id)!.heading, null);
});

// --- staleness ---

test("a ready narration is dropped once the place is behind the car", async () => {
  const c = controllable();
  const h = setup([place("a", 200, 50)], c.narrate);
  const id = await h.start();
  await h.tick(id, 0, 0);
  c.calls[0].resolve();
  await h.store.idle(h.store.get(id)!);
  assert.deepEqual(await h.tick(id, 300, 0), { narration: null, pending: null });
  assert.deepEqual(await h.tick(id, 310, 0), { narration: null, pending: null });
});

test("a ready narration is dropped after its distance grows for 2 ticks", async () => {
  const c = controllable();
  const h = setup([place("a", 200, 0)], c.narrate);
  const id = await h.start();
  await h.tick(id, 0, 0);
  // Reported heading says north, but the car is actually moving away (south).
  await h.tick(id, -20, 0);
  await h.tick(id, -40, 0);
  c.calls[0].resolve();
  await h.store.idle(h.store.get(id)!);
  assert.deepEqual(await h.tick(id, -60, 0), { narration: null, pending: null });
});

test("one growing tick is not enough to drop", async () => {
  const c = controllable();
  const h = setup([place("a", 200, 0)], c.narrate);
  const id = await h.start();
  await h.tick(id, 0, 0);
  await h.tick(id, -20, 0);
  c.calls[0].resolve();
  await h.store.idle(h.store.get(id)!);
  assert.equal((await h.tick(id, -20, 0)).narration?.placeId, "a");
});

test("a ready narration older than 45 s is dropped", async () => {
  const c = controllable();
  const h = setup([place("a", 200, 0)], c.narrate);
  const id = await h.start();
  await h.tick(id, 0, 0);
  c.calls[0].resolve();
  await h.store.idle(h.store.get(id)!);
  h.clock.advance(46_000);
  assert.deepEqual(await h.tick(id, 0, 0), { narration: null, pending: null });
});

test("a queued place that fell behind is skipped when dequeued", async () => {
  const c = controllable();
  const h = setup([place("a", 100, 0), place("b", 150, 30)], c.narrate);
  const id = await h.start();
  assert.equal((await h.tick(id, 0, 0)).pending, "a");
  assert.equal((await h.tick(id, 0, 0)).pending, "a"); // b queued behind a
  await h.tick(id, 250, 0); // passed both
  c.calls[0].resolve();
  await h.store.idle(h.store.get(id)!);
  assert.equal(c.calls.length, 1, "b must not be generated");
  assert.deepEqual(await h.tick(id, 260, 0), { narration: null, pending: null });
});

test("a queued place whose distance grew 2 ticks is skipped when dequeued", async () => {
  const c = controllable();
  const h = setup([place("a", 100, 0), place("b", 150, 0)], c.narrate);
  const id = await h.start();
  await h.tick(id, 0, 0);
  await h.tick(id, 0, 0);
  await h.tick(id, -20, 0);
  await h.tick(id, -40, 0);
  c.calls[0].resolve();
  await h.store.idle(h.store.get(id)!);
  assert.equal(c.calls.length, 1);
});

test("only one generation runs at a time per session", async () => {
  const c = controllable();
  const h = setup([place("a", 100, 0), place("b", 150, 30), place("c", 200, -30)], c.narrate);
  const id = await h.start();
  await h.tick(id, 0, 0);
  await h.tick(id, 0, 0);
  await h.tick(id, 0, 0);
  await flush();
  assert.equal(c.calls.length, 1);
  c.calls[0].resolve();
  await flush();
  assert.equal(c.calls.length, 2);
  assert.equal((await h.tick(id, 0, 0)).narration.placeId, "a");
  c.calls[1].resolve();
  await flush();
  c.calls[2].resolve();
  await h.store.idle(h.store.get(id)!);
  assert.equal(c.maxActive(), 1);
  assert.deepEqual(
    c.calls.map((x) => x.place.id),
    ["a", "b", "c"],
  );
});

// --- disk cache and URLs ---

function mockSpeechify() {
  let calls = 0;
  process.env.MOCK_TTS = "0";
  process.env.SPEECHIFY_API_KEY = "test-key";
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ audio_data: Buffer.from("ID3").toString("base64") }));
  }) as typeof fetch;
  return () => calls;
}

async function driveOnce(places: Place[]) {
  const h = setup(places);
  const id = await h.start();
  await h.tick(id, 0, 0);
  await h.store.idle(h.store.get(id)!);
  return { h, narration: (await h.tick(id, 10, 0)).narration };
}

test("disk cache is reused by a fresh store (server restart), and audio URLs are relative by default", async () => {
  const calls = mockSpeechify();
  const places = [place("kaseya", 200, 100)];
  const first = await driveOnce(places);
  assert.match(first.narration.audioUrl, /^\/audio\/kaseya-[0-9a-f]{10}\.mp3$/);
  assert.equal(calls(), 1);
  await request(first.h.app).get(first.narration.audioUrl).expect(200);

  const second = await driveOnce(places);
  assert.equal(calls(), 1, "no new TTS call after reload");
  assert.equal(second.narration.audioUrl, first.narration.audioUrl);
});

test("the cache key includes the side", async () => {
  const calls = mockSpeechify();
  await driveOnce([place("x", 200, 100)]); // right
  await driveOnce([place("x", 200, -100)]); // left: different line, new audio
  assert.equal(calls(), 2);
});

test("PUBLIC_BASE_URL makes audio URLs absolute, read per request", async () => {
  mockSpeechify();
  process.env.PUBLIC_BASE_URL = "https://demo.trycloudflare.com/";
  const { narration } = await driveOnce([place("a", 200, 100)]);
  assert.match(narration.audioUrl, /^https:\/\/demo\.trycloudflare\.com\/audio\/a-[0-9a-f]{10}\.mp3$/);
});

test("a TTS failure gives audioUrl null but still narrates", async () => {
  process.env.MOCK_TTS = "0";
  process.env.SPEECHIFY_API_KEY = "test-key";
  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  const { narration } = await driveOnce([place("a", 200, 100)]);
  assert.equal(narration.audioUrl, null);
  assert.ok(narration.text.length > 0);
});

test("a narrate() that throws falls back to the template line", async () => {
  const h = setup([place("a", 200, 100)], async () => {
    throw new Error("boom");
  });
  const id = await h.start();
  await h.tick(id, 0, 0);
  await h.store.idle(h.store.get(id)!);
  const { narration } = await h.tick(id, 10, 0);
  assert.equal(narration.text, "On your right is Place A.");
  assert.equal(narration.audioUrl, null);
});

// --- sessions and errors ---

test("unknown session gives 404 unknown_session on every endpoint", async () => {
  const app = createApp();
  for (const [url, body] of [
    ["/tour/tick", { sessionId: "nope", lat: 25.78, lng: -80.19 }],
    ["/tour/chat", { sessionId: "nope", message: "hi" }],
    ["/tour/end", { sessionId: "nope" }],
  ] as const) {
    const res = await request(app).post(url).send(body).expect(404);
    assert.equal(res.body.error, "unknown_session");
    assert.equal(typeof res.body.message, "string");
  }
});

test("ended and expired sessions are gone", async () => {
  const h = setup([]);
  const id = await h.start();
  await request(h.app).post("/tour/end").send({ sessionId: id }).expect(200, { ok: true });
  await request(h.app).post("/tour/tick").send({ sessionId: id, lat: 1, lng: 1 }).expect(404);

  const id2 = await h.start();
  h.clock.advance(2 * 60 * 60 * 1000 + 1);
  await request(h.app).post("/tour/tick").send({ sessionId: id2, lat: 1, lng: 1 }).expect(404);
});

test("empty places is allowed; bad bodies get 400 bad_request", async () => {
  const h = setup([]);
  const id = await h.start();
  assert.deepEqual(await h.tick(id, 0, 0), { narration: null, pending: null });

  const app = h.app;
  for (const [url, body] of [
    ["/tour/start", {}],
    ["/tour/start", { places: [{ id: "x" }] }],
    ["/tour/tick", { sessionId: id, lat: "25", lng: -80 }],
    ["/tour/tick", { sessionId: id, lat: 25, lng: -80, heading: "north" }],
    ["/tour/tick", { lat: 25, lng: -80 }],
    ["/tour/chat", { sessionId: id, message: "" }],
  ] as const) {
    const res = await request(app).post(url).send(body).expect(400);
    assert.equal(res.body.error, "bad_request", `${url} ${JSON.stringify(body)}`);
  }
  const res = await request(app).post("/tour/tick").set("Content-Type", "application/json").send("{bad").expect(400);
  assert.equal(res.body.error, "bad_request");
});

test("null heading/speed from expo-location are treated as absent", async () => {
  const h = setup([place("a", 100, 0)]);
  const id = await h.start();
  const res = await request(h.app)
    .post("/tour/tick")
    .send({ sessionId: id, ...at(0, 0), heading: null, speedMps: null })
    .expect(200);
  assert.equal(res.body.pending, "a");
});

// --- demo path ---

test("GET /dev/demo-path passes all three demo places", async () => {
  const res = await request(createApp()).get("/dev/demo-path").expect(200);
  assert.equal(res.body.intervalMs, 3000);
  assert.deepEqual(res.body.places, demoPlaces);
  for (const p of demoPlaces) {
    const closest = Math.min(...res.body.points.map((pt: { lat: number; lng: number }) => distanceMeters(pt, p)));
    assert.ok(closest < 200, `${p.name} is ${Math.round(closest)} m from the path`);
  }
});

test("driving the demo path narrates every demo place before passing it (mock mode)", async () => {
  const h = setup(demoPlaces as Place[]);
  const id = await h.start();
  const s = h.store.get(id)!;
  const points = demoPath();
  const deliveredAt = new Map<string, number>();
  const sides = new Map<string, string>();
  for (const [i, pt] of points.entries()) {
    const body = (await request(h.app).post("/tour/tick").send({ sessionId: id, ...pt }).expect(200)).body;
    if (body.narration) {
      deliveredAt.set(body.narration.placeId, i);
      sides.set(body.narration.placeId, body.narration.side);
    }
    await h.store.idle(s);
    h.clock.advance(3000);
  }
  for (const p of demoPlaces) {
    const dists = points.map((pt) => distanceMeters(pt, p));
    const closestIdx = dists.indexOf(Math.min(...dists));
    assert.ok(deliveredAt.has(p.id), `${p.name} never narrated`);
    assert.ok(deliveredAt.get(p.id)! < closestIdx, `${p.name} narrated after passing`);
    assert.equal(sides.get(p.id), p.side, `${p.name} side`);
  }
});
