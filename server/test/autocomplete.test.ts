import "./helpers/fakeGoogleKey";
import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";

test("GET /autocomplete requires a non-empty input", async () => {
  const app = createApp();
  const missing = await request(app).get("/autocomplete").expect(400);
  assert.match(missing.body.error, /input/);

  const empty = await request(app).get("/autocomplete?input=%20").expect(400);
  assert.match(empty.body.error, /input/);
});

test("GET /autocomplete sends a location bias only for valid lat/lng", async (t) => {
  const bodies: any[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ suggestions: [] }), { status: 200 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const app = createApp();
  await request(app).get("/autocomplete?input=brickell&lat=25.77&lng=-80.19").expect(200);
  await request(app).get("/autocomplete?input=brickell&lat=abc&lng=-80.19").expect(200);
  await request(app).get("/autocomplete?input=brickell&lat=95&lng=-80.19").expect(200);

  assert.deepEqual(bodies[0].locationBias.circle.center, { latitude: 25.77, longitude: -80.19 });
  assert.equal(bodies[1].locationBias, undefined);
  assert.equal(bodies[2].locationBias, undefined);
});
