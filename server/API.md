# Server API reference

Base URL during dev: `http://<your-machine-LAN-IP>:3000` (or `http://localhost:3000` from an iOS Simulator, which shares your Mac's network). A physical device on Expo Go cannot reach `localhost` — that resolves to the phone itself.

Run `cp .env.example .env` and fill in `GOOGLE_MAPS_API_KEY` before starting. `npm run dev` boots the server on `PORT` (default `3000`).

The client (mobile app) should only ever call **this** server — never Google's APIs directly. The Google Maps Platform key lives only in `server/.env` and is never returned in any response.

All error responses share one shape: `{ "error": "<message>" }`, with an appropriate HTTP status (400 for bad input, 404 for not-found, 500 for server misconfiguration, 502 for upstream Google API failures).

---

## `GET /health`

Liveness check.

```json
{ "status": "ok" }
```

---

## `POST /geocode`

Address → coordinates.

**Body**
```json
{ "address": "1600 Amphitheatre Parkway, Mountain View, CA" }
```

**Response — 200**
```json
{
  "lat": 37.4224764,
  "lng": -122.0842499,
  "formattedAddress": "1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA"
}
```

**Errors**: `400` missing/empty `address`; `404` no geocoding result; `502` Google API error.

---

## `POST /route`

The main endpoint. `{start, end}` addresses → both a fastest ("normal") and a most-scenic route, plus the time difference — the app's normal/scenic toggle needs only this one call, no second request.

**Body**
```json
{ "start": "Golden Gate Bridge, San Francisco, CA", "end": "Fisherman's Wharf, San Francisco, CA" }
```

**Query params** (both optional, both clamped server-side — see `server/src/config.ts` for exact min/max):

| param | default | meaning |
|---|---|---|
| `sampleIntervalMeters` | `1200` | distance between POI-search sample points along the route polyline |
| `searchRadiusMeters` | `500` | Places Nearby Search radius at each sample point |

Denser sampling (`sampleIntervalMeters` lower, `searchRadiusMeters` higher) finds more POIs but costs more Places API calls and adds latency — useful to tune this while testing.

**Response — 200**
```json
{
  "start": { "lat": 37.8199, "lng": -122.4786, "formattedAddress": "..." },
  "end":   { "lat": 37.8086, "lng": -122.4125, "formattedAddress": "..." },
  "normal": { "...": "RouteOption, see below" },
  "scenic": { "...": "RouteOption, see below" },
  "extraTimeSeconds": 174
}
```

`normal` is the fastest candidate by duration. `scenic` is the candidate with the highest rating-weighted landmark score (sum of landmark ratings; ties broken by shorter duration) — see `server/src/lib/scoring.ts`. They can be the same route if the fastest candidate also happens to score highest. `extraTimeSeconds = scenic.durationSeconds - normal.durationSeconds` (can be `0`).

**`RouteOption` shape** (identical for `normal` and `scenic`):

```ts
{
  distanceMeters: number;
  durationSeconds: number;
  polyline: string;          // Google encoded polyline — decode client-side to render on a map
  samplePointCount: number;  // how many points were sampled for POI search; debug/tuning info
  score: number;             // sum of landmark ratings; debug/tuning info, not needed for display
  landmarks: Poi[];
  foodStops: Poi[];
}
```

**`Poi` shape** (identical for `landmarks` and `foodStops`):

```ts
{
  id: string;
  name: string;
  lat: number;
  lng: number;
  types: string[];            // raw Google Places types, e.g. ["tourist_attraction", ...]
  rating?: number;             // 1-5; foodStops are pre-filtered to rating >= 4.0
  userRatingCount?: number;
  priceLevel?: string;         // "$" .. "$$$$" or "Free"; foodStops only
  cuisine?: string;            // e.g. "Mediterranean"; derived from types, foodStops only
  description?: string;        // Google-authored editorial summary, when Google has one —
                                // only ~1/3 of POIs have this; absent otherwise, don't assume it's always there
  photoUrl?: string;            // relative path on THIS server, e.g. "/photo?name=places%2F...";
                                // prefix with the server base URL and load directly in an <Image>
}
```

**Errors**: `400` missing/empty `start` or `end`; `404` a geocode or route lookup failed; `502` upstream Google API error.

**Known gaps** (tracked in `TODO.md`): most POIs have no `description` yet (Google's editorial summaries are sparse) — richer descriptions are planned via web-search enrichment or an LLM call, not yet built. Restaurant chain-filtering (favor local/independent spots) is also not implemented — only the rating ≥ 4.0 filter is applied.

---

## `GET /photo`

Proxies a Places photo so the Google API key never reaches the client — Google's own Photo Media endpoint requires the key as a query param, so this server fetches it server-side and streams the bytes back.

**Query params**
- `name` (required) — the `photoUrl`'s `name` value from a `Poi`, e.g. `places/ChIJ.../photos/AeJ...`. Reject anything not matching that shape.
- `maxWidthPx` (optional, default `800`, clamped `100`–`1600`)

**Usage**: don't construct this URL by hand — always use the `photoUrl` field already returned on a `Poi` and just prefix it with the server base URL:
```
const imageUrl = `${API_BASE_URL}${poi.photoUrl}`;
<Image source={{ uri: imageUrl }} />
```

**Response — 200**: raw image bytes, `Content-Type` from Google, `Cache-Control: public, max-age=86400`.

**Errors**: `400` malformed/missing `name`; `404`/`502` Google couldn't serve the photo.

---

## Not yet built

- `POST /autocomplete` — no address-autocomplete proxy exists yet. An address input field currently needs a plain text address good enough for `/geocode`/`/route` to resolve (e.g. "Golden Gate Bridge, San Francisco, CA"). If you build Places Autocomplete into the input screen, it must hit a new server-side proxy endpoint, not Google directly — the key must stay server-side, same reasoning as `/photo`.
