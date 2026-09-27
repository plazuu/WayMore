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
// A landmark only counts if you can plausibly see it from the car. Nature
// (beaches, parks, marinas) reads from farther away, so it gets more slack.
export const MAX_LANDMARK_DISTANCE_FROM_ROUTE_METERS = 150;
export const MAX_NATURE_DISTANCE_FROM_ROUTE_METERS = 300;
// Hand-picked landmarks (data/landmarks.json). One that is missed by the fastest
// route but within CURATED_CORRIDOR_METERS of it is trialed as a pass-through
// waypoint; trial routes over the time budget are dropped before the (more
// expensive) Places search runs on them.
export const CURATED_CORRIDOR_METERS = 6000;
// How many top misses to trial a detour route for (each is one cheap Routes call).
export const MAX_CURATED_TRIALS = 10;
// The detour search keeps adding waypoints while the value improves, up to this many.
export const MAX_CURATED_WAYPOINTS = 3;
// The search's value = curated score minus this per extra minute, so it prefers
// the shorter of two similarly scenic routes.
export const DETOUR_TIME_PENALTY_PER_MINUTE = 0.15;
// A hand-picked stop counts this many times a Places result of the same rating.
export const CURATED_SCORE_WEIGHT = 2;
// A scenic route may cost at most this much extra time over the fastest one:
// a flat allowance plus a fraction of the fastest trip, so the budget scales
// with trip length (17 min trip: about 8 min extra; 44 min trip: about 14).
export const SCENIC_BASE_EXTRA_SECONDS = 300;
export const SCENIC_EXTRA_FRACTION = 0.2;
// Upper bound for the maxExtraMinutes request param on POST /route.
export const MAX_EXTRA_MINUTES_LIMIT = 60;
// Scenic scoring multiplier for nature stops, so the scenic route favors
// driving by a beach or waterfront.
export const NATURE_SCORE_WEIGHT = 1.5;

// Restaurants are only suggested near the destination ("last mile"), within
// this radius of it. Nothing is searched for food along the route.
export const LAST_MILE_RADIUS_METERS = 1600;
// Food stops are ranked for the final approach: one within this distance of the
// last stretch of the route is visible from the car and gets a bonus; closeness
// to the destination scales the score from 1 (at the destination) down to
// FOOD_FAR_SCORE_FACTOR (at the edge of the last-mile radius).
export const FOOD_VISIBLE_FROM_ROUTE_METERS = 100;
export const FOOD_VISIBLE_WEIGHT = 1.5;
// Also search along each route's final stretch (a point every N m, small radius)
// so places right on the approach are found, not just the popular ones nearby.
export const FOOD_APPROACH_SAMPLE_METERS = 400;
export const FOOD_APPROACH_SEARCH_RADIUS_METERS = 200;
export const FOOD_FAR_SCORE_FACTOR = 0.5;
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

// --- Places photos (GET /photo) ---
/**
 * /photo resolves a Places photo name to its signed CDN URL and redirects the
 * client there, so image bytes never pass through this server. The resolved URL
 * is reused for this long; Google's links outlive it comfortably, and the
 * Cache-Control on the redirect matches, so a phone re-asks at the same rate.
 */
export const PHOTO_CACHE_TTL_MS = 30 * 60 * 1000;
/** Resolved URLs kept in memory (oldest dropped first). ~50 POIs per route. */
export const PHOTO_CACHE_MAX_ENTRIES = 2000;
export const PHOTO_FETCH_TIMEOUT_MS = 8_000;
