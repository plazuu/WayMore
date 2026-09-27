import { test } from "node:test";
import assert from "node:assert/strict";
import { pickRoutes } from "../src/lib/picks";

const route = (id: string, minutes: number, score: number) => ({ encodedPolyline: id, durationSeconds: minutes * 60, score });
const SHORT = 8 * 60;
const LONG = 16 * 60;

test("normal is the fastest, scenic the best score within the short budget", () => {
  const picks = pickRoutes([route("fast", 20, 30), route("nice", 26, 50), route("nicer", 40, 90)], SHORT, LONG);
  assert.equal(picks.normal.encodedPolyline, "fast");
  assert.equal(picks.scenic.encodedPolyline, "nice");
});

test("a long detour is offered only when it is longer and scores better", () => {
  const picks = pickRoutes([route("fast", 20, 30), route("nice", 26, 50), route("nicer", 34, 90)], SHORT, LONG);
  assert.equal(picks.scenicLong?.encodedPolyline, "nicer");
});

test("no long detour when nothing within the long budget beats the short one", () => {
  const picks = pickRoutes([route("fast", 20, 30), route("nice", 26, 50), route("meh", 34, 40)], SHORT, LONG);
  assert.equal(picks.scenicLong, undefined);
});

test("routes over the long budget are never offered", () => {
  const picks = pickRoutes([route("fast", 20, 30), route("nice", 26, 50), route("far", 60, 200)], SHORT, LONG);
  assert.equal(picks.scenicLong, undefined);
});

test("the long detour is a different route from the short one", () => {
  const picks = pickRoutes([route("fast", 20, 30), route("nice", 26, 50)], SHORT, LONG);
  assert.equal(picks.scenicLong, undefined);
});

test("when nothing beats the fastest, scenic is the fastest and there is no long detour", () => {
  const picks = pickRoutes([route("fast", 20, 60), route("slow", 24, 40)], SHORT, LONG);
  assert.equal(picks.scenic.encodedPolyline, "fast");
  assert.equal(picks.scenicLong, undefined);
});
