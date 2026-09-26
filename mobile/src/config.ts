import Constants from 'expo-constants';

const SERVER_PORT = 3000;

/**
 * Where the Express server (`server/`) lives. Order of precedence:
 * 1. `EXPO_PUBLIC_API_URL` in `mobile/.env` (see `.env.example`).
 * 2. The host Expo Go loaded this bundle from, on the server port. That works for
 *    emulators and for phones on the same Wi-Fi without any config.
 * 3. The Android emulator's alias for the host machine.
 * Can also be changed at runtime from the Settings screen.
 */
export function defaultApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (metroHost) return `http://${metroHost}:${SERVER_PORT}`;
  return `http://10.0.2.2:${SERVER_PORT}`;
}

/** Map camera before any route is loaded (downtown Miami). */
export const DEFAULT_MAP_REGION = {
  latitude: 25.7781,
  longitude: -80.1918,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

/** Prefilled in the trip planner so the demo is one tap away. */
export const DEMO_TRIP = {
  start: 'Brickell City Centre, Miami, FL',
  end: 'Wynwood Walls, Miami, FL',
};

/** Live tour guide tuning. See docs/narration-api.md for the queue rules. */
export const TOUR = {
  /** POIs closer than this are within range of triggering. */
  triggerRadiusMeters: 250,
  /** Within this distance a POI triggers even if it is not ahead of you. */
  closeRadiusMeters: 60,
  /** A POI counts as "ahead" when its bearing is within this many degrees of your heading. */
  aheadAngleDeg: 100,
  /** Queued clips older than this are dropped because you have already passed the place. */
  maxQueueWaitMs: 15_000,
  /** Extra time allowed past a clip's duration hint before giving up on it. */
  playbackGraceMs: 5_000,
  simulatedTickMs: 1_000,
};

/** Server caps /narration/pregenerate at 100 places per request. */
export const MAX_NARRATION_PLACES = 100;
