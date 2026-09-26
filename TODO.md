# TODO

Task breakdown for the Scenic Route & Tour Guide app. Work each milestone on its own branch (see README), PR into `main` when ready.

Stack assumption: React Native (Expo) + TypeScript for the mobile app, Node/Express backend, Google Maps Platform APIs (Places, Routes, Geocoding, Photos) plus web search for enrichment.

## M0 — Setup
Branch: `setup/project-init`

- [x] Init Expo (React Native + TypeScript) app skeleton — `mobile/`, `react-native-maps`/`expo-location`/`expo-speech` installed
- [x] Init backend service (Node/Express) folder, env config for secrets — `server/`, `GET /health` boots and responds, `.env.example` in place
- [x] Get Google Maps Platform API key — enable Places, Routes, Geocoding, Photos, Places Autocomplete
- [x] Confirm branch workflow per README (feature branches → PR into `main`)

## M1 — Scenic route backend
Branch: `feature/route-scoring`

- [x] `POST /geocode` — address → lat/lng — `server/src/routes/geocode.ts`
- [x] Routes API integration — fetch alternative candidate routes between two points — `server/src/lib/googleMaps.ts` (`computeRoutes`)
- [x] POI discovery — Places Nearby Search sampled along each route's polyline, for:
  - [x] Landmarks (tourist_attraction / park / museum / historical_landmark)
  - [x] Restaurants/cafes (rating ≥ 4.0 filter applied; chain-filtering still not implemented — no reliable "is this a chain" signal from Places data yet, revisit if it matters for the demo)
  - [x] Sampling interval + search radius are tunable (`POST /route?sampleIntervalMeters=&searchRadiusMeters=`, defaults 1200m/500m, see `server/src/config.ts`) — see M2 item to expose this as an in-app setting
- [ ] Web search enrichment — pull extra landmark/restaurant mentions and descriptions Places misses
- [x] Scoring algorithm — rank candidate routes by landmark rating-weighted score (sum of landmark ratings; restaurants are suggested stops, not route-scoring inputs) — `server/src/lib/scoring.ts`
- [x] Select winning route + ordered POI list — done as part of the normal/scenic split below
- [x] Enrichment (partial) — `GET /photo?name=` proxies Places Photo Media server-side so the API key never reaches the client (`server/src/routes/photo.ts`); `description`/`cuisine`/`priceLevel` pulled from Places' own `editorialSummary`/`types`/`priceLevel` fields (`server/src/lib/places.ts`) — only ~1/3 of landmarks have a Google-authored summary, so most POIs still have no description until web search or an LLM call fills the gap (see M3 LLM narration + Stretch)
- [x] `POST /route` — `{start, end}` → `{normal: {polyline, distanceMeters, durationSeconds, landmarks[], foodStops[]}, scenic: {...same shape...}, extraTimeSeconds}` — single call returns both the fastest and highest-scoring route plus their time difference, so the app's normal/scenic toggle needs no second request. Each POI carries `{id, name, lat, lng, types, rating, userRatingCount, priceLevel?, cuisine?, description?, photoUrl?}` — the app maps these to the `Place` shape the live guide takes in `/tour/start` (see `docs/api.md`)

## M2 — Mobile app: map + route display
Branch: `feature/mobile-map`
*Depends on M1*

- [ ] Start/end input screen with Places Autocomplete
- [ ] Map screen (`react-native-maps`) rendering polyline + POI pins
- [ ] Normal/Scenic toggle — switches which route object from the single `/route` response is rendered (no second request needed); show `extraTimeSeconds` as "+N min" next to the toggle
- [ ] Distinct pin icon/color for landmarks vs. food stops
- [ ] Filter toggle in UI — "Show: Landmarks / Food / Both"
- [ ] Landmark detail card on pin tap — photo + description
- [ ] Restaurant detail card — cuisine, price level, blurb, photo
- [ ] Loading/error states while backend computes the route
- [ ] Dev setting: slider/input for POI sampling interval + search radius (passes `sampleIntervalMeters`/`searchRadiusMeters` to `POST /route`) — for testing landmark density vs. API cost tradeoffs, not a user-facing feature

## M3 — Live tour guide
Branch: `live-guide`
*Depends on M1 (POI data) + M2 (map/location screen)*

Approach: everything is live, nothing is pregenerated. The app streams GPS ticks; the `backend/` service decides when the car approaches a place, writes the line with OpenAI, voices it with Speechify and returns it on a later tick. A text chat agent answers passenger questions. API and app flow: `docs/api.md`. (The earlier "pregenerate everything" flow, its `/narration` endpoints, and the abandoned `feature/dialog-contract` plan were removed.)

Narration service (`backend/`; `backend/src/live/`, `backend/src/routes/tour.ts`):
- [x] In-memory sessions — `POST /tour/start` / `POST /tour/end`, 2 h idle TTL; `404 unknown_session` → app restarts the session with the same places
- [x] Proximity engine — `POST /tour/tick`: trigger on ETA ≤ 40 s or ≤ 250 m, only places in front (±100°), once per session, nearest first; left/right/ahead side; heading fallbacks (negative heading or < 2 m/s → derive from movement ≥ 10 m → else "ahead")
- [x] Live generation in the background — LLM line (template fallback) + Speechify audio (`audioUrl: null` fallback), one at a time per session, returned exactly once
- [x] Staleness — drop ready/queued narrations once the place is behind, the distance grew 2 ticks in a row, or 45 s passed
- [x] Disk cache by place + side + model + voice, so repeat passes and the demo play instantly
- [x] Narration tone: landmarks informative, restaurants framed as food stops (prompt in `backend/src/narration/prompts.ts`)
- [x] Chat agent — `POST /tour/chat` with car position, last 3 narrations, nearby places and last 10 turns as context; web search with `sources` (OpenAI `web_search`); server-side `placeId`; 12 s timeout fallback
- [x] All timings and model names in one place (`LIVE_GUIDE` / `llmConfig` in `backend/src/config.ts`)
- [x] `GET /dev/demo-path` + `npm run replay:drive` (simulated drive past Bayside Marketplace, Freedom Tower, Kaseya Center)
- [x] One base URL for the app: `server/` proxies `/tour`, `/audio`, `/dev` to `backend/` (streamed, 20 s timeout, `502 backend_unavailable`), `/health` shows the backend's status, `npm run dev:all` starts both; one tunnel, `PUBLIC_BASE_URL` = the `server/` tunnel URL
- [x] LLM is OpenAI (switched from Gemini for cost; Gemini support removed): `gpt-4.1-nano` for narration (most natural spoken lines, ~1 s), `gpt-4o-mini` for chat (supports `web_search`, cites sources, ~3 s). Chosen by benchmarking the key's mini/nano models
- [ ] Chat `placeId` only matches place names; a reply that says "there" without naming the place gives `null` (could fall back to the last narrated place). The OpenAI chat model usually names the place, so this is rarer now

App (`mobile/`):
- [ ] Location permission + `expo-location` `watchPosition`; tick loop every ~3 s, awaiting each `/tour/tick`
- [ ] Playback queue — one clip at a time, never overlapping; caption (or `expo-speech`) when `audioUrl` is null
- [ ] "Now touring" UI — place name + side banner, mute toggle
- [ ] Chat screen calling `/tour/chat`, sources under replies
- [ ] `unknown_session` recovery (re-`/tour/start` with the same places)
- [ ] "Simulated drive" toggle fed by `/dev/demo-path`

## M4 — Polish / demo prep
Branch: `feature/polish`

- [ ] Handle no-landmarks-found edge case gracefully
- [ ] Pre-fetch/cache POI data client-side before trip starts (avoids live calls while driving)
- [ ] App icon, splash screen, basic style pass
- [ ] Rehearse demo, record backup video in case of live-demo wifi issues (see README "Demo day": `npm run replay:drive -- --real` fills the audio cache)

## Stretch (only if time remains)

- [ ] Detour insertion into scoring (bounded waypoint optimization to route through a great nearby landmark)
- [ ] Higher-quality TTS voice (e.g. ElevenLabs)
- [ ] Shareable route links
- [ ] Adjustable trip time budget slider
