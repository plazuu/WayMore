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

/**
 * Shown as the trip's start when it is the phone's position (the "Where to?"
 * guide fills it in). Route search swaps it for the coordinates.
 */
export const CURRENT_LOCATION_LABEL = 'Current location';

/** "Where to?" guide. The server rejects longer messages with 400 message_too_long. */
export const DESTINATION_GUIDE = {
  maxMessageChars: 500,
  /** How long the "setting your destination" reply stays up before the planner opens. */
  confirmDelayMs: 1200,
};

/** Prefilled in the trip planner so the demo is one tap away. */
export const DEMO_TRIP = {
  start: 'Brickell City Centre, Miami, FL',
  end: 'Wynwood Walls, Miami, FL',
};

/** Live tour guide tuning. See "Playing narration" in docs/api.md for the queue rules. */
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
  /**
   * Server narration (line + Speechify voice) is fetched for POIs within this
   * distance, nearest first, so each clip is ready before the car reaches it.
   * The voice is generated one clip at a time (~2-3 s each), so the range has to
   * cover that much driving past the POIs inside it.
   */
  prefetchRadiusMeters: 2_000,
  /** POIs per /narration/pregenerate request. Small, so the nearest ones arrive quickly. */
  prefetchBatchSize: 3,
  /** After a failed request, wait this long before trying again. */
  prefetchRetryMs: 10_000,
  /**
   * While the route preview is open, narration for up to `warmupMaxPlaces` POIs
   * within this distance of the start is generated ahead, since several are
   * already in trigger range at the tour's first position.
   */
  warmupRadiusMeters: 500,
  warmupMaxPlaces: 12,
};

/** Passenger chat with the guide (POST /tour/chat). */
export const CHAT = {
  /** Server rejects longer messages with 400 message_too_long. */
  maxMessageChars: 500,
  /** Server caps /tour/start at 200 places. */
  maxSessionPlaces: 200,
  welcome:
    "Hey, I'm your scenic copilot! Ask me anything about the places we're passing: the history, what's worth a stop, or what that building back there was.",
};
