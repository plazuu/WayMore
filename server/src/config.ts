// POI sampling density along a route's polyline. These are exposed as
// query params on POST /route (sampleIntervalMeters, searchRadiusMeters)
// so they can be tuned without a redeploy. See TODO.md M2 for wiring an
// in-app control on top of these once the mobile map screen exists.
export const DEFAULT_SAMPLE_INTERVAL_METERS = 1200;
export const MIN_SAMPLE_INTERVAL_METERS = 200;
export const MAX_SAMPLE_INTERVAL_METERS = 5000;

export const DEFAULT_SEARCH_RADIUS_METERS = 500;
export const MIN_SEARCH_RADIUS_METERS = 100;
export const MAX_SEARCH_RADIUS_METERS = 2000;

// Quality filters applied to POIs per route (see lib/filter.ts). Raise the
// minimums or lower the caps for fewer, better stops.
export const MIN_LANDMARK_RATING = 4.3;
export const MIN_LANDMARK_REVIEWS = 100;
export const MAX_LANDMARKS_PER_ROUTE = 8;

export const MIN_FOOD_RATING = 4.3;
export const MIN_FOOD_REVIEWS = 100;
export const MAX_FOOD_STOPS_PER_ROUTE = 5;


// --- Backend proxy ---
// /tour, /audio, /dev and /narration are forwarded to the backend/ narration
// service, so the app (and the demo tunnel) needs only this server's URL.
export const PROXIED_PREFIXES = ["/tour", "/audio", "/dev", "/narration"];
/** Longer than the backend's slowest live call (chat has a 12 s budget). */
export const PROXY_TIMEOUT_MS = 20_000;
/**
 * /narration/pregenerate voices a whole route on first use (TTS runs one
 * request at a time), so it gets the same 120 s the app waits for it.
 */
export const NARRATION_PROXY_TIMEOUT_MS = 120_000;
/** /health's check of the backend's /health. */
export const BACKEND_HEALTH_TIMEOUT_MS = 2_000;

/** Read per request so tests and scripts can change it after import. */
export function backendUrl(): string {
  return (process.env.BACKEND_URL || "http://localhost:3001").replace(/\/+$/, "");
}
