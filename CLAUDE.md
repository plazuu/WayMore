# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WayMore: a mobile app that finds the most scenic route between two points, surfaces landmarks and restaurants along the way, and narrates them aloud as you pass (live tour guide), with a text chat for passenger questions. `README.md` covers setup, running and the demo; `docs/api.md` is the API for the app team; `TODO.md` is the source of truth for what's built vs. not yet started (milestones M0–M4).

## Repo layout — three separate packages, three separate dependency trees

- **`mobile/`** — Expo (React Native + TypeScript) client using Expo Router (`src/app/`). One map screen with a phase-driven bottom sheet (plan → preview → tour), wired to `POST /route` and `/narration/pregenerate`, with a built-in demo-data mode for working without the server. See the "Mobile app" section of the root `README.md` for layout and extension points. Has its own `AGENTS.md`/`CLAUDE.md` (Expo's own agent guidance, imported via `@AGENTS.md`) — read that when working inside `mobile/`, since it covers Expo-SDK-version drift, Expo Router conventions, and EAS build commands that don't apply anywhere else in this repo.
- **`server/`** — Node/Express + TypeScript, port 3000, the app's **single base URL**. Holds the Google Maps key (Places, Routes, Geocoding, Photos) and serves `GET /health` (including the backend's status), `POST /geocode`, `POST /route`, `GET /photo`. Proxies `/tour/*`, `/narration/*`, `/audio/*` and `/dev/*` to `backend/` (`src/routes/proxy.ts`: `BACKEND_URL`, 20 s timeout or 120 s for `/narration`, `502 backend_unavailable`); the proxy is mounted before the JSON body parser so bodies stream through.
- **`backend/`** — Node/Express + TypeScript narration service, port 3001, internal (only reached through `server/`'s proxy). Holds the OpenAI and Speechify/ElevenLabs keys. Serves the live guide (`POST /tour/start|tick|chat|end`), pregenerated narration (`POST /narration`, `/narration/pregenerate`, used by the app's current tour mode), cached audio (`/audio/*.mp3`) and `GET /dev/demo-path` outside production. Code:
  - `src/live/` — `session.ts` (sessions, trigger rule, heading fallbacks, background generation queue, staleness), `chat.ts` (chat agent), `geo.ts`, `demoPath.ts` (demo drive + its `/dev` route).
  - `src/narration/` — `prompts.ts`, `scriptWriter.ts` (cleaner, guardrails, template fallback), `tts.ts` (TTS limiter/retry), `cache.ts` (disk cache keyed by place + side + model + voice).
  - `src/services/` — `openai.ts` (the LLM: narration `generate()`, chat `chat()` with `web_search` and sources), `speechify.ts`, `elevenlabs.ts`.
  - `src/routes/tour.ts` — the `/tour/*` and `/audio` routes; `src/routes/narration.ts` — `/narration` and `/narration/pregenerate`.
  - `src/config.ts` — every tunable: models, timings (`LIVE_GUIDE`), TTS settings.

No shared `node_modules` or monorepo tooling; each package has its own lockfile.

## Commands

**Mobile (`mobile/`):**
```
npm run ios      # expo start --ios
npm run android  # expo start --android
npm run web      # expo start --web
npx expo install <package>   # always use this instead of npm/yarn add — resolves SDK-compatible native versions
npx tsc --noEmit              # typecheck
```

**Server (`server/`):**
```
npm run dev:all   # starts backend/ and server/ together in one terminal (Ctrl+C stops both)
npm run dev       # tsx watch src/index.ts — server only
npm run build     # tsc -> dist/
npm run start     # node dist/index.js
npm run typecheck # tsc on src + test
npm test          # node:test via tsx (proxy tests against a fake backend)
```
`server/.env`: `GOOGLE_MAPS_API_KEY`, `BACKEND_URL` (default `http://localhost:3001`).

**Backend (`backend/`):**
```
npm run dev       # tsx watch src/index.ts — backend only, port 3001
npm run build     # tsc -> dist/
npm run start     # node dist/index.js
npm run typecheck # tsc on src + test
npm test          # node:test via tsx (test/*.test.ts), mocks only
npm run replay:drive  # simulated demo drive through /tour/*; -- --real for real keys, --fresh to bypass the cache
```
`backend/.env`: `OPENAI_API_KEY`, `SPEECHIFY_API_KEY`, optional model overrides, and `PUBLIC_BASE_URL` = the app's public URL (the `server/` tunnel) so audio URLs go through the proxy. Without keys it runs in mock mode (template lines, no audio, offline chat reply). `mobile/` has no test runner yet.

## Architecture / data flow

Route search (M1, built):
1. Mobile sends `{start, end}` addresses to `POST /route`.
2. The server geocodes both, fetches candidate routes (Routes API), and samples Places Nearby Search along each polyline for landmarks and restaurants.
3. It also requests a no-highway route and routes through waterfront spots, then picks the fastest candidate ("normal") and the scenic one: within an extra-time budget, least non-waterfront highway first, then most waterfront plus landmark ratings (parks discounted; restaurants are suggested stops, not scoring inputs, and food-type landmarks only count within 1 km of the drop-off; see `server/src/lib/scoring.ts`), and enriches each POI with `description`/`cuisine`/`priceLevel` from Places' own fields (only a minority have a Google summary) and a `photoUrl`.
4. Response: `{normal, scenic, extraTimeSeconds}`, one call for the app's normal/scenic toggle. The app never calls Google APIs itself; `GET /photo` resolves a Places photo to its CDN URL (cached in memory) and 302s the client there, so the key stays server-side without the bytes passing through us. The app prefetches every POI photo when a route arrives (`mobile/src/lib/photos.ts`).

Live guide (M3, server side built): the app starts a session with the chosen route's POIs mapped to `Place` (`{id, name, kind, lat, lng, category?, description?, facts?}`), then sends GPS ticks (`expo-location`) to `POST /tour/tick` about every 3 s. The backend decides when the car approaches a place, writes the line (OpenAI `gpt-4.1-nano`) and voices it (Speechify) in the background, and returns it on a later tick. `POST /tour/chat` (OpenAI `gpt-4o-mini` with web search) answers passenger questions with the ride as context.

## Branch workflow

Feature branches only, PR into `main` — never push directly to `main`. `TODO.md` names the suggested branch per milestone (e.g. `setup/project-init`, `feature/route-scoring`, `feature/mobile-map`, `feature/tour-guide`, `feature/polish`).
