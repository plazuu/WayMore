# Shellhack2026 — Scenic Route & Tour Guide App

A mobile app that finds the most scenic route between two points, surfaces nearby landmarks and local restaurants along the way, and (in a future phase) narrates them aloud as you pass, like a local tour guide. Aimed at tourists and anyone who wants to get to know an area better.

## What it does

1. **Input**: user gives a start address and an end address.
2. **Route finding**: fetches candidate routes between the two points and scores them by how many notable landmarks and points of interest they pass, favoring the most scenic/interesting path over the fastest one.
3. **Landmarks & food stops**: pulls nearby landmarks (parks, viewpoints, historic sites, museums) and local restaurants along the route, using the Google Places API plus web search for richer descriptions and photos.
4. **Output**: a map showing the route with landmark and restaurant pins, each with a photo and a short description.
5. **(Future) Live tour guide mode**: using the device's live location, the app narrates landmarks and suggested food stops aloud as you approach them during the trip.

## Stack

- **Mobile app**: React Native (Expo), TypeScript
- **Backend**: Node/Express
- **Data**: Google Maps Platform (Places, Routes, Geocoding, Places Photos) + web search for enrichment

## Running the LLM audio narration (tour guide voice)

The narration feature turns each place on the route into a short spoken tour-guide clip:

1. **Gemini** writes one or two upbeat lines, such as "On your left is the Freedom Tower, which processed Cuban refugees from 1962 to 1974..."
2. **Speechify** turns the line into an MP3. ElevenLabs is also supported.
3. The server **caches** the text and the MP3, so each place is generated only once.

It all runs inside `server/` (Node/Express), so the API keys never reach the mobile app. Requires Node 20+.

### 1. Install

```
cd server
npm install
```

### 2. Add your keys

The server reads `server/.env`, which is gitignored. `.env.example` is only a template, so never put real keys in it.

```
cp .env.example .env
```

Open `server/.env`, fill in these two lines, and save:

```
GEMINI_API_KEY=your-gemini-key
SPEECHIFY_API_KEY=your-speechify-key
```

- Gemini key: https://aistudio.google.com/apikey (starts with `AIza`)
- Speechify key: your Speechify API dashboard

No keys? You can skip this step. Narration runs in **mock mode**: a template line instead of Gemini, and no audio (`audioUrl: null`). The responses have the same shape, so the app can still be built against it.

### 3. Generate the demo clips

```
npm run pregen:narration
```

This generates narration for 3 Miami demo places (Kaseya Center, Bayside Marketplace, Freedom Tower) from `server/data/demo-places.json`. Expected output:

```
  LLM: gemini-3.8-flash
  TTS: speechify

Freedom Tower  [~8.7s]
  "On your left is the Freedom Tower, which processed Cuban refugees from 1962 to 1974 ..."
  .../server/data/audio_cache/demo-freedom-tower-aabc8abab0.mp3
```

If the header says `mock`, the keys aren't being read from `server/.env`. To play a clip on a Mac:

```
afplay data/audio_cache/<file>.mp3
```

To narrate your own places, pass a JSON file in the same format:

```
npm run pregen:narration -- path/to/places.json
```

### 4. Get narration from the API

This is what the mobile app calls. Start the server:

```
npm run dev
```

In another terminal, request narration for one place:

```
curl -X POST localhost:3000/narration -H 'Content-Type: application/json' -d '{"id":"test","name":"Freedom Tower","kind":"landmark","lat":25.78,"lng":-80.19,"side":"left","facts":["Built in 1925."]}'
```

The response looks like this:

```json
{"placeId":"test","text":"On your left is Freedom Tower, ...","audioUrl":"/audio/test-1a2b3c4d5e.mp3","durationHintS":4.2}
```

Open `http://localhost:3000` followed by the `audioUrl` in a browser to hear it. For a whole route at once, use `POST /narration/pregenerate` with `{ "places": [...] }`. See [`docs/narration-api.md`](./docs/narration-api.md) for the full API and how the app should queue and play clips.

### Settings (in `server/.env`)

| Variable | Default | What it does |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3.8-flash` | Model that writes the lines |
| `TTS_PROVIDER` | `speechify` | `speechify` or `elevenlabs` (needs `ELEVENLABS_API_KEY`) |
| `SPEECHIFY_VOICE_ID` | `chase` | Voice |
| `SPEECHIFY_RATE` | `+10%` | Speaking speed |
| `SPEECHIFY_EMOTION` | `energetic` | Tone; leave empty for neutral |
| `TTS_CONCURRENCY` | `1` | Simultaneous TTS requests (Speechify's base plan allows 1) |
| `MOCK_LLM` / `MOCK_TTS` | empty | Set to `1` to force mock mode and save API credits |

Changing a voice setting automatically regenerates the audio the next time a clip is requested. To clear all cached clips, run `rm -rf data/audio_cache`.

### Troubleshooting

| Message | Fix |
|---|---|
| `LLM: mock` / `TTS: mock` | `server/.env` is missing, unsaved, or the key line is empty |
| Gemini `API key not valid` | The key value has extra text in it; it should be only the key, starting with `AIza` |
| Gemini `404 ... no longer available` | Set `GEMINI_MODEL` in `.env` to a current model |
| Speechify `429 concurrency_limit_reached` | Keep `TTS_CONCURRENCY=1` unless your plan allows more |

### Tests

```
npm test
npm run typecheck
```

## Contributing

* Every feature should be on its own branch then merged, no push to main.
* See [`TODO.md`](./TODO.md) for the current task breakdown and suggested branch names.
