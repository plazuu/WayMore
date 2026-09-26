# Mobile app (Expo)

Baseline frontend for the scenic route tour guide. It's laid out like a ride-hailing app: one full-screen map with a bottom sheet whose content changes with the trip phase.

```
idle ("Where to?") → planning (start/end) → loading → preview (Fastest/Scenic, POIs) → touring (live narration)
                                                   ↘ error (retry / demo data / edit)
```

## Run

```
npm install
npm run android        # or: npx expo start, then press a / i
npm run typecheck
```

- **No server? No key?** Open Developer settings (gear, top-left) and turn on **Use demo data**, or tap "Use demo data instead" on the error screen. You get a built-in Brickell → Wynwood route in the exact `POST /route` shape.
- **Server URL** defaults to the machine Metro runs on, port 3000. Override it with `EXPO_PUBLIC_API_URL` in `mobile/.env` (see `.env.example`) or in Developer settings.
- **Map tiles are blank in Expo Go on Android.** Google rejects Expo Go's bundled Maps key. Routes, pins, and every sheet still work. For real tiles, make a development build (`npx expo run:android`) with `GOOGLE_MAPS_ANDROID_API_KEY` set; see `app.config.js`.
- **Tour on an emulator:** "Simulate drive" (on by default) moves a fake position along the route, so narration triggers without GPS.

## Where things live

```
src/
  app/                    Expo Router screens (routes only, keep them thin)
    _layout.tsx           providers + stack
    index.tsx             map screen: picks the sheet for the current phase
    settings.tsx          developer settings (server URL, demo data, sampling, tour sim)
  api/
    types.ts              server response shapes (mirror server/API.md, docs/narration-api.md)
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
  components/
    map/                  RouteMap, markers
    sheets/               one component per phase
    poi/                  card, detail card, photo, per-kind colors/icons
    ui/                   Button, Chip, SegmentedControl, Sheet, Icon, ...
  theme.ts                colors, spacing, type: restyle here
  config.ts               tunables (map default region, tour radii, demo trip)
```

## Common changes

| Want to... | Touch |
|---|---|
| Restyle the app | `src/theme.ts`; POI colors/icons in `components/poi/poiStyle.ts` |
| Use a real icon set | Replace the body of `components/ui/Icon.tsx` (call sites only pass `name`) |
| Add address autocomplete | Swap `AddressField` in `components/sheets/PlanTripSheet.tsx`; it must call a new server proxy, never Google directly |
| Draggable bottom sheet | Replace `components/ui/Sheet.tsx` (e.g. `@gorhom/bottom-sheet`, which needs a dev build) |
| Change when narration fires | `TOUR` in `src/config.ts`, logic in `features/tour/proximity.ts` |
| Hook up the dialog agent | Call `pause()` / `resume()` on the `NarrationController` (see `useTourGuide`) |
| Persist settings | `state/SettingsContext.tsx` (currently in-memory) |
| Add a screen | New file in `src/app/`, then `router.push('/name')` |
