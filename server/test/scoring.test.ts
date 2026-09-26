import assert from "node:assert/strict";
import { test } from "node:test";
import type { RouteStep } from "../src/lib/googleMaps";
import type { Poi } from "../src/lib/places";
import {
  analyzeSteps,
  extraTimeBudgetSeconds,
  isHighwayStep,
  isRealWaterPlace,
  landmarkScore,
  pickScenic,
  pickWaterWaypoints,
  shareNearWater,
  withinBudget,
} from "../src/lib/scoring";

const step = (instruction: string, distanceMeters: number, staticDurationSeconds: number): RouteStep => ({
  instruction,
  distanceMeters,
  staticDurationSeconds,
  encodedPolyline: "",
});

const poi = (overrides: Partial<Poi>): Poi => ({
  id: overrides.name ?? "p",
  name: "p",
  lat: 0,
  lng: 0,
  types: [],
  ...overrides,
});

test("isHighwayStep: highway names at speed, or long fast unnamed stretches", () => {
  // Real steps from Brickell -> Wynwood.
  assert.equal(isHighwayStep(step("Take the ramp onto I-95 N", 4474, 212)), true);
  assert.equal(isHighwayStep(step("Turn right onto SW 2nd Ave", 1976, 415)), false);
  // Named but crawling (e.g. a service road) is not highway driving.
  assert.equal(isHighwayStep(step("Merge onto I-95 N", 1000, 200)), false);
  // "toward I-95" names where you're heading, not the road you're on.
  assert.equal(isHighwayStep(step("Turn left onto SE 2nd St toward I-95", 600, 90)), false);
  assert.equal(isHighwayStep(step("Continue straight", 2000, 80)), true);
  assert.equal(isHighwayStep(step("Continue straight", 500, 20)), false);
});

test("analyzeSteps: causeways count as waterfront, not highway", () => {
  const scenery = analyzeSteps(
    [
      step("Merge onto I-95 N", 3370, 160),
      step("Continue onto MacArthur Cswy", 5088, 240),
      step("Turn right onto Alton Rd", 802, 120),
    ],
    [],
  );
  assert.equal(scenery.highwayMeters, 3370);
  assert.equal(scenery.waterfrontMeters, 5088);
});

test("shareNearWater: only the stretch near the water counts", () => {
  // A 2 km line due north; one marina beside its northern half.
  const path = [
    { lat: 25.76, lng: -80.19 },
    { lat: 25.778, lng: -80.19 },
  ];
  const water = [{ lat: 25.7735, lng: -80.1895 }];
  const share = shareNearWater(path, water, 400);
  assert.ok(share > 0.3 && share < 0.55, `share ${share}`);
  assert.equal(shareNearWater(path, [], 400), 0);
});

test("landmarkScore discounts plain parks but not historic ones", () => {
  const dropOff = { lat: 0, lng: 0 };
  const museum = poi({ types: ["museum"], rating: 5 });
  const park = poi({ types: ["park", "tourist_attraction"], rating: 5 });
  const historicPark = poi({ types: ["park", "historical_landmark"], rating: 5 });
  assert.equal(landmarkScore([museum], dropOff), 5);
  assert.equal(landmarkScore([park], dropOff), 1.5);
  assert.equal(landmarkScore([historicPark], dropOff), 5);
});

test("landmarkScore ignores food places more than 1 km from the drop-off", () => {
  const dropOff = { lat: 25.8, lng: -80.2 };
  // A restaurant Google also tags as a tourist attraction, ~500 m and ~3 km from the drop-off.
  const near = poi({ types: ["tourist_attraction", "seafood_restaurant"], rating: 4, lat: 25.8045, lng: -80.2 });
  const far = poi({ types: ["tourist_attraction", "ice_cream_shop"], rating: 4, lat: 25.827, lng: -80.2 });
  const farMuseum = poi({ types: ["museum"], rating: 4, lat: 25.827, lng: -80.2 });
  assert.equal(landmarkScore([near], dropOff), 4);
  assert.equal(landmarkScore([far], dropOff), 0);
  assert.equal(landmarkScore([farMuseum], dropOff), 4);
});

test("extra-time budget: at least 8 min, half the trip, at most 25 min", () => {
  assert.equal(extraTimeBudgetSeconds(10 * 60), 8 * 60);
  assert.equal(extraTimeBudgetSeconds(30 * 60), 15 * 60);
  assert.equal(extraTimeBudgetSeconds(120 * 60), 25 * 60);
  const routes = [{ durationSeconds: 1000 }, { durationSeconds: 1480 }, { durationSeconds: 1600 }];
  assert.deepEqual(withinBudget(routes, 1000), routes.slice(0, 2));
});

test("pickScenic avoids plain highway unless every option uses it", () => {
  const fastHighway = { name: "hwy", durationSeconds: 900, highwayMeters: 6000, score: 300 };
  const surface = { name: "surface", durationSeconds: 1000, highwayMeters: 0, score: 100 };
  const bayfront = { name: "bayfront", durationSeconds: 1400, highwayMeters: 200, score: 250 };
  // Highway loses even with the top score; within 500 m of highway counts as equal.
  assert.equal(pickScenic([fastHighway, surface, bayfront]).name, "bayfront");
  // When every option needs the highway, take the least of it.
  const lessHighway = { name: "less", durationSeconds: 1000, highwayMeters: 3000, score: 50 };
  assert.equal(pickScenic([fastHighway, lessHighway]).name, "less");
});

test("isRealWaterPlace drops businesses merely tagged as marinas", () => {
  assert.equal(isRealWaterPlace(poi({ primaryType: "marina", userRatingCount: 328 })), true);
  assert.equal(isRealWaterPlace(poi({ primaryType: "marina", userRatingCount: 0 })), false);
  assert.equal(isRealWaterPlace(poi({ primaryType: "tour_agency", types: ["marina"], userRatingCount: 600 })), false);
});

test("pickWaterWaypoints picks small detours mid-trip, spaced apart", () => {
  const start = { lat: 25.767, lng: -80.193 };
  const end = { lat: 25.801, lng: -80.199 };
  const marina = (name: string, lat: number, lng: number) =>
    poi({ name, lat, lng, primaryType: "marina", userRatingCount: 50 });
  const picked = pickWaterWaypoints(start, end, [
    marina("museum park", 25.7827, -80.1894), // smallest detour
    marina("bayside", 25.7792, -80.1865), // under 1 km from museum park
    marina("at the start", 25.768, -80.192),
    marina("far away", 25.78, -80.12),
    marina("river", 25.788, -80.21),
    poi({ name: "island", lat: 25.785, lng: -80.19, primaryType: "island", userRatingCount: 50 }),
  ]) as Poi[];
  assert.deepEqual(
    picked.map((p) => p.name),
    ["museum park", "river"],
  );
});
