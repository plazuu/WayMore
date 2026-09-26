# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A mobile app that finds the most scenic route between two points, surfaces nearby landmarks and restaurants along the way, and (future phase) narrates them aloud as you pass them, like a local tour guide. See `README.md` for the product pitch and `TODO.md` for the milestone-by-milestone task breakdown (M0–M4) — TODO.md is the source of truth for what's built vs. not yet started.

## Repo layout — three separate services, three separate dependency trees

- **`mobile/`** — Expo (React Native + TypeScript) client. Currently the stock `create-expo-app` blank-typescript template; not yet wired to any backend. Has its own `AGENTS.md`/`CLAUDE.md` (Expo's own agent guidance, imported via `@AGENTS.md`) — read that when working inside `mobile/`, since it covers Expo-SDK-version drift, Expo Router conventions, and EAS build commands that don't apply anywhere else in this repo.
- **`server/`** — Node/Express + TypeScript API. This is the backend the mobile app talks to; it in turn holds the Google Maps Platform key server-side (Places, Routes, Geocoding, Photos) so the key is never shipped in the mobile bundle. Exposes `GET /health`, `POST /geocode`, `POST /route`, and `GET /photo` — see `server/API.md` for the full request/response reference (read this before wiring up the mobile client).
- **`backend/`** — reserved for the future LLM/narration service (TODO.md M3, live tour-guide narration). `backend/main.py` is currently an empty placeholder — do not repurpose it for the Express API above.

Each of the three has independent dependencies/lockfiles; there is no shared `node_modules` or monorepo tooling (no workspaces/turborepo) tying them together.

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
npm run dev    # tsx watch src/index.ts — hot-reload dev server
npm run build  # tsc -> dist/
npm run start  # node dist/index.js — run compiled build
npx tsc --noEmit  # typecheck only
```
Copy `server/.env.example` to `server/.env` and fill in `GOOGLE_MAPS_API_KEY` before running. No test runner is configured yet in either package.

## Architecture / data flow (per TODO.md, not all built yet)

The intended pipeline, once M1 lands:
1. Mobile sends `{start, end}` addresses to the server.
2. Server geocodes both, fetches candidate routes (Routes API), and samples Places Nearby Search along each route's polyline for landmarks and restaurants.
3. Server scores each candidate by landmark rating-weighted score (restaurants are suggested stops, not scoring inputs) and picks both the fastest candidate ("normal") and the highest-scoring candidate ("scenic"), then enriches each POI with `description`/`cuisine`/`priceLevel` (currently pulled from Places' own `editorialSummary`/`types`/`priceLevel` fields — only a minority of POIs have a Google-authored summary, so richer coverage still needs web search or an LLM call, both still TODO) and a `photoUrl`.
4. Single `POST /route` response shape: `{normal: {polyline, distanceMeters, durationSeconds, landmarks[], foodStops[]}, scenic: {...same shape...}, extraTimeSeconds}` — one call returns both routes plus their time difference so the mobile app's normal/scenic toggle needs no second request. This is the only endpoint the mobile app is meant to call directly; it should never call Google Maps APIs itself.
5. `GET /photo?name=<placePhotoResourceName>` proxies Google's Places Photo Media endpoint server-side and streams the image bytes back — `photoUrl` in the `/route` response is already a relative path to this endpoint. The API key is required as a query param on Google's media endpoint, so this proxy exists specifically to keep the key server-side; the mobile app must never be given a direct Google Photos URL.

Later (M3), the `backend/` LLM service consumes the same POI list (already shaped as `{id, name, lat, lng, types, rating, priceLevel?, cuisine?, description?, photoUrl?}` per POI) to generate narration text, which the mobile app plays via `expo-speech` as the user's live location (`expo-location` `watchPosition`) approaches each POI.

## Branch workflow

Feature branches only, PR into `main` — never push directly to `main`. `TODO.md` names the suggested branch per milestone (e.g. `setup/project-init`, `feature/route-scoring`, `feature/mobile-map`, `feature/tour-guide`, `feature/polish`).
