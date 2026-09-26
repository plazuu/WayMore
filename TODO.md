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
- [x] `POST /route` — `{start, end}` → `{normal: {polyline, distanceMeters, durationSeconds, landmarks[], foodStops[]}, scenic: {...same shape...}, extraTimeSeconds}` — single call returns both the fastest and highest-scoring route plus their time difference, so the app's normal/scenic toggle needs no second request. Each POI carries `{id, name, lat, lng, types, rating, userRatingCount, priceLevel?, cuisine?, description?, photoUrl?}` — this is the exact shape the M3 `backend/` LLM tour-guide service will consume to generate narration

## M2 — Mobile app: map + route display
Branch: `feature/mobile-map`
*Depends on M1*

- [ ] Start/end input screen with Places Autocomplete — input sheet done (`mobile/src/components/sheets/PlanTripSheet.tsx`, plain text); autocomplete still needs a server proxy endpoint
- [x] Map screen (`react-native-maps`) rendering polyline + POI pins — `mobile/src/components/map/`. Map tiles need a dev build with `GOOGLE_MAPS_ANDROID_API_KEY` (Expo Go's key is rejected), see `mobile/README.md`
- [x] Normal/Scenic toggle — switches which route object from the single `/route` response is rendered (no second request needed); show `extraTimeSeconds` as "+N min" next to the toggle
- [x] Distinct pin icon/color for landmarks vs. food stops
- [x] Filter toggle in UI — "Show: Landmarks / Food / Both"
- [x] Landmark detail card on pin tap — photo + description
- [x] Restaurant detail card — cuisine, price level, blurb, photo
- [x] Loading/error states while backend computes the route
- [x] Dev setting: slider/input for POI sampling interval + search radius (passes `sampleIntervalMeters`/`searchRadiusMeters` to `POST /route`) — for testing landmark density vs. API cost tradeoffs, not a user-facing feature

## M3 — Live tour guide
Branch: `feature/tour-guide`
*Depends on M1 (POI data) + M2 (map/location screen)*

- [x] Location permission + `expo-location` `watchPosition` — plus a simulated drive for emulators (`mobile/src/features/tour/usePosition.ts`); GPS path not yet tested on a real device
- [x] Proximity engine — distance + bearing check per POI (only trigger when ahead of you, not behind)
- [x] Narration queue — sequential playback, mark POI "visited" so it never re-triggers
- [x] TTS playback via `expo-speech` (MVP voice) — plays server MP3s (`expo-audio`) when `audioUrl` is set, falls back to `expo-speech`
- [x] Narration tone: landmarks = informative, food stops = suggestion ("coming up on your right...")
- [x] "Now touring" UI — current/next POI banner, mute toggle (landmarks and food stops mutable separately)

## M4 — Polish / demo prep
Branch: `feature/polish`

- [ ] Handle no-landmarks-found edge case gracefully
- [ ] Pre-fetch/cache POI data client-side before trip starts (avoids live calls while driving)
- [ ] App icon, splash screen, basic style pass
- [ ] Rehearse demo, record backup video in case of live-demo wifi issues

## Stretch (only if time remains)

- [ ] Detour insertion into scoring (bounded waypoint optimization to route through a great nearby landmark)
- [ ] Higher-quality TTS voice (e.g. ElevenLabs)
- [ ] Shareable route links
- [ ] Adjustable trip time budget slider
