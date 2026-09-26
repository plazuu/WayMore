import { test } from "node:test";
import assert from "node:assert/strict";
import { filterLandmarks } from "../src/routes/filter";
import { distanceToPathMeters } from "../src/lib/polyline";
import { scoreCandidate } from "../src/lib/scoring";
import type { Poi } from "../src/lib/places";

// A straight east-west road along lat 25.0; 0.001 deg lat is about 111 m.
const road = [
  { lat: 25.0, lng: -80.1 },
  { lat: 25.0, lng: -80.0 },
];

function poi(id: string, types: string[], latOffset: number, extra: Partial<Poi> = {}): Poi {
  return { id, name: id, lat: 25.0 + latOffset, lng: -80.05, types, rating: 4.7, userRatingCount: 500, ...extra };
}

test("distanceToPathMeters measures to the segment, not just the vertices", () => {
  const d = distanceToPathMeters({ lat: 25.001, lng: -80.05 }, road);
  assert.ok(d > 100 && d < 125, `expected ~111 m, got ${d}`);
});

test("filterLandmarks drops places too far from the road but allows nature farther out", () => {
  const near = poi("statue", ["monument"], 0.0005); // ~55 m
  const farBuilding = poi("far-statue", ["monument"], 0.002); // ~222 m
  const farBeach = poi("beach", ["beach"], 0.002); // ~222 m, nature allowance is 300 m
  const ids = filterLandmarks([near, farBuilding, farBeach], road).map((p) => p.id);
  assert.ok(ids.includes("statue"));
  assert.ok(ids.includes("beach"));
  assert.ok(!ids.includes("far-statue"));
});

test("filterLandmarks drops interior-only places, restaurants and bars", () => {
  const museum = poi("museum", ["museum", "tourist_attraction"], 0.0003);
  const bar = poi("bar", ["beer_garden", "dog_park", "bar"], 0.0003);
  const burger = poi("burger", ["park", "hamburger_restaurant"], 0.0003);
  assert.deepEqual(filterLandmarks([museum, bar, burger], road), []);
});

test("a museum with an exterior tag is kept", () => {
  const notable = poi("notable", ["museum", "historical_landmark"], 0.0003);
  assert.equal(filterLandmarks([notable], road).length, 1);
});

test("nature stops score higher than the same-rated landmark", () => {
  assert.ok(scoreCandidate([poi("b", ["beach"], 0)]) > scoreCandidate([poi("m", ["monument"], 0)]));
});
