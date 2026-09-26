# TODO

Task breakdown for the Scenic Route & Tour Guide app. Work each milestone on its own branch (see README), PR into `main` when ready.

Stack assumption: React Native (Expo) + TypeScript for the mobile app, Node/Express backend, Google Maps Platform APIs (Places, Routes, Geocoding, Photos) plus web search for enrichment.

## M0 — Setup
Branch: `setup/project-init`

- [x] Init Expo (React Native + TypeScript) app skeleton — `mobile/`, `react-native-maps`/`expo-location`/`expo-speech` installed
- [x] Init backend service (Node/Express) folder, env config for secrets — `server/`, `GET /health` boots and responds, `.env.example` in place
- [ ] Get Google Maps Platform API key — enable Places, Routes, Geocoding, Photos, Places Autocomplete
- [x] Confirm branch workflow per README (feature branches → PR into `main`)

## M1 — Scenic route backend
Branch: `feature/route-scoring`

- [ ] `POST /geocode` — address → lat/lng
- [ ] Routes API integration — fetch alternative candidate routes between two points
- [ ] POI discovery — Places Nearby Search sampled along each route's polyline, for:
  - [ ] Landmarks (tourist attraction / park / museum / historic site / viewpoint)
  - [ ] Restaurants/cafes (rating ≥ 4.0, filter out chains, favor local/independent spots)
- [ ] Web search enrichment — pull extra landmark/restaurant mentions and descriptions Places misses
- [ ] Scoring algorithm — rank candidate routes by landmark density/quality (restaurants are suggested stops, not route-scoring inputs)
- [ ] Select winning route + ordered POI list
- [ ] Enrichment — photo (Places Photo API) + 2-3 sentence description per landmark; photo + cuisine/price + blurb per restaurant
- [ ] `POST /route` — `{start, end}` → `{polyline, landmarks[], foodStops[]}` (single endpoint the app calls)

## M2 — Mobile app: map + route display
Branch: `feature/mobile-map`
*Depends on M1*

- [ ] Start/end input screen with Places Autocomplete
- [ ] Map screen (`react-native-maps`) rendering polyline + POI pins
- [ ] Distinct pin icon/color for landmarks vs. food stops
- [ ] Filter toggle in UI — "Show: Landmarks / Food / Both"
- [ ] Landmark detail card on pin tap — photo + description
- [ ] Restaurant detail card — cuisine, price level, blurb, photo
- [ ] Loading/error states while backend computes the route

## M3 — Live tour guide
Branch: `feature/tour-guide`
*Depends on M1 (POI data) + M2 (map/location screen)*

- [ ] Location permission + `expo-location` `watchPosition`
- [ ] Proximity engine — distance + bearing check per POI (only trigger when ahead of you, not behind)
- [ ] Narration queue — sequential playback, mark POI "visited" so it never re-triggers
- [ ] TTS playback via `expo-speech` (MVP voice)
- [ ] Narration tone: landmarks = informative, food stops = suggestion ("coming up on your right...")
- [ ] "Now touring" UI — current/next POI banner, mute toggle (landmarks and food stops mutable separately)

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
