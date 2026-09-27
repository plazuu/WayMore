# Run the app on your phone, start to finish (Windows + Expo Go)

Three things run at the same time, and all three must be up for the app to work fully:

| Piece | Folder | Port | What it does |
|---|---|---|---|
| **Server** | `server/` | 3000 | The app's only API. Holds the Google key, finds routes, filters landmarks, autocompletes addresses. |
| **Backend** | `backend/` | 3001 | Live tour narration and the Ask Guide chat. Only reached through the server. |
| **App** | `mobile/` | 8081 | The Expo app your phone loads. |

Route search, the filter and autocomplete need only the **server**. The live tour and Ask Guide also need the **backend**. Without a server the app falls back to built-in demo data (no filtering, no autocomplete).

## One-time setup

1. **Install Node.js** (v20 or newer). Check with `node -v`.
2. **Install Expo Go** on your phone (App Store or Google Play).
3. **Install dependencies.** Each folder has its own, so run all three:
   ```
   cd mobile;  npm install
   cd server;  npm install
   cd backend; npm install
   ```
4. **Create the env files.** Copy each `.env.example` to `.env` in the same folder (they are gitignored, so keys never get committed):
   - `server/.env` — set `GOOGLE_MAPS_API_KEY=<your key>`. The key needs the Routes, Places (New), Geocoding and Places Photos APIs enabled, with billing on.
   - `backend/.env` — optional. With no `OPENAI_API_KEY` / `SPEECHIFY_API_KEY` it runs in mock mode (template narration lines, no audio, offline chat reply).
   - `mobile/.env` — set `EXPO_PUBLIC_API_URL=http://<your PC's IPv4>:3000` (see step 5).
5. **Find your PC's IP:** run `ipconfig` and copy the IPv4 address. The server also prints it as `on your LAN: http://...` when it starts.
6. **Log in to Expo** (only needed if the CLI asks, or for EAS builds): `npx expo login`, then `npx expo whoami` to confirm.

## Every time you want to run it

Use two terminals. Always `cd` into the folder first; running `npm` in the repo root fails with "Could not read package.json".

**Terminal 1 — server + backend together:**
```
cd server
npm run dev:all
```
Wait for `server listening on port 3000`. (`npm run dev` starts the server alone.)

**Terminal 2 — the app:**
```
cd mobile
npx expo start --tunnel
```
Wait for the QR code. On the same Wi-Fi you can use plain `npm start` instead of `--tunnel`.

**On your phone:**
1. Join the **same Wi-Fi as your PC**. The tunnel only delivers the app code; the app then contacts the server directly at `EXPO_PUBLIC_API_URL`.
2. Scan the QR code (iPhone: Camera app; Android: scanner inside Expo Go).
3. Plan a trip, e.g. Miami Beach → Fort Lauderdale, and compare Normal vs Scenic.

**Don't press `a` or `i` in the Expo terminal.** That tries to open an Android/iOS emulator and fails with `android.package` errors. It is harmless but leaves the terminal stuck.

## Check that it's working

Open these in your **phone's browser**:

- `http://<PC IP>:3000/health` → should show `"status":"ok"`.
  - `"backend": {"reachable": false}` just means the narration backend isn't running. Route search still works.
  - If the page doesn't load at all, Windows Firewall is blocking Node.js (allow it on **private** networks), the network is set to Public, or the phone is on a different/guest Wi-Fi.

## Stop everything

Press `Ctrl + C` in each terminal (twice if needed). If a port stays busy ("address already in use"):
```
netstat -ano | findstr :3000
taskkill /PID <last column> /F
```

## Restarting after a change

- **App code (`mobile/src`)** reloads on the phone automatically.
- **`mobile/.env`** — restart Expo (`Ctrl + C`, run it again), then reload the app.
- **Server code / `server/.env`** — `npm run dev` restarts on file changes; restart it manually after editing `.env`.

## How the landmark filter works

Tuned in `server/src/config.ts`, applied in `server/src/routes/filter.ts`, used by `server/src/routes/route.ts`:

1. Drops places that have any excluded type (schools, universities, cemeteries, hospitals, churches, gas stations, parking, lodging, etc.). Edit `EXCLUDED_TYPES` to change this.
2. Requires a minimum rating and review count (`MIN_LANDMARK_RATING`, `MIN_LANDMARK_REVIEWS`, and the `MIN_FOOD_*` equivalents).
3. Ranks by rating × log(review count) and keeps the top `MAX_LANDMARKS_PER_ROUTE` / `MAX_FOOD_STOPS_PER_ROUTE`.

The route line is requested with `polylineQuality: "HIGH_QUALITY"` (`server/src/lib/googleMaps.ts`) so it follows streets instead of cutting across buildings.

## Common errors

| Message | Meaning / fix |
|---|---|
| `Could not read package.json` (ENOENT) | You ran `npm` in the wrong folder. `cd` into `server/`, `mobile/` or `backend/`. |
| `Required property 'android.package' is not found` | Expo tried to open an Android emulator. Ignore it, `Ctrl + C`, and use Expo Go. |
| `GOOGLE_MAPS_API_KEY is not configured` | `server/.env` is missing or the key line is empty. Restart the server after fixing it. |
| `REQUEST_DENIED` / 403 from Google | The key doesn't have that API enabled, or billing is off. |
| App shows demo data / network error | `EXPO_PUBLIC_API_URL` is wrong or unset, the server isn't running, or the firewall is blocking port 3000. |
| Autocomplete shows nothing | The app can't reach the server (same causes as above). |
| `backend reachable: false` | The narration backend isn't running. Use `npm run dev:all` in `server/`. |
| Red "can't read / cannot find module" errors in the editor | Dependencies aren't installed. Run `npm install` in that folder and restart the editor's TypeScript server. |
| Port already in use | An old copy is still running. Stop it (see above). |
