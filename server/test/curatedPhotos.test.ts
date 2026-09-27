import "./helpers/fakeGoogleKey";
import assert from "node:assert/strict";
import { test } from "node:test";
import { clearCuratedPhotoCache, curatedToPoi, withCuratedPhotos } from "../src/lib/curated";

const freedomTower = curatedToPoi({ id: "freedom-tower", name: "Freedom Tower", lat: 25.78, lng: -80.19, kind: "historic", weight: 4.7 });

function fakeFetch(t: import("node:test").TestContext, respond: () => Response) {
  const calls: any[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)));
    return respond();
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
    clearCuratedPhotoCache();
  });
  return calls;
}

test("withCuratedPhotos looks each curated landmark up once and reuses it", async (t) => {
  const calls = fakeFetch(t, () => new Response(JSON.stringify({ places: [{ photos: [{ name: "places/abc/photos/1" }] }] })));
  const placesResult = { ...freedomTower, id: "ChIJ-real", curated: undefined, photoUrl: "/photo?name=x" };

  const [first] = await withCuratedPhotos([freedomTower]);
  const [again, untouched] = await withCuratedPhotos([freedomTower, placesResult]);

  assert.equal(first.photoUrl, "/photo?name=places%2Fabc%2Fphotos%2F1");
  assert.equal(again.photoUrl, first.photoUrl);
  assert.equal(untouched, placesResult);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].textQuery, "Freedom Tower");
  assert.deepEqual(calls[0].locationBias.circle.center, { latitude: 25.78, longitude: -80.19 });
});

test("withCuratedPhotos leaves the photo empty on a Google error and retries next time", async (t) => {
  let ok = false;
  const calls = fakeFetch(t, () =>
    ok
      ? new Response(JSON.stringify({ places: [{ photos: [{ name: "p/1" }] }] }))
      : new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }),
  );

  const [failed] = await withCuratedPhotos([freedomTower]);
  assert.equal(failed.photoUrl, undefined);

  ok = true;
  const [retried] = await withCuratedPhotos([freedomTower]);
  assert.equal(retried.photoUrl, "/photo?name=p%2F1");
  assert.equal(calls.length, 2);
});
