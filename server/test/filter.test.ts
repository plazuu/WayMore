import { test } from "node:test";
import assert from "node:assert/strict";
import { filterFoodStops, filterLandmarks } from "../src/routes/filter";
import { distanceToPathMeters, lastStretch } from "../src/lib/polyline";
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

// Route ends at lng -80.0 heading east along lat 25.0; 0.001 deg lng is about 100 m.
const approach = lastStretch(road, 1600);
const destination = { lat: 25.0, lng: -80.0 };
const food = (id: string, latOffset: number, lng: number, extra: Partial<Poi> = {}): Poi => ({
  id, name: id, lat: 25.0 + latOffset, lng, types: ["restaurant"], rating: 4.6, userRatingCount: 500, ...extra,
});

test("lastStretch returns only the tail of the path", () => {
  const tail = lastStretch(road, 1600);
  assert.equal(tail[tail.length - 1].lng, -80.0);
  assert.ok(tail.length >= 2);
});

test("a restaurant visible from the final approach outranks an equal one that is not", () => {
  const visible = food("visible", 0.0004, -80.005); // ~45 m off the road
  const hidden = food("hidden", 0.003, -80.005); // ~330 m off the road, same distance-ish to destination
  const ranked = filterFoodStops([hidden, visible], approach, destination);
  assert.equal(ranked[0].id, "visible");
  assert.equal(ranked[0].visibleFromRoute, true);
  assert.equal(ranked[1].visibleFromRoute, false);
});

test("closer to the destination outranks farther when visibility and quality match", () => {
  const near = food("near", 0.0004, -80.003);
  const far = food("far", 0.0004, -80.014);
  const ranked = filterFoodStops([far, near], approach, destination);
  assert.equal(ranked[0].id, "near");
});

test("a 5-star chain ranks below a 4.4 local spot, but still shows when it's the only option", () => {
  const chain = food("tacobell", 0.0004, -80.003, { name: "Taco Bell", rating: 5, userRatingCount: 2000 });
  const local = food("local", 0.0004, -80.003, { name: "Versailles", rating: 4.4, userRatingCount: 300 });
  assert.deepEqual(filterFoodStops([chain, local], approach, destination).map((p) => p.id), ["local", "tacobell"]);
  assert.deepEqual(filterFoodStops([chain], approach, destination).map((p) => p.id), ["tacobell"]);
});

test("generic fast food is down-weighted by primary type", () => {
  const generic = food("generic", 0.0004, -80.003, { primaryType: "fast_food_restaurant", rating: 4.9 });
  const local = food("local", 0.0004, -80.003, { rating: 4.4 });
  assert.equal(filterFoodStops([generic, local], approach, destination)[0].id, "local");
});

test("low-quality food stops are still dropped", () => {
  const weak = food("weak", 0.0004, -80.003, { rating: 3.9 });
  assert.deepEqual(filterFoodStops([weak], approach, destination), []);
});
