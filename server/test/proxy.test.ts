import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import request from "supertest";
import { createApp } from "../src/app";
import { proxyTimeoutFor } from "../src/routes/proxy";

// A stand-in for backend/: echoes requests, serves an MP3 like the real
// /audio route, and has a route that never answers.
const audioDir = mkdtempSync(path.join(os.tmpdir(), "proxy-audio-"));
const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(300_000, 7)]);
writeFileSync(path.join(audioDir, "clip.mp3"), mp3);

const seen: { method: string; url: string; contentType?: string; body: unknown }[] = [];
const fake = express();
fake.use(express.json({ limit: "5mb" }));
fake.get("/health", (_req, res) => {
  res.json({ status: "ok", llm: { provider: "openai", mock: false }, tts: { provider: "speechify", mock: false } });
});
fake.post("/tour/start", (req, res) => {
  seen.push({ method: req.method, url: req.originalUrl, contentType: req.headers["content-type"], body: req.body });
  res.set("X-Backend", "yes").json({ sessionId: "abc", placesReceived: req.body.places?.length ?? 0 });
});
fake.post("/tour/tick", (_req, res) => {
  res.status(404).json({ error: "unknown_session", message: "Unknown or expired session" });
});
fake.get("/dev/demo-path", (req, res) => {
  res.json({ points: [], intervalMs: 3000, query: req.query });
});
fake.post("/narration/pregenerate", (req, res) => {
  res.json(req.body.places.map((p: { id: string }) => ({ placeId: p.id, text: "x", audioUrl: null, durationHintS: 1 })));
});
fake.post("/tour/chat", () => {
  // Never answers: the proxy timeout must kick in.
});
fake.post("/guide/destination", (req, res) => {
  seen.push({ method: req.method, url: req.originalUrl, contentType: req.headers["content-type"], body: req.body });
  res.json({ conversationId: "c1", stage: "intent", reply: "Hey!", chips: [], places: [], destination: null });
});
fake.use("/audio", express.static(audioDir));

let backend: Server;
let backendUrl = "";

before(async () => {
  backend = fake.listen(0, "127.0.0.1");
  await new Promise((resolve) => backend.once("listening", resolve));
  backendUrl = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;
});

beforeEach(() => {
  process.env.BACKEND_URL = backendUrl;
  seen.length = 0;
});

after(() => {
  backend.closeAllConnections();
  backend.close();
  rmSync(audioDir, { recursive: true, force: true });
});

/** A port nothing listens on. */
async function deadUrl(): Promise<string> {
  const s = express().listen(0, "127.0.0.1");
  await new Promise((resolve) => s.once("listening", resolve));
  const port = (s.address() as AddressInfo).port;
  await new Promise((resolve) => s.close(resolve));
  return `http://127.0.0.1:${port}`;
}

test("forwards a /tour call: method, path, JSON body, status and headers", async () => {
  const places = [{ id: "a", name: "A", kind: "landmark", lat: 1, lng: 2 }];
  const res = await request(createApp()).post("/tour/start?debug=1").send({ places }).expect(200);
  assert.deepEqual(res.body, { sessionId: "abc", placesReceived: 1 });
  assert.equal(res.headers["x-backend"], "yes");
  assert.match(res.headers["content-type"], /application\/json/);
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].url, "/tour/start?debug=1");
  assert.match(seen[0].contentType!, /application\/json/);
  assert.deepEqual(seen[0].body, { places });
});

test("backend errors pass through unchanged", async () => {
  const res = await request(createApp()).post("/tour/tick").send({ sessionId: "x", lat: 1, lng: 2 }).expect(404);
  assert.deepEqual(res.body, { error: "unknown_session", message: "Unknown or expired session" });
});

test("forwards /dev GETs with their query string", async () => {
  const res = await request(createApp()).get("/dev/demo-path?x=1").expect(200);
  assert.deepEqual(res.body.query, { x: "1" });
});

test("bodies larger than the server's own 1 MB JSON limit reach the backend", async () => {
  const places = Array.from({ length: 6000 }, (_, i) => ({
    id: `p${i}`,
    name: `Place ${i}`,
    kind: "landmark",
    lat: 1,
    lng: 2,
    description: "x".repeat(200),
  }));
  assert.ok(JSON.stringify({ places }).length > 1_000_000);
  const res = await request(createApp()).post("/tour/start").send({ places }).expect(200);
  assert.equal(res.body.placesReceived, 6000);
});

test("streams an /audio file with audio/mpeg, its length and range support", async () => {
  const app = createApp();
  const res = await request(app)
    .get("/audio/clip.mp3")
    .buffer(true)
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    })
    .expect(200);
  assert.equal(res.headers["content-type"], "audio/mpeg");
  assert.equal(Number(res.headers["content-length"]), mp3.length);
  assert.ok(Buffer.compare(res.body as Buffer, mp3) === 0, "bytes match");

  const partial = await request(app).get("/audio/clip.mp3").set("Range", "bytes=0-2").expect(206);
  assert.equal(partial.headers["content-range"], `bytes 0-2/${mp3.length}`);

  await request(app).get("/audio/missing.mp3").expect(404);
});

test("backend down: 502 backend_unavailable with the usual error shape", async () => {
  process.env.BACKEND_URL = await deadUrl();
  const res = await request(createApp()).post("/tour/start").send({ places: [] }).expect(502);
  assert.equal(res.body.error, "backend_unavailable");
  assert.match(res.body.message, /not reachable/);
  const audio = await request(createApp()).get("/audio/clip.mp3").expect(502);
  assert.equal(audio.body.error, "backend_unavailable");
});

test("backend timeout: 502 backend_unavailable", async () => {
  const started = Date.now();
  const res = await request(createApp({ proxyTimeoutMs: 200 })).post("/tour/chat").send({ message: "hi" }).expect(502);
  assert.equal(res.body.error, "backend_unavailable");
  assert.match(res.body.message, /no response within 0.2 s/);
  assert.ok(Date.now() - started < 3000);
});

test("forwards /narration/pregenerate (the app's current tour mode)", async () => {
  const res = await request(createApp()).post("/narration/pregenerate").send({ places: [{ id: "a" }, { id: "b" }] }).expect(200);
  assert.deepEqual(res.body.map((n: { placeId: string }) => n.placeId), ["a", "b"]);
});

test("/narration gets the 120 s timeout, everything else 20 s", () => {
  assert.equal(proxyTimeoutFor("/narration/pregenerate"), 120_000);
  assert.equal(proxyTimeoutFor("/narration"), 120_000);
  assert.equal(proxyTimeoutFor("/tour/chat"), 20_000);
  assert.equal(proxyTimeoutFor("/audio/x.mp3"), 20_000);
  assert.equal(proxyTimeoutFor("/narrationx"), 20_000);
});

test("forwards /guide (the destination guide)", async () => {
  const res = await request(createApp()).post("/guide/destination").send({ lat: 25.76, lng: -80.19 }).expect(200);
  assert.equal(res.body.conversationId, "c1");
  assert.deepEqual(seen[0].body, { lat: 25.76, lng: -80.19 });
});

test("only /tour, /audio, /dev, /narration and /guide are proxied; route and place search stay local", async () => {
  const app = createApp();
  await request(app).get("/tourist").expect(404);
  await request(app).post("/places/nearby").send({}).expect(400);
  const res = await request(app).post("/geocode").send({}).expect(400);
  assert.match(res.body.error, /address/);
  assert.equal(seen.length, 0);
});

test("/health shows the backend's status and llm/tts info", async () => {
  const ok = await request(createApp()).get("/health").expect(200);
  assert.equal(ok.body.status, "ok");
  assert.deepEqual(ok.body.backend, {
    url: backendUrl,
    reachable: true,
    llm: { provider: "openai", mock: false },
    tts: { provider: "speechify", mock: false },
  });

  process.env.BACKEND_URL = await deadUrl();
  const down = await request(createApp()).get("/health").expect(200);
  assert.equal(down.body.status, "ok");
  assert.equal(down.body.backend.reachable, false);
  assert.equal(typeof down.body.backend.error, "string");
});
