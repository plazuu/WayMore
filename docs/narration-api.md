# Narration API (live tour guide)

The server writes a short spoken tour-guide line for every landmark and food stop on the route and turns it into an MP3. All of this happens **before the trip starts**, because generating it mid-drive is too slow. The app only has to call the server once, then play the files.

Everything below is served by `server/` (the Express API), so the Gemini and TTS keys never reach the app.

## Endpoints

### `POST /narration/pregenerate`

Call this **once when the trip starts**, with every place on the route (landmarks and food stops together). It takes a few seconds on the first call and returns immediately for places already in the cache.

Request:

```json
{
  "places": [
    {
      "id": "ChIJ...kaseya",
      "name": "Kaseya Center",
      "kind": "landmark",
      "tagline": "Home of the Miami Heat",
      "category": "arena",
      "description": "Waterfront arena on Biscayne Bay...",
      "facts": ["Home arena of the NBA's Miami Heat.", "Opened in 1999."],
      "lat": 25.7814,
      "lng": -80.187,
      "side": "right"
    },
    {
      "id": "ChIJ...joes",
      "name": "Joe's Stone Crab",
      "kind": "restaurant",
      "lat": 25.7686,
      "lng": -80.1347
    }
  ]
}
```

Response: one entry per place, **in the same order**:

```json
[
  {
    "placeId": "ChIJ...kaseya",
    "text": "On your right is Kaseya Center, home of the Miami Heat!",
    "audioUrl": "/audio/ChIJ___kaseya-3f9a0c1b2d.mp3",
    "durationHintS": 3.8
  },
  {
    "placeId": "ChIJ...joes",
    "text": "Coming up is Joe's Stone Crab, a great food stop if you're hungry.",
    "audioUrl": null,
    "durationHintS": 4.2
  }
]
```

A place that fails still gets an entry, with a fallback `text` and `audioUrl: null`. The request as a whole doesn't fail because of one place.

### `POST /narration`

Same as above for a single place: the body is one `Place` and the response is one `Narration`. Use it if a place is added to the route after the trip has started.

### Types

```ts
interface Place {
  id: string;
  name: string;
  kind: "landmark" | "restaurant";
  tagline?: string;
  category?: string;
  description?: string;
  facts?: string[];          // the more facts, the better the line
  lat: number;
  lng: number;
  side?: "left" | "right" | "ahead";  // omitted means "Coming up..."
}

interface Narration {
  placeId: string;
  text: string;
  audioUrl: string | null;
  durationHintS: number;     // rough length of the clip in seconds
}
```

Invalid bodies get `400 { "error": "..." }`, and each request takes at most 100 places.

### Audio files

`audioUrl` is a path on the server, not a full URL. Prefix it with the server's base URL:

```
<backend>/audio/<file>.mp3        e.g. http://192.168.1.20:3000/audio/ChIJ___kaseya-3f9a0c1b2d.mp3
```

Files are cached on the server, so the same place with the same voice settings always gives the same URL. For offline safety, you can download every clip right after `pregenerate` returns.

## How the app should play narration

1. **Trigger.** Play each place's clip **once**, when the user comes within range (the proximity engine from TODO.md M3). Mark the place as played so it never triggers again.
2. **Queue.** Play clips **one at a time, never overlapping**. When a place triggers while another clip is playing, add it to the end of a queue.
3. **Drop stale clips.** When a clip reaches the front of the queue, skip it if it has been waiting **more than about 15 seconds**. By then the car has already passed that place.
4. **No audio.** If `audioUrl` is `null` (mock mode, TTS failure, or a download error), show `text` as an on-screen caption for `durationHintS` seconds instead. That caption counts as the "clip" for queue purposes. Alternatively, read it with `expo-speech`.
5. **Callbacks read state through a ref.** The playback-finished callback (for example `onPlaybackStatusUpdate` → `didJustFinish`) is created when the clip starts. If it reads the queue from React state, it sees a stale copy. Keep the queue in a `useRef` and read `queueRef.current` in the callback, then call `setState` only to re-render.
6. **Pause/resume hook.** Route all playback through one controller with `pause()` and `resume()` (plus a `paused` flag that stops the queue from advancing). A future dialog agent will call these to interrupt narration when a passenger asks a follow-up question, then resume afterwards. For now the mute toggle can use them.

Sketch:

```ts
type Item = { narration: Narration; enqueuedAt: number };

const queueRef = useRef<Item[]>([]);
const playingRef = useRef(false);
const pausedRef = useRef(false);
const MAX_WAIT_MS = 15_000;

function enqueue(n: Narration) {
  queueRef.current.push({ narration: n, enqueuedAt: Date.now() });
  playNext();
}

async function playNext() {
  if (playingRef.current || pausedRef.current) return;
  let item: Item | undefined;
  while ((item = queueRef.current.shift()) && Date.now() - item.enqueuedAt > MAX_WAIT_MS) {}
  if (!item) return;
  playingRef.current = true;
  await playClipOrShowCaption(item.narration);   // resolves when finished
  playingRef.current = false;
  playNext();                                     // reads refs, never stale state
}

// Hook points for the future dialog agent / mute toggle:
export const narrationControl = {
  pause() { pausedRef.current = true; /* also pause the current sound */ },
  resume() { pausedRef.current = false; playNext(); },
};
```

## Running the server without keys

With no `GEMINI_API_KEY` or TTS key in `server/.env`, the server runs in mock mode. Lines come from a template (for example "On your right is Kaseya Center, home of the Miami Heat.") and `audioUrl` is always `null`. The response shape is identical, so you can build the whole flow, captions included, without keys.
