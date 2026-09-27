import { test } from "node:test";
import assert from "node:assert/strict";
import { landmarkValue, scoreCandidate } from "../src/lib/scoring";
import { filterLandmarks } from "../src/routes/filter";
import { rankMisses, type CuratedLandmark } from "../src/lib/curated";
import { landmarkTypesFor, LANDMARK_ONLY_TYPES, LANDMARK_TYPES, NATURE_TYPES, type Poi } from "../src/lib/places";

// East-west road along lat 25.0; 0.001 deg lat is about 111 m.
const road = [
  { lat: 25.0, lng: -80.1 },
  { lat: 25.0, lng: -80.0 },
];
const stop = (id: string, types: string[], extra: Partial<Poi> = {}): Poi => ({
  id, name: id, lat: 25.0005, lng: -80.05, types, rating: 4.6, userRatingCount: 500, ...extra,
});
const beach = stop("beach", ["beach"]);
const statue = stop("statue", ["monument"]);

test("nature preference values a beach above an equal statue, city preference the reverse", () => {
  assert.ok(landmarkValue(beach, "nature") > landmarkValue(statue, "nature"));
  assert.ok(landmarkValue(statue, "city") > landmarkValue(beach, "city"));
});

test("the default preference is balanced and leans slightly to nature", () => {
  assert.equal(landmarkValue(beach), landmarkValue(beach, "balanced"));
  assert.ok(landmarkValue(beach, "balanced") > landmarkValue(statue, "balanced"));
});

test("a route past nature scores higher for a nature lover than a city lover", () => {
  assert.ok(scoreCandidate([beach], "nature") > scoreCandidate([beach], "city"));
  assert.ok(scoreCandidate([statue], "city") > scoreCandidate([statue], "nature"));
});

test("filterLandmarks fills a capped list with the preferred kind first", () => {
  // 12 stops all near the road: 6 beaches and 6 monuments, same quality. The list caps at 8.
  const pois = [
    ...Array.from({ length: 6 }, (_, i) => stop(`b${i}`, ["beach"], { lng: -80.09 + i * 0.001 })),
    ...Array.from({ length: 6 }, (_, i) => stop(`m${i}`, ["monument"], { lng: -80.04 + i * 0.001 })),
  ];
  const natureList = filterLandmarks(pois, road, "nature");
  const cityList = filterLandmarks(pois, road, "city");
  const beaches = (list: Poi[]) => list.filter((p) => p.types.includes("beach")).length;
  assert.equal(natureList.length, 8);
  assert.equal(beaches(natureList), 6);
  assert.equal(beaches(cityList), 2);
});

test("rankMisses tries the preferred kind of detour first", () => {
  const make = (id: string, lat: number, kind: CuratedLandmark["kind"]): CuratedLandmark => ({
    id, name: id, lat, lng: -80.05, kind, weight: 4.5,
  });
  const all = [make("mural", 25.02, "art"), make("shore", 25.02, "nature")]; // both ~2.2 km off the road
  assert.equal(rankMisses(road, 1, all, "nature")[0].id, "shore");
  assert.equal(rankMisses(road, 1, all, "city")[0].id, "mural");
});

test("a place tagged park but primarily a historic landmark counts as city", () => {
  const memorial = stop("memorial", ["park", "historical_landmark"], { primaryType: "historical_landmark" });
  const realPark = stop("park", ["park"], { primaryType: "park" });
  assert.ok(landmarkValue(memorial, "city") > landmarkValue(realPark, "city"));
  assert.ok(landmarkValue(realPark, "nature") > landmarkValue(memorial, "nature"));
});

test("without a primary type, classification falls back to the place's types", () => {
  assert.ok(landmarkValue(stop("beach-no-primary", ["beach"]), "nature") > landmarkValue(statue, "nature"));
});

test("landmark search types follow the preference; the default keeps the mixed search", () => {
  assert.deepEqual(landmarkTypesFor("balanced"), LANDMARK_TYPES);
  assert.deepEqual(landmarkTypesFor("city"), LANDMARK_ONLY_TYPES);
  assert.deepEqual(landmarkTypesFor("nature"), NATURE_TYPES);
});
