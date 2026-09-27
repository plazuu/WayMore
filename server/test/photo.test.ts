import "./helpers/fakeGoogleKey";
import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";

const CDN_URI = "https://lh3.googleusercontent.com/places/photo-bytes";

/** Stubs Google's photo-media lookup and records the URLs it was asked for. */
function stubPhotoMedia(t: { after: (fn: () => void) => void }, respond?: () => Response) {
  const urls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    urls.push(String(url));
    return respond ? respond() : new Response(JSON.stringify({ photoUri: CDN_URI }), { status: 200 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  return urls;
}

// A fresh photo name per test: the resolved-URL cache is module state.
let counter = 0;
const photoName = () => `places/ChIJtest${counter++}/photos/AeJphoto`;

test("GET /photo rejects anything that is not a Places photo resource name", async () => {
  const app = createApp();
  await request(app).get("/photo").expect(400);
  await request(app).get("/photo?name=https://evil.example/x.jpg").expect(400);
  await request(app).get(`/photo?name=${encodeURIComponent("places/x/photos/y/../../secret")}`).expect(400);
});

test("GET /photo redirects to the CDN instead of streaming the bytes", async (t) => {
  const urls = stubPhotoMedia(t);
  const name = photoName();

  const res = await request(createApp()).get(`/photo?name=${encodeURIComponent(name)}&maxWidthPx=640`).expect(302);

  assert.equal(res.headers.location, CDN_URI);
  assert.match(res.headers["cache-control"], /public, max-age=\d+/);
  // Asked Google for the URL only, not the image, and never leaked the key onward.
  assert.equal(urls.length, 1);
  assert.match(urls[0], /skipHttpRedirect=true/);
  assert.match(urls[0], /maxWidthPx=640/);
  assert.equal(res.headers.location.includes("test-key"), false);
});

test("GET /photo clamps maxWidthPx and caches the resolved URL per width", async (t) => {
  const urls = stubPhotoMedia(t);
  const app = createApp();
  const name = encodeURIComponent(photoName());

  await request(app).get(`/photo?name=${name}&maxWidthPx=9000`).expect(302);
  await request(app).get(`/photo?name=${name}&maxWidthPx=9000`).expect(302);
  await request(app).get(`/photo?name=${name}&maxWidthPx=10`).expect(302);

  assert.match(urls[0], /maxWidthPx=1600/);
  // The repeat is served from the cache; a different width is looked up again.
  assert.equal(urls.length, 2);
  assert.match(urls[1], /maxWidthPx=100/);
});

test("GET /photo reports upstream failures without caching them", async (t) => {
  const urls = stubPhotoMedia(t, () => new Response("nope", { status: 404 }));
  const app = createApp();
  const name = encodeURIComponent(photoName());

  await request(app).get(`/photo?name=${name}`).expect(404);
  await request(app).get(`/photo?name=${name}`).expect(404);
  assert.equal(urls.length, 2);
});

test("GET /photo answers 502 when the lookup throws or returns no URL", async (t) => {
  let mode = "throw";
  stubPhotoMedia(t, () => {
    if (mode === "throw") throw new Error("network down");
    return new Response(JSON.stringify({}), { status: 200 });
  });
  const app = createApp();

  await request(app).get(`/photo?name=${encodeURIComponent(photoName())}`).expect(502);
  mode = "empty";
  await request(app).get(`/photo?name=${encodeURIComponent(photoName())}`).expect(502);
});
