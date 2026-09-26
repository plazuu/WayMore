# API for the app team

One base URL for everything: `server/` on port 3000. Locally that's `http://<laptop LAN IP>:3000` (or `http://localhost:3000` from the iOS Simulator); for the demo it's the cloudflared tunnel URL. `server/` serves route search itself and forwards `/tour/*`, `/narration/*`, `/audio/*` and `/dev/*` to the internal narration service (`backend/`, port 3001). Never call port 3001 or any Google/OpenAI API from the app: the keys stay on the server.

- [Errors](#errors)
- [Route search](#route-search): `GET /health`, `POST /geocode`, `POST /route`, `GET /photo`
- [Live guide](#live-guide): app flow, `POST /tour/start`, `/tour/tick`, `/tour/chat`, `/tour/end`, `GET /dev/demo-path`
- [Pregenerated narration](#pregenerated-narration): `POST /narration/pregenerate`, `POST /narration` (what the app's tour mode uses today)
- [Playing narration](#playing-narration)

## Errors

Every error body is `{ "error": "<code or message>", "message"?: "<text>" }`.

| Status | Where | `error` | When |
|---|---|---|---|
| 400 | route search | a message | missing/invalid input |
| 404 | route search | a message | no geocoding/route result |
| 502 | route search | a message | Google API failure |
| 400 | `/tour/*` | `bad_request` | missing/invalid fields, malformed JSON |
| 400 | `/tour/chat` | `message_too_long` | message over 500 characters |
| 404 | `/tour/*` | `unknown_session` | session unknown (server restarted, 2 h idle, or ended): call `/tour/start` again |
| 400 | `/narration/*` | a message | invalid place(s) |
| 502 | `/tour/*`, `/narration/*`, `/audio/*`, `/dev/*` | `backend_unavailable` | narration service down or no answer in time (20 s; 120 s for `/narration/*`): retry |

LLM or voice failures never produce a 5xx: you get a fallback line, `audioUrl: null`, or the chat fallback reply.

## Route search

### `GET /health`

```json
{ "status": "ok", "backend": { "url": "http://localhost:3001", "reachable": true, "llm": { "narrationModel": "gpt-4.1-nano", "chatModel": "gpt-4o-mini", "mock": false }, "tts": { "provider": "speechify", "mock": false } } }
```

`backend.reachable: false` means the narration service is down; `mock: true` means that part runs without keys (template lines, no audio).

### `POST /geocode`

```json
{ "address": "1600 Amphitheatre Parkway, Mountain View, CA" }
```
→ `{ "lat": 37.42, "lng": -122.08, "formattedAddress": "1600 Amphitheatre Pkwy, ..." }`

### `POST /route`

```json
{ "start": "Golden Gate Bridge, San Francisco, CA", "end": "Fisherman's Wharf, San Francisco, CA" }
```

Optional query params (clamped server-side): `sampleIntervalMeters` (default 1200) and `searchRadiusMeters` (default 500). Denser sampling finds more POIs but costs more Places calls and time.

```json
{
  "start": { "lat": 37.8199, "lng": -122.4786, "formattedAddress": "..." },
  "end":   { "lat": 37.8086, "lng": -122.4125, "formattedAddress": "..." },
  "normal": { "...": "RouteOption" },
  "scenic": { "...": "RouteOption" },
  "extraTimeSeconds": 174
}
```

`normal` is the fastest candidate, `scenic` the one with the highest landmark score (sum of landmark ratings); they can be the same route. `extraTimeSeconds` = scenic minus normal duration (can be 0). One call serves the normal/scenic toggle.

```ts
interface RouteOption {
  distanceMeters: number;
  durationSeconds: number;
  polyline: string;          // Google encoded polyline; decode client-side
  samplePointCount: number;  // debug
  score: number;             // debug
  landmarks: Poi[];
  foodStops: Poi[];
}

interface Poi {
  id: string;
  name: string;
  lat: number;
  lng: number;
  types: string[];           // raw Google Places types
  rating?: number;           // foodStops are pre-filtered to >= 4.0
  userRatingCount?: number;
  priceLevel?: string;       // "$".."$$$$" or "Free"; foodStops only
  cuisine?: string;          // foodStops only
  description?: string;      // Google's editorial summary; only ~1/3 of POIs have one
  photoUrl?: string;         // relative, e.g. "/photo?name=places%2F..."; prefix with the base URL
}
```

### `GET /photo?name=<places/.../photos/...>&maxWidthPx=800`

Streams a Places photo (the Google key stays server-side). Don't build this URL yourself: use `${BASE_URL}${poi.photoUrl}` in an `<Image>`. `maxWidthPx` is clamped to 100–1600.

Not built yet: address autocomplete. If the input screen adds Places Autocomplete, it needs a new server-side proxy endpoint, like `/photo`.

## Live guide

The app sends GPS ticks; the server decides when the car approaches a place, writes the line (OpenAI) and voices it (Speechify) right then, and hands it back on a later tick. A text chat answers passenger questions with the ride as context.

### App flow

```
trip starts   POST /tour/start { places }             -> sessionId
every ~3 s    POST /tour/tick  { sessionId, gps }     -> maybe a narration to play
chat button   POST /tour/chat  { sessionId, message } -> reply + sources
trip ends     POST /tour/end   { sessionId }
```

1. **Start** with the chosen route's landmarks and food stops. Keep the `places` array.
2. **Tick** with `expo-location` (`coords.latitude`, `longitude`, `heading`, `speed`). **Await each tick before scheduling the next** (~3 s); never two in flight.
3. **Play** each narration as it arrives, one at a time (see [Playing narration](#playing-narration)). Show the place name and its side.
4. **Chat**: show `sources` under the reply when present; if `placeId` is set, you can highlight that pin.
5. **Recover**: on `404 unknown_session`, call `/tour/start` again with the same places, keep the new `sessionId`, retry. Already-narrated places may play again (from the server's cache, instantly).
6. **End** with `/tour/end`.
7. **Simulated drive** (dev): start with the `places` from `/dev/demo-path` and tick its points instead of GPS. This is what the judges watch.

### `POST /tour/start`

```json
{
  "places": [
    {
      "id": "ChIJ...kaseya",
      "name": "Kaseya Center",
      "kind": "landmark",
      "category": "arena",
      "tagline": "Home of the Miami Heat",
      "description": "Waterfront arena on Biscayne Bay...",
      "facts": ["Home arena of the NBA's Miami Heat.", "Opened in 1999."],
      "lat": 25.7814,
      "lng": -80.187
    }
  ]
}
```
→ `{ "sessionId": "6d17814d-..." }`

```ts
interface Place {
  id: string;
  name: string;
  kind: "landmark" | "restaurant";
  lat: number;
  lng: number;
  category?: string;
  tagline?: string;
  description?: string;
  facts?: string[];   // the more facts, the better the line
}
```

From `/route`: `landmarks[]` become `kind: "landmark"`, `foodStops[]` become `kind: "restaurant"`; pass `description` through. `side` is ignored (the server computes it). Empty `places` is allowed; at most 200.

### `POST /tour/tick`

```json
{ "sessionId": "6d17...", "lat": 25.7771, "lng": -80.1882, "heading": 3.1, "speedMps": 8 }
```

`heading` (degrees, 0 = north) and `speedMps` are optional; send what `expo-location` gives, including `-1` or `null`. A negative heading, or any heading below 2 m/s, counts as unknown and the server derives the direction from movement.

```json
{ "narration": null, "pending": null }
{ "narration": null, "pending": "ChIJ...kaseya" }
{
  "narration": {
    "placeId": "ChIJ...kaseya",
    "name": "Kaseya Center",
    "side": "right",
    "text": "On your right is the Kaseya Center, a waterfront arena on Biscayne Bay that's been home to the Miami Heat since 1999.",
    "audioUrl": "https://<tunnel>.trycloudflare.com/audio/ChIJ___kaseya-3f9a0c1b2d.mp3",
    "durationHintS": 9.4
  },
  "pending": null
}
```

- `pending` is the place being written/voiced; the narration arrives on a later tick, **exactly once**. A lost tick response loses that narration (accepted: the car has moved on).
- `side` is `"left"`, `"right"` or `"ahead"` (`"ahead"` when the heading is unknown).
- `audioUrl` is absolute when the server has `PUBLIC_BASE_URL` set, otherwise `/audio/<file>.mp3` to prefix with the base URL. `null` means no audio (mock mode or a voice failure): show `text` instead.
- Timing: a place triggers ~40 s before the car reaches it (or within 250 m); generation takes ~3 s (a few ms from the disk cache), so narration arrives ~30 s before the car passes. Narrations that went stale first (place now behind, car moving away, or 45 s old) are dropped.

### `POST /tour/chat`

```json
{ "sessionId": "6d17...", "message": "How long has the Heat played there?" }
```
```json
{
  "reply": "The Miami Heat have been playing at the Kaseya Center since it opened at the end of 1999; their first game there was January 2, 2000.",
  "placeId": "ChIJ...kaseya",
  "sources": [{ "title": "Kaseya Center", "url": "https://en.wikipedia.org/wiki/Kaseya_Center?utm_source=openai" }]
}
```

- `message`: 1–500 characters. `reply`: 1–4 plain-text sentences in the guide's voice; it knows the car's position, the last 3 narrations, nearby route places and the last 10 turns, so "what was that?" works.
- `placeId`: the route place the exchange names (nearest to the car wins), or `null`.
- `sources`: web pages the answer cited; can be empty.
- Takes ~2–4 s. On failure or after 12 s: `200` with `"reply": "Sorry, I lost my signal for a sec, can you ask again?"` and `sources: []`.

### `POST /tour/end`

`{ "sessionId": "6d17..." }` → `{ "ok": true }`

### `GET /dev/demo-path`

Not available when the backend runs with `NODE_ENV=production`.

```json
{
  "points": [{ "lat": 25.7752, "lng": -80.18817, "heading": 357.5, "speedMps": 8 }, "..."],
  "intervalMs": 3000,
  "places": [{ "id": "demo-kaseya-center", "name": "Kaseya Center", "kind": "landmark", "...": "..." }]
}
```

A 2-minute drive (40 points) north on Biscayne Blvd past Bayside Marketplace (right), Freedom Tower (left) and Kaseya Center (right). Start the session with **exactly these `places`** so narration plays from the server's disk cache, then send one point per tick as `{ sessionId, ...point }` every `intervalMs`, still awaiting each response.

## Pregenerated narration

The app's current tour mode: ask for every place's line and audio when the trip starts, then trigger playback on the phone as the car approaches each place. The [live guide](#live-guide) is the server-driven alternative that also adds chat; both share the same disk cache and voice.

### `POST /narration/pregenerate`

`{ "places": Place[] }` (1–100 places, `Place` as in `/tour/start`, plus an optional `side`: `"left" | "right" | "ahead"`) → one `Narration` per place, **in the same order**:

```json
[
  { "placeId": "ChIJ...kaseya", "text": "On your right is Kaseya Center, home of the Miami Heat.", "audioUrl": "/audio/ChIJ___kaseya-3f9a0c1b2d.mp3", "durationHintS": 3.8 }
]
```

`audioUrl` is always relative here (prefix it with the base URL) and `null` when there's no audio. A place that fails still gets an entry, with a fallback line and `audioUrl: null`. The first call for a route can take a while (voices are generated one at a time); later calls come from the cache. The proxy waits up to 120 s.

### `POST /narration`

Same for one place: the body is one `Place`, the response one `Narration`.

## Playing narration

1. **One at a time, never overlapping.** A narration that arrives while another plays goes to the end of a queue. The server already drops stale ones, so play everything you receive.
2. **No audio:** if `audioUrl` is `null` (or the download fails), show `text` as a caption for `durationHintS` seconds, or read it with `expo-speech`. That counts as the clip for queue purposes.
3. **Callbacks read refs, not state.** The playback-finished callback is created when a clip starts; if it reads the queue from React state it sees a stale copy. Keep the queue in a `useRef` and call `setState` only to re-render.
4. **One controller** with `pause()` / `resume()` and a `paused` flag, for the mute toggle.

```ts
const sessionRef = useRef<string | null>(null);
const queueRef = useRef<Narration[]>([]);
const playingRef = useRef(false);
const pausedRef = useRef(false);

async function call(path: string, body: object, places: Place[]) {
  let res = await api.post(path, { sessionId: sessionRef.current, ...body });
  if (res.status === 404 && res.body.error === "unknown_session") {
    sessionRef.current = (await api.post("/tour/start", { places })).body.sessionId;
    res = await api.post(path, { sessionId: sessionRef.current, ...body });
  }
  return res;
}

async function tickLoop(places: Place[], nextFix: () => Promise<Fix>) {
  while (touring) {
    const started = Date.now();
    const { coords } = await nextFix();
    const res = await call("/tour/tick", {
      lat: coords.latitude, lng: coords.longitude, heading: coords.heading, speedMps: coords.speed,
    }, places);
    if (res.body.narration) { queueRef.current.push(res.body.narration); playNext(); }
    await sleep(Math.max(0, 3000 - (Date.now() - started)));
  }
}

async function playNext() {
  if (playingRef.current || pausedRef.current) return;
  const next = queueRef.current.shift();
  if (!next) return;
  playingRef.current = true;
  await playClipOrShowCaption(next);   // resolves when finished
  playingRef.current = false;
  playNext();                          // reads refs, never stale state
}

export const narrationControl = {
  pause() { pausedRef.current = true; /* also pause the current sound */ },
  resume() { pausedRef.current = false; playNext(); },
};
```
