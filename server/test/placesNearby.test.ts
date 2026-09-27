import "./helpers/fakeGoogleKey";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { searchNearby } from "../src/lib/places";

const USER = { lat: 25.7617, lng: -80.1918 };
const realFetch = globalThis.fetch;

interface Call {
  url: string;
  fieldMask: string;
  body: any;
}

/** Fakes Google: `respond` gets each call and returns the places (or an error status). */
function fakeGoogle(respond: (call: Call) => { places?: unknown[]; status?: number }) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    const call = { url: String(url), fieldMask: headers["X-Goog-FieldMask"], body: JSON.parse(String(init.body)) };
    calls.push(call);
    const { places = [], status = 200 } = respond(call);
    const body = status === 200 ? { places } : { error: { message: "Unsupported types: made_up_type" } };
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A Places (New) result `northMeters` north of the user. */
function place(id: string, northMeters: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    displayName: { text: `Place ${id}` },
    location: { latitude: USER.lat + northMeters / 111_320, longitude: USER.lng },
    types: ["chinese_restaurant", "restaurant"],
    rating: 4.5,
    userRatingCount: 200,
    formattedAddress: `${id} Main St, Miami, FL`,
    currentOpeningHours: { openNow: true },
    photos: [{ name: `places/${id}/photos/p1` }],
    ...extra,
  };
}

test("requires lat/lng and types or a query", async () => {
  const app = createApp();
  const noLoc = await request(app).post("/places/nearby").send({ types: ["museum"] }).expect(400);
  assert.match(noLoc.body.error, /lat/);
  const nothing = await request(app).post("/places/nearby").send(USER).expect(400);
  assert.match(nothing.body.error, /types/);
});

test("filters by rating, reviews and open-now, then sorts by computed distance", async () => {
  const calls = fakeGoogle(() => ({
    places: [
      place("far", 2500),
      place("low-rated", 100, { rating: 3.9 }),
      place("few-reviews", 150, { userRatingCount: 12 }),
      place("closed", 200, { currentOpeningHours: { openNow: false } }),
      place("no-hours", 900, { currentOpeningHours: undefined }),
      place("near", 400),
      place("mid", 1200),
      place("mid2", 1800),
    ],
  }));
  const res = await request(createApp())
    .post("/places/nearby")
    .send({ ...USER, types: ["chinese_restaurant"] })
    .expect(200);

  assert.deepEqual(
    res.body.places.map((p: { placeId: string }) => p.placeId),
    ["near", "no-hours", "mid", "mid2", "far"],
  );
  const near = res.body.places[0];
  assert.equal(near.name, "Place near");
  assert.equal(near.address, "near Main St, Miami, FL");
  assert.equal(near.openNow, true);
  assert.ok(Math.abs(near.distanceMeters - 400) <= 2);
  assert.equal(near.photoUrl, "/photo?name=places%2Fnear%2Fphotos%2Fp1");

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /searchNearby$/);
  assert.deepEqual(calls[0].body.includedTypes, ["chinese_restaurant"]);
  assert.equal(calls[0].body.rankPreference, "POPULARITY");
  assert.equal(calls[0].body.maxResultCount, 20);
  assert.equal(calls[0].body.locationRestriction.circle.radius, 3000);
  assert.match(calls[0].fieldMask, /places\.formattedAddress/);
  assert.match(calls[0].fieldMask, /places\.currentOpeningHours\.openNow/);
});

test("fewer than 5 good places: one retry at double the radius", async () => {
  const calls = fakeGoogle(({ body }) => ({
    places: body.locationRestriction.circle.radius === 3000 ? [place("a", 300)] : [place("a", 300), place("b", 4000)],
  }));
  const res = await request(createApp())
    .post("/places/nearby")
    .send({ ...USER, types: ["beach"] })
    .expect(200);
  assert.deepEqual(
    calls.map((c) => c.body.locationRestriction.circle.radius),
    [3000, 6000],
  );
  assert.deepEqual(res.body.places.map((p: { placeId: string }) => p.placeId), ["a", "b"]);
});

test("free text uses Text Search, and drops matches outside the radius", async () => {
  const calls = fakeGoogle(() => ({ places: [place("sushi-far", 9000), place("sushi-near", 500)] }));
  const res = await request(createApp())
    .post("/places/nearby")
    .send({ ...USER, query: "sushi", limit: 1 })
    .expect(200);
  assert.match(calls[0].url, /searchText$/);
  assert.equal(calls[0].body.textQuery, "sushi");
  assert.equal(calls[0].body.locationBias.circle.radius, 3000);
  assert.deepEqual(res.body.places.map((p: { placeId: string }) => p.placeId), ["sushi-near"]);
});

test("a rejected place type falls back to Text Search with the query", async () => {
  const calls = fakeGoogle(({ url }) => (url.endsWith("searchNearby") ? { status: 400 } : { places: [place("x", 100)] }));
  const res = await request(createApp())
    .post("/places/nearby")
    .send({ ...USER, types: ["made_up_type"], query: "cuban restaurant", limit: 1 })
    .expect(200);
  assert.deepEqual(
    calls.map((c) => c.url.split(":").pop()),
    ["searchNearby", "searchText"],
  );
  assert.equal(calls[1].body.textQuery, "cuban restaurant");
  assert.equal(res.body.places[0].placeId, "x");
});

test("Google failure without a query: the Places error status passes through", async () => {
  fakeGoogle(() => ({ status: 400 }));
  const res = await request(createApp())
    .post("/places/nearby")
    .send({ ...USER, types: ["made_up_type"] })
    .expect(502);
  assert.match(res.body.error, /Places search failed/);
});

test("surprise-style search: requireOpen and sortBy rating", async () => {
  fakeGoogle(() => ({
    places: [
      place("good", 100, { rating: 4.6 }),
      place("best", 2000, { rating: 4.9 }),
      place("unknown-hours", 50, { rating: 4.8, currentOpeningHours: undefined }),
    ],
  }));
  const res = await request(createApp())
    .post("/places/nearby")
    .send({ ...USER, types: ["restaurant"], minRating: 4.5, requireOpen: true, sortBy: "rating", limit: 3 })
    .expect(200);
  assert.deepEqual(res.body.places.map((p: { placeId: string }) => p.placeId), ["best", "good"]);
});

test("route search's Nearby calls keep their field mask (no pricier opening-hours fields)", async () => {
  const calls = fakeGoogle(() => ({ places: [] }));
  await searchNearby(USER, 500, ["park"]);
  assert.doesNotMatch(calls[0].fieldMask, /currentOpeningHours|formattedAddress/);
  assert.equal(
    calls[0].fieldMask,
    "places.id,places.displayName,places.location,places.primaryType,places.rating,places.userRatingCount,places.types,places.priceLevel,places.photos,places.editorialSummary",
  );
});
