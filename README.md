# Shellhack2026 — Scenic Route & Tour Guide App

A mobile app that finds the most scenic route between two points, surfaces landmarks and local restaurants along the way, and narrates them aloud as you pass, like a local tour guide riding along. Passengers can also text the guide questions. Aimed at tourists and anyone who wants to get to know an area better.

## What it does

1. **Route**: the user enters a start and end address. The server fetches candidate routes and returns both the fastest and the most scenic one (the one passing the best-rated landmarks), with landmarks along each; restaurants are suggested only near the destination (last mile).
2. **Map**: the app shows the route with landmark and restaurant pins, each with a photo and a short description.
3. **Live tour guide**: during the trip the app streams its GPS position. As the car approaches a place, the server writes a line ("On your left is the Freedom Tower...") and voices it; the app plays it.
4. **Chat**: a passenger types a question ("How long has the Heat played there?") and the guide texts back, knowing where the car is and what it just narrated, with web sources.

## Layout

| Folder | What | Port |
|---|---|---|
| `mobile/` | Expo (React Native + TypeScript) app | — |
| `server/` | The app's **only** base URL: route search over Google Maps (`/route`, `/geocode`, `/photo`), and a proxy for `/tour`, `/narration`, `/audio`, `/dev` to `backend/` | 3000 |
| `backend/` | Narration service: live guide, chat, pregenerated narration and cached audio, using OpenAI (lines and chat) and Speechify (voice) | 3001 (internal) |

All API keys stay in `server/.env` and `backend/.env`; the app never sees them. The API for the app team is in [`docs/api.md`](./docs/api.md).

## Setup

Requires Node 20+.

```
cd server
npm install
cp .env.example .env
cd ../backend
npm install
cp .env.example .env
cd ../mobile
npm install
```

Fill in the keys and save:

- `server/.env`: `GOOGLE_MAPS_API_KEY` (Places, Routes, Geocoding and Photos enabled).
- `backend/.env`: `OPENAI_API_KEY` (https://platform.openai.com/api-keys, starts with `sk-`) and `SPEECHIFY_API_KEY` (Speechify API dashboard).

No OpenAI or Speechify key? The backend runs in **mock mode**: template lines instead of the LLM, no audio (`audioUrl: null`), and an "offline" chat reply. The response shapes are the same, so the app can be built against it.

## Run

Both services in one terminal (Ctrl+C stops both):

```
cd server
npm run dev:all
```

Check that everything is up:

```
curl -s localhost:3000/health
```

`backend.reachable` should be `true`; `llm.mock` and `tts.mock` show whether keys are being used.

Try the live guide without the app: replay the 2-minute demo drive past Bayside Marketplace, Freedom Tower and Kaseya Center. Mock mode takes a second and costs nothing:

```
cd backend
npm run replay:drive
```

With the real keys, ticking in real time (about 2 minutes):

```
npm run replay:drive -- --real
```

It prints when each place triggers, the line, how long generation took, whether it arrived before the car passed, and one chat answer with sources and latency. The MP3s are copied to `backend/tmp/replay/` (play one with `afplay`). Add `--fresh` to bypass the audio cache and measure cold generation, or `--question "..."` to ask something else.

## Mobile app

The Expo app (`mobile/`) is laid out like a ride-hailing app: one full-screen map with a bottom sheet whose content changes with the trip phase.

```
idle ("Where to?") → planning (start/end) → loading → preview (Fastest/Scenic, POIs) → touring (narration + Ask Guide chat)
                                                   ↘ error (retry / demo data / edit)
```

### Run it on an iPhone (Expo Go, no Xcode needed)

With `npm run dev:all` running, in a second terminal:

```
cd mobile
npx expo start --go
```

Scan the QR code with the iPhone Camera app. The phone must be on the same Wi-Fi as the laptop (see [Reaching the server from a phone](#reaching-the-server-from-a-phone)). `--go` is needed because the project includes `expo-dev-client`; without it Expo expects a development build. With Xcode installed, `npm run ios` opens the simulator instead.

- **No server or no Google key?** Open Developer settings (gear, top-left) and turn on **Use demo data**, or tap "Use demo data instead" on the error screen. You get a built-in Brickell → Wynwood route in the exact `POST /route` shape. Narration and chat still use the server when it's reachable.
- **Server URL** defaults to the machine Metro runs on, port 3000. Override it with `EXPO_PUBLIC_API_URL` in `mobile/.env` (see `mobile/.env.example`) or in Developer settings.
- **Simulate drive** (on by default) moves a fake position along the route, so narration triggers without GPS.
- **Ask Guide**: during a tour, the floating pill opens the chat. It starts its own `/tour/start` session with the route's places and sends the car's position, the places reached and the last narrated lines with each question, so the guide knows what has and hasn't been passed.
- **Android**: map tiles are blank in Expo Go because Google rejects Expo Go's bundled Maps key; routes, pins and sheets still work. For real tiles, make a development build (`npx expo run:android`) with `GOOGLE_MAPS_ANDROID_API_KEY` set; see `mobile/app.config.js`.

Typecheck with `npm run typecheck` in `mobile/`.

### Where things live

```
mobile/src/
  app/                    Expo Router screens (routes only, keep them thin)
    _layout.tsx           providers + stack
    index.tsx             map screen: picks the sheet for the current phase
    settings.tsx          developer settings (server URL, demo data, sampling, tour sim)
  api/
    types.ts              server response shapes (mirror docs/api.md)
    client.ts             fetch wrapper, base URL, ApiError, resolveServerUrl()
    endpoints.ts          one function per server endpoint
    mock/mockRoute.ts     offline demo data
  services/tripService.ts demo data vs. server switch; all screens go through here
  state/
    tripReducer.ts        trip phase state machine
    TripContext.tsx       actions (findRoute, startTour, ...)
    SettingsContext.tsx   dev settings + mute toggles (in-memory)
    useActiveRoute.ts     decoded polyline + POIs for the selected route/filter
  features/tour/
    usePosition.ts        GPS (expo-location) or simulated drive
    proximity.ts          "in range and ahead of you" check, next POI
    NarrationController.ts  one-at-a-time queue, stale-drop, pause/resume
    useTourGuide.ts       wires position → proximity → queue
    narrationText.ts      POI → narration input; local fallback lines
  features/chat/
    useGuideChat.ts       passenger chat: own /tour/start session, ride context, 404 retry, /tour/end
  components/
    map/                  RouteMap, markers
    sheets/               one component per phase
    chat/                 "Ask Guide" floating pill + iOS page-sheet chat modal
    poi/                  card, detail card, photo, per-kind colors/icons
    ui/                   Button, Chip, SegmentedControl, Sheet, Icon, ...
  theme.ts                colors, spacing, type: restyle here
  config.ts               tunables (map default region, tour radii, chat limits, demo trip)
```

### Common changes

| Want to... | Touch |
|---|---|
| Restyle the app | `src/theme.ts`; POI colors/icons in `components/poi/poiStyle.ts` |
| Use a real icon set | Replace the body of `components/ui/Icon.tsx` (call sites only pass `name`) |
| Add address autocomplete | Swap `AddressField` in `components/sheets/PlanTripSheet.tsx`; it must call a new server proxy, never Google directly |
| Draggable bottom sheet | Replace `components/ui/Sheet.tsx` (e.g. `@gorhom/bottom-sheet`, which needs a dev build) |
| Change when narration fires | `TOUR` in `src/config.ts`, logic in `features/tour/proximity.ts` |
| Change the chat welcome line or limits | `CHAT` in `src/config.ts`; UI in `components/chat/GuideChatModal.tsx` |
| Pause narration while chatting | Call `pause()` / `resume()` from `useTourGuide` |
| Persist settings | `state/SettingsContext.tsx` (currently in-memory) |
| Add a screen | New file in `src/app/`, then `router.push('/name')` |

## Reaching the server from a phone

Same Wi-Fi: the app finds the server on its own (the laptop Metro runs on, port 3000). To check from the phone, open `http://<laptop-ip>:3000/health` in Safari. If it doesn't load, allow incoming connections for `node` in the Mac's firewall settings. Find the IP with:

```
ipconfig getifaddr en0
```

Different network (venue Wi-Fi often blocks device-to-device traffic): open a Cloudflare tunnel to port 3000 in a second terminal:

```
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

It prints a `https://<random>.trycloudflare.com` URL, which changes every time the tunnel restarts. After each restart, put it in `backend/.env` so audio URLs point through the tunnel, then restart `npm run dev:all`:

```
PUBLIC_BASE_URL=https://<random>.trycloudflare.com
```

Use the same URL as the app's base URL (`EXPO_PUBLIC_API_URL` in `mobile/.env`, or Developer settings). `PUBLIC_BASE_URL` is always the server's public URL (port 3000), never the backend's.

## Demo day

1. Start the tunnel, set `PUBLIC_BASE_URL` in `backend/.env` to the tunnel URL, and do the final `npm run dev:all` restart.
2. Fill the audio cache with the demo narration once:

```
cd backend
npm run replay:drive -- --real
```

3. Open `https://<tunnel>/health` on the phone: `backend.reachable` should be `true` and `llm.mock` `false`.
4. Demo with the app's simulated drive (it follows `/dev/demo-path`). Every narration then plays from the disk cache in a few milliseconds, even if the network flakes; only chat needs OpenAI live.

Sessions are in memory: after a backend restart the app gets `404 unknown_session` and starts a new session with the same places; the cached audio survives. Don't run the backend with `NODE_ENV=production`, which disables `/dev/demo-path`.

## Settings (`backend/.env`)

| Variable | Default | What it does |
|---|---|---|
| `OPENAI_NARRATION_MODEL` | `gpt-4.1-nano` | Writes the narration lines |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | Answers chat; must support the `web_search` tool |
| `PUBLIC_BASE_URL` | empty | The server's tunnel URL; makes `audioUrl`s absolute |
| `TTS_PROVIDER` | `speechify` | `speechify` or `elevenlabs` (needs `ELEVENLABS_API_KEY`) |
| `SPEECHIFY_VOICE_ID` | `chase` | Voice |
| `SPEECHIFY_RATE` | `+10%` | Speaking speed |
| `SPEECHIFY_EMOTION` | `energetic` | Tone; leave empty for neutral |
| `TTS_CONCURRENCY` | `1` | Simultaneous TTS requests (Speechify's base plan allows 1) |
| `MOCK_LLM` / `MOCK_TTS` | empty | Set to `1` to force mock mode and save API credits |

`server/.env` has `GOOGLE_MAPS_API_KEY` and `BACKEND_URL` (default `http://localhost:3001`). Trigger distances, timing and the chat timeout are in `backend/src/config.ts` (`LIVE_GUIDE`).

Changing the model or a voice setting regenerates each clip the next time it's needed. To clear all cached clips: `rm -rf backend/data/audio_cache`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `llm.mock: true` / replay says `LLM: mock` | `backend/.env` is missing, unsaved, or `OPENAI_API_KEY` is empty |
| `backend.reachable: false`, or `502 backend_unavailable` | The backend isn't running; start both with `npm run dev:all` |
| OpenAI `401 Incorrect API key` | The key value has extra text; it should be only the key, starting with `sk-` |
| `[chat] web search unavailable (...)` | Web search hit a limit or isn't supported by the chat model; chat still answers, without `sources` |
| Speechify `429 concurrency_limit_reached` | Keep `TTS_CONCURRENCY=1` unless your plan allows more |

## Tests

```
cd server
npm test
cd ../backend
npm test
npm run typecheck
cd ../mobile
npm run typecheck
```

## Architecture

See [`docs/architecture.md`](./docs/architecture.md) for diagrams of the system (mobile ↔ server ↔ backend ↔ Google, OpenAI and Speechify) and the route, narration and live guide flows.

## Contributing

* Every feature should be on its own branch then merged, no push to main.
* See [`TODO.md`](./TODO.md) for the current task breakdown and suggested branch names.
