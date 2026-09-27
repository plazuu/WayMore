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

// --- Scenic route choice (see lib/scoring.ts) ---
export const SCENIC = {
  /** The scenic route may add at most this share of the fastest route's time… */
  maxExtraFraction: 0.5,
  /** …but short trips always get at least this much slack… */
  minExtraSeconds: 8 * 60,
  /** …and long trips never more than this. */
  maxExtraSeconds: 25 * 60,

  /** A step whose road name looks like a highway (I-95, Expressway, Turnpike…) counts once it averages this. */
  highwayNamedMinKmh: 50,
  /** An unnamed step counts as highway when it is at least this long and this fast. */
  highwayFastMinMeters: 1000,
  highwayFastMinKmh: 75,
  /** A highway step with at least this share near water (a causeway) is scenic, not penalized. */
  waterfrontHighwayShare: 0.5,
  /** Routes within this much non-waterfront highway of the least-highway option are treated as equal. */
  highwayToleranceMeters: 500,

  /**
   * A water place only counts if water is its primary type and it has this many reviews:
   * Google tags many inland yacht-charter offices as marinas, and those have almost none.
   */
  waterMinRatings: 5,
  /** Road within this distance of a marina, beach, pier, ferry terminal or island counts as waterfront. */
  waterfrontRadiusMeters: 400,
  /** Scoring: waterfront dominates, then landmark ratings, minus a nudge per extra minute. */
  waterfrontPointsPerKm: 40,
  /** Public parks are common and rarely the view; they count at this share of a landmark. */
  parkWeight: 0.3,
  /** Food places (even ones Google tags as attractions) only count this close to the drop-off. */
  foodMaxDistanceFromDropOffMeters: 1000,
  extraMinutePenalty: 3,

  /** Water places are found by searching circles along the straight start-end line. */
  waterSearchSpacingMeters: 1500,
  waterSearchMinRadiusMeters: 1500,
  maxWaterSearches: 12,
  /** Extra candidates are routed through up to this many waterfront spots near the middle of the trip. */
  maxWaterWaypoints: 2,
  /** A waterfront spot is a waypoint candidate if going through it adds at most this much straight-line distance. */
  waypointMaxDetourFraction: 0.4,
  waypointMinDetourMeters: 1500,
  /** Waypoints are kept this far apart so the extra candidates differ. */
  waypointMinSpacingMeters: 1000,
};

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
