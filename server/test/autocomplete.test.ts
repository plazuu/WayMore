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
