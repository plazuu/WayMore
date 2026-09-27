import { test } from "node:test";
import assert from "node:assert/strict";
import { curatedOnRoute, orderAlongRoute, rankMisses, type CuratedLandmark } from "../src/lib/curated";
import { retraceMeters } from "../src/lib/polyline";
import { scoreCandidate } from "../src/lib/scoring";
import { curatedToPoi } from "../src/lib/curated";

// East-west road along lat 25.0; 0.001 deg lat is about 111 m.
const road = [
  { lat: 25.0, lng: -80.1 },
  { lat: 25.0, lng: -80.0 },
];
const make = (id: string, lat: number, lng: number, kind: CuratedLandmark["kind"], weight = 4.5): CuratedLandmark => ({
  id, name: id, lat, lng, kind, weight,
});
const all = [
  make("on-road", 25.0005, -80.05, "historic"), // ~55 m
  make("beach-near", 25.002, -80.06, "nature"), // ~222 m, inside the 300 m nature allowance
  make("statue-mid", 25.002, -80.07, "historic"), // ~222 m, outside the 150 m allowance
  make("far-good", 25.03, -80.03, "nature", 4.9), // ~3.3 km, a candidate detour
  make("far-meh", 25.03, -80.08, "street", 4.0), // ~3.3 km, lower weight
  make("too-far", 25.2, -80.05, "nature", 5), // ~22 km, beyond the corridor
];

test("curatedOnRoute keeps only landmarks visible from the road, nature with more slack", () => {
  const ids = curatedOnRoute(road, [], all).map((p) => p.id);
  assert.deepEqual(ids.sort(), ["curated:beach-near", "curated:on-road"]);
});

test("curatedOnRoute always keeps landmarks the route was sent through", () => {
  const ids = curatedOnRoute(road, ["far-good"], all).map((p) => p.id);
  assert.ok(ids.includes("curated:far-good"));
});

test("rankMisses returns missed landmarks in the corridor, best first, and ignores far ones", () => {
  const ids = rankMisses(road, 5, all).map((c) => c.id);
  assert.ok(ids.includes("statue-mid"));
  assert.ok(!ids.includes("too-far"));
  assert.ok(!ids.includes("on-road"));
  assert.ok(ids.indexOf("far-good") < ids.indexOf("far-meh"));
});

test("orderAlongRoute sorts by where the route passes them", () => {
  const ordered = orderAlongRoute(road, [all[3], all[2], all[1]]).map((c) => c.id);
  assert.deepEqual(ordered, ["statue-mid", "beach-near", "far-good"]);
});

test("a curated stop outscores a Places result with the same rating", () => {
  const curated = curatedToPoi(make("c", 0, 0, "historic", 4.5));
  const places = { ...curated, curated: undefined };
  assert.ok(scoreCandidate([curated]) > scoreCandidate([places]));
});

test("retraceMeters is zero for a route that never doubles back", () => {
  const straight = Array.from({ length: 40 }, (_, i) => ({ lat: 25.0, lng: -80.1 + i * 0.001 }));
  assert.equal(retraceMeters(straight), 0);
});

test("retraceMeters detects going out and back along the same road", () => {
  // East 2 km, then straight back west 2 km: a dead-end spur.
  const out = Array.from({ length: 21 }, (_, i) => ({ lat: 25.0, lng: -80.1 + i * 0.001 }));
  const outAndBack = [...out, ...[...out].reverse().slice(1)];
  assert.ok(retraceMeters(outAndBack) > 1500, `expected a large retrace, got ${retraceMeters(outAndBack)}`);
});

test("retraceMeters ignores a loop that returns on a different street", () => {
  // Out along lat 25.0, back along lat 25.002 (about 220 m away).
  const out = Array.from({ length: 21 }, (_, i) => ({ lat: 25.0, lng: -80.1 + i * 0.001 }));
  const back = Array.from({ length: 21 }, (_, i) => ({ lat: 25.002, lng: -80.08 - i * 0.001 }));
  assert.equal(retraceMeters([...out, ...back]), 0);
});
