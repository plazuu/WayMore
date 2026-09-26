# Shellhack2026 — Scenic Route & Tour Guide App

A mobile app that finds the most scenic route between two points, surfaces landmarks and local restaurants along the way, and narrates them aloud as you pass, like a local tour guide riding along. Passengers can also text the guide questions. Aimed at tourists and anyone who wants to get to know an area better.

## What it does

1. **Route**: the user enters a start and end address. The server fetches candidate routes and returns both the fastest and the most scenic one (the one passing the best-rated landmarks), with landmarks and food stops along each.
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

## Reaching the server from a phone

Same Wi-Fi: use the laptop's LAN IP on port 3000 as the app's base URL, for example `http://192.168.1.20:3000`. Find the IP with:

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

Use the same URL as the app's base URL. `PUBLIC_BASE_URL` is always the server's public URL (port 3000), never the backend's.

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
```

## Contributing

* Every feature should be on its own branch then merged, no push to main.
* See [`TODO.md`](./TODO.md) for the current task breakdown and suggested branch names.
