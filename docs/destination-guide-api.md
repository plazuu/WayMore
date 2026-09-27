# "Where to?" guide API

A short chat that helps an undecided user pick a destination: hungry or sightseeing → cuisine or kind of place → the nearest good places → pick one → the app fills in the destination. The origin is always the phone's current location; the guide never asks for it.

Same base URL as everything else (`server/`, port 3000 locally, or the tunnel). The server owns the whole flow: it decides the next step, the reply text, which chips to show and which places to list. The app only renders what it gets back and sends taps and typed text.

## The endpoint

```
POST /guide/destination
```

Request:

```ts
{
  conversationId?: string;   // omit on the first call; then send back the one you got
  message?: string;          // what the user typed (max 500 characters)
  choice?: {                 // what the user tapped (send instead of message)
    chipId?: string;         // a chip's id
    placeId?: string;        // a place card's placeId
  };
  lat: number;               // the phone's current position, on EVERY call
  lng: number;
}
```

Response (every call, every stage):

```ts
{
  conversationId: string;
  stage: "intent" | "category" | "results" | "confirmed";
  reply: string;                          // the guide's message, show as a chat bubble
  chips: { id: string; label: string }[]; // quick replies, show as buttons under the reply
  places: PlaceCard[];                    // non-empty only in "results"
  destination: null | {                   // set only in "confirmed"
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
  };
  provider?: string;   // dev builds only: who understood the typed text ("tap" = a tap)
  latencyMs?: number;  // dev builds only
}

interface PlaceCard {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number;  // from where the user was when the list was made
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean;       // missing when Google has no opening hours for the place
  photoUrl?: string;       // relative: show `${BASE_URL}${photoUrl}`
}
```

## How to build the screen

1. **Open the chat:** call with just `{ lat, lng }`. Show `reply` and the `chips`.
2. **Chip tapped:** send `{ conversationId, choice: { chipId }, lat, lng }`. Show the chip's `label` as the user's bubble. Chip ids come from the server; never hardcode or build them.
3. **Card tapped:** send `{ conversationId, choice: { placeId }, lat, lng }`.
4. **Text typed:** send `{ conversationId, message, lat, lng }`. The user can type anything at any point: "chinese", "the second one", "actually sushi", "start over".
5. **After every response,** replace the chips and the cards with the new ones (empty arrays mean hide them). Old chips must not stay tappable.
6. **While waiting,** show a "typing…" bubble. Taps come back in well under a second; a search takes about 1 s, and typed text can take a few seconds.
7. **`destination` is set** (stage `"confirmed"`): fill in only the destination field with `destination.name` (keep `lat`/`lng` and `address` too), leave the origin as "Current location", close the chat, and run the normal route flow (see "Routing to the destination" below).

The chips' labels and the reply text can change; build on the ids and the stage only.

## Routing to the destination

Call `POST /route` with `start` = the current GPS position and `end` = the destination's coordinates:

```json
{ "start": { "lat": 25.7617, "lng": -80.1918 }, "end": { "lat": 25.7677, "lng": -80.1906 } }
```

`/route` accepting `{ lat, lng }` lands in the next backend change. Until then, send both as text, which the server's geocoder already accepts: `start` = `"<lat>,<lng>"` (e.g. `"25.761700,-80.191800"`) and `end` = `"<name>, <address>"` (e.g. `"Hutong Miami, 600 Brickell Ave, Miami, FL 33131, USA"`). This is what the app does today: the guide opens the trip planner with the start shown as "Current location" and swaps in the coordinates when it searches (`mobile/src/services/tripService.ts`).

## Example conversation

**1. Open** `{ "lat": 25.7617, "lng": -80.1918 }`

```json
{
  "conversationId": "3f2c9a1e-...",
  "stage": "intent",
  "reply": "Hey! Are you hungry, or looking for something to see?",
  "chips": [
    { "id": "intent:food", "label": "Hungry" },
    { "id": "intent:attraction", "label": "Something to see" },
    { "id": "intent:surprise", "label": "Surprise me" }
  ],
  "places": [],
  "destination": null
}
```

**2. Tap "Hungry"** `{ "conversationId": "3f2c9a1e-...", "choice": { "chipId": "intent:food" }, "lat": 25.7617, "lng": -80.1918 }`

```json
{
  "conversationId": "3f2c9a1e-...",
  "stage": "category",
  "reply": "Nice! What are you in the mood for?",
  "chips": [
    { "id": "category:cuban", "label": "Cuban" },
    { "id": "category:chinese", "label": "Chinese" },
    { "id": "category:mexican", "label": "Mexican" },
    { "id": "category:italian", "label": "Italian" },
    { "id": "category:any-food", "label": "Anything" },
    { "id": "restart", "label": "Start over" }
  ],
  "places": [],
  "destination": null
}
```

"Something to see" gives Museums, Parks, Beaches, Landmarks, Nightlife and Anything instead.

**3. Tap "Chinese"** (or type "chinese")

```json
{
  "conversationId": "3f2c9a1e-...",
  "stage": "results",
  "reply": "Here are the closest great Chinese spots:",
  "chips": [
    { "id": "back", "label": "Something else" },
    { "id": "restart", "label": "Start over" }
  ],
  "places": [
    { "placeId": "ChIJ...", "name": "P.F. Chang's", "address": "901 S Miami Ave Suite 104, Miami, FL 33131, USA", "lat": 25.7658, "lng": -80.1929, "distanceMeters": 417, "rating": 4.2, "userRatingCount": 3066, "openNow": true, "photoUrl": "/photo?name=places%2F..." },
    { "placeId": "ChIJm30oUKW32YgRlVIEBM6Wb6Y", "name": "Hutong Miami", "address": "600 Brickell Ave, Miami, FL 33131, USA", "lat": 25.7677, "lng": -80.1906, "distanceMeters": 674, "rating": 4.3, "userRatingCount": 1473, "openNow": true, "photoUrl": "/photo?name=places%2F..." }
  ],
  "destination": null
}
```

Up to 5 cards, nearest first. Only places rated 4.0+ with 50+ reviews, and never ones Google says are closed. The list is made once and does not refresh as the car moves.

**4. Tap a card** `{ "choice": { "placeId": "ChIJm30oUKW32YgRlVIEBM6Wb6Y" }, ... }` (or type "the second one", or "hutong")

```json
{
  "conversationId": "3f2c9a1e-...",
  "stage": "confirmed",
  "reply": "Great choice, setting your destination to Hutong Miami.",
  "chips": [
    { "id": "back", "label": "Pick a different one" },
    { "id": "restart", "label": "Start over" }
  ],
  "places": [],
  "destination": { "placeId": "ChIJm30oUKW32YgRlVIEBM6Wb6Y", "name": "Hutong Miami", "address": "600 Brickell Ave, Miami, FL 33131, USA", "lat": 25.7676737, "lng": -80.1906362 }
}
```

"Pick a different one" goes back to the same list.

### Other cases

- **Surprise me:** up to 3 top-rated places (4.5+) open right now within 5 km, food or sights. `reply`: "Feeling adventurous? Here are 3 top-rated spots open right now:".
- **Typed a dish or a name** ("sushi", "Versailles"): the guide searches for it. `reply`: `Here's what I found for "sushi":`.
- **No results:** `stage` is `"results"` with empty `places`, `reply` like "I couldn't find any great beaches nearby. Want me to search farther, or try something else?", and chips `widen` ("Search farther"), `back` and `restart`.
- **Map search down:** `reply` is "I can't reach the map right now — try a chip." with the previous step's chips. Still a `200`.
- **Didn't understand** ("hello"): `reply` is "Sorry, I didn't catch that." plus the current question; nothing else changes.

## Errors

The body is `{ "error": "<code>", "message": "<text>" }`.

| Status | `error` | When | What to do |
|---|---|---|---|
| 400 | `location_required` | `lat`/`lng` missing or invalid | No location permission: send the map's center instead |
| 400 | `message_too_long` | `message` over 500 characters | Limit the input field to 500 |
| 400 | `bad_request` | wrong field types | A bug in the app |
| 502 | `backend_unavailable` | the guide service is down or slow (20 s) | Show "Try again" |

An unknown or expired `conversationId` (the server restarted, or 30 minutes idle) never fails: you get a fresh conversation with the greeting and a new `conversationId`. Keep whatever the response gives you.
