import { test } from "node:test";
import assert from "node:assert/strict";
import { byTierRank, tierOf, tierRank } from "../src/lib/tiers";
import type { Poi } from "../src/lib/places";

function poi(name: string, types: string[], extra: Partial<Poi> = {}): Poi {
  return { id: name, name, lat: 25.78, lng: -80.19, types, rating: 4.5, userRatingCount: 500, ...extra };
}

test("tiers: heritage and nature, local attractions, local food, chains", () => {
  assert.equal(tierOf(poi("Everglades National Park", ["national_park", "park"])), 1);
  assert.equal(tierOf(poi("Freedom Tower", ["historical_landmark", "tourist_attraction"])), 1);
  assert.equal(tierOf(poi("Kaseya Center", ["arena", "stadium"])), 1);
  assert.equal(tierOf(poi("Bayside Marketplace", ["tourist_attraction", "shopping_mall"])), 1);
  assert.equal(tierOf(poi("Pérez Art Museum", ["art_museum", "museum"])), 1);
  assert.equal(tierOf(poi("Maurice A. Ferré Park", ["city_park", "park"])), 2);
  assert.equal(tierOf(poi("Versailles", ["cuban_restaurant", "restaurant"], { rating: 4.5, userRatingCount: 20000 })), 2);
  assert.equal(tierOf(poi("Corner Cafe", ["cafe"], { rating: 4.6, userRatingCount: 300 })), 3);
  assert.equal(tierOf(poi("Taco Bell", ["fast_food_restaurant", "restaurant"], { rating: 5 })), 4);
  assert.equal(tierOf(poi("Shell", ["gas_station"], { primaryType: "gas_station" })), 4);
});

test("a chain tagged as a tourist attraction is still tier 4; hand-picked stops are tier 1", () => {
  assert.equal(tierOf(poi("Starbucks Reserve", ["tourist_attraction", "cafe"])), 4);
  assert.equal(tierOf(poi("Brickell Key Drive", ["route"], { curated: true })), 1);
});

test("a 4.2 landmark far from the road outranks a 5.0 chain on it", () => {
  const landmark = poi("Freedom Tower", ["historical_landmark"], { rating: 4.2, distanceFromRouteMeters: 300 });
  const chain = poi("Taco Bell", ["fast_food_restaurant"], { rating: 5, distanceFromRouteMeters: 0 });
  assert.ok(tierRank(landmark) > tierRank(chain));
});

test("rank follows the formula", () => {
  // tier 1: 100 * 10 + 4.5 * 2 - 150 * 0.01
  assert.equal(tierRank(poi("Park", ["national_park"], { rating: 4.5, distanceFromRouteMeters: 150 })), 1000 + 9 - 1.5);
});

test("byTierRank sorts best first, tags tiers, and keeps order on ties", () => {
  const sorted = byTierRank([
    poi("Plaza A", ["plaza"], { rating: 4.4 }),
    poi("Chain", ["gas_station"], { primaryType: "gas_station", rating: 5 }),
    poi("Monument", ["monument"], { rating: 4.3 }),
    poi("Plaza B", ["plaza"], { rating: 4.4 }),
  ]);
  assert.deepEqual(sorted.map((p) => p.name), ["Monument", "Plaza A", "Plaza B", "Chain"]);
  assert.deepEqual(sorted.map((p) => p.tier), [1, 2, 2, 4]);
});
