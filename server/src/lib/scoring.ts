import { SCENIC } from "../config";
import type { RouteStep } from "./googleMaps";
import { WATER_TYPES, WATER_WAYPOINT_TYPES, type Poi } from "./places";
import { decodePolyline, haversineMeters, type LatLng } from "./polyline";

// How the scenic route is chosen (route.ts wires it together):
// 1. Only candidates within the extra-time budget of the fastest are eligible.
// 2. Of those, only the ones with the least non-waterfront highway survive:
//    a plain highway is used only when every eligible route needs it.
// 3. The best scenicScore wins: waterfront distance first, then landmark
//    ratings (parks discounted), minus a nudge per extra minute. Food places
//    count only within 1 km of the drop-off: food stops never influence the
//    choice, and restaurants Google also tags as tourist attractions only
//    count near the destination.

const HIGHWAY_NAME =
  /\b(I-\d+|Interstate|Expy|Expressway|Fwy|Freeway|Turnpike|Tpke|Tollway|Toll Rd|Hwy|Highway|Pkwy|Parkway)\b/i;
const WATERFRONT_NAME =
  /\b(Causeway|Cswy|Bayshore|Bayfront|Bayside|Ocean|Oceanfront|Harbou?r|Waterfront|Riverside|Riverwalk|Lakeshore|Seawall|Pier|Coastal|Beach (Dr|Drive|Blvd|Rd|Road)|Shore (Dr|Drive|Rd|Road|Blvd))\b/i;
/** Types that make a place worth full weight even when it is also tagged as a park. */
const NOT_JUST_A_PARK = new Set(["museum", "historical_landmark", "historical_place", "monument"]);
const FOOD_PLACE_TYPES = new Set([
  "food",
  "restaurant",
  "cafe",
  "coffee_shop",
  "bar",
  "bakery",
  "ice_cream_shop",
  "meal_takeaway",
  "food_court",
]);

/** The road a step is on: its instruction's first line without the "toward …" part. */
function stepRoadText(step: RouteStep): string {
  return step.instruction.split("\n")[0].replace(/\btoward\b.*$/i, "");
}

export function isHighwayStep(step: RouteStep): boolean {
  if (step.distanceMeters <= 0 || step.staticDurationSeconds <= 0) return false;
  const kmh = (step.distanceMeters / step.staticDurationSeconds) * 3.6;
  if (HIGHWAY_NAME.test(stepRoadText(step))) return kmh >= SCENIC.highwayNamedMinKmh;
  return step.distanceMeters >= SCENIC.highwayFastMinMeters && kmh >= SCENIC.highwayFastMinKmh;
}

const CHUNK_METERS = 100;

/** Share (0–1) of a path's length that lies within `radiusMeters` of any water place. */
export function shareNearWater(points: LatLng[], water: LatLng[], radiusMeters: number): number {
  if (points.length < 2 || water.length === 0) return 0;
  let total = 0;
  let near = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = haversineMeters(a, b);
    // Split long straight segments (causeways, highways) so each part is judged on its own.
    const chunks = Math.max(1, Math.ceil(length / CHUNK_METERS));
    for (let c = 0; c < chunks; c++) {
      const t = (c + 0.5) / chunks;
      const mid = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
      if (water.some((w) => haversineMeters(mid, w) <= radiusMeters)) near += length / chunks;
    }
    total += length;
  }
  return total > 0 ? near / total : 0;
}

export interface RouteScenery {
  waterfrontMeters: number;
  /** Highway that isn't along the water: what the scenic route avoids. */
  highwayMeters: number;
}

export function analyzeSteps(steps: RouteStep[], water: LatLng[]): RouteScenery {
  let waterfrontMeters = 0;
  let highwayMeters = 0;
  for (const step of steps) {
    const share = WATERFRONT_NAME.test(stepRoadText(step))
      ? 1
      : shareNearWater(decodePolyline(step.encodedPolyline), water, SCENIC.waterfrontRadiusMeters);
    waterfrontMeters += share * step.distanceMeters;
    if (isHighwayStep(step) && share < SCENIC.waterfrontHighwayShare) highwayMeters += step.distanceMeters;
  }
  return { waterfrontMeters: Math.round(waterfrontMeters), highwayMeters: Math.round(highwayMeters) };
}

function isJustAPark(poi: Poi): boolean {
  return poi.types.includes("park") && !poi.types.some((t) => NOT_JUST_A_PARK.has(t));
}

export function isFoodPlace(poi: Poi): boolean {
  return poi.types.some((t) => FOOD_PLACE_TYPES.has(t) || t.endsWith("_restaurant"));
}

function landmarkWeight(poi: Poi, dropOff: LatLng): number {
  if (isFoodPlace(poi) && haversineMeters(poi, dropOff) > SCENIC.foodMaxDistanceFromDropOffMeters) return 0;
  return isJustAPark(poi) ? SCENIC.parkWeight : 1;
}

// Rating-weighted: a route past a couple of great (4.5+) landmarks should
// outscore one through a cluster of mediocre/unrated stops.
export function landmarkScore(landmarks: Poi[], dropOff: LatLng): number {
  return landmarks.reduce((sum, l) => sum + (l.rating ?? 0) * landmarkWeight(l, dropOff), 0);
}

export function scenicScore(input: {
  waterfrontMeters: number;
  landmarks: Poi[];
  dropOff: LatLng;
  extraSeconds: number;
}): number {
  const score =
    (SCENIC.waterfrontPointsPerKm * input.waterfrontMeters) / 1000 +
    landmarkScore(input.landmarks, input.dropOff) -
    (SCENIC.extraMinutePenalty * Math.max(0, input.extraSeconds)) / 60;
  return Math.round(score * 10) / 10;
}

export function extraTimeBudgetSeconds(fastestSeconds: number): number {
  return Math.min(
    SCENIC.maxExtraSeconds,
    Math.max(SCENIC.minExtraSeconds, fastestSeconds * SCENIC.maxExtraFraction),
  );
}

export function withinBudget<T extends { durationSeconds: number }>(candidates: T[], fastestSeconds: number): T[] {
  const budget = extraTimeBudgetSeconds(fastestSeconds);
  return candidates.filter((c) => c.durationSeconds - fastestSeconds <= budget);
}

interface Scored {
  durationSeconds: number;
  highwayMeters: number;
  score: number;
}

/** `candidates` must already be within budget (and include the fastest). */
export function pickScenic<T extends Scored>(candidates: T[]): T {
  const leastHighway = Math.min(...candidates.map((c) => c.highwayMeters));
  return candidates
    .filter((c) => c.highwayMeters <= leastHighway + SCENIC.highwayToleranceMeters)
    .reduce((best, c) => {
      if (c.score > best.score) return c;
      if (c.score === best.score && c.durationSeconds < best.durationSeconds) return c;
      return best;
    });
}

/** Drops businesses that are merely tagged with a water type (charter offices, rentals). */
export function isRealWaterPlace(poi: Poi): boolean {
  return (
    poi.primaryType !== undefined &&
    WATER_TYPES.includes(poi.primaryType) &&
    (poi.userRatingCount ?? 0) >= SCENIC.waterMinRatings
  );
}

/** Circles along the straight start-end line to search for water places, sized to cover the corridor. */
export function waterSearchCircles(start: LatLng, end: LatLng): { center: LatLng; radiusMeters: number }[] {
  const direct = haversineMeters(start, end);
  const count = Math.min(SCENIC.maxWaterSearches, Math.max(2, Math.ceil(direct / SCENIC.waterSearchSpacingMeters) + 1));
  const spacing = direct / (count - 1);
  const radiusMeters = Math.min(50_000, Math.max(SCENIC.waterSearchMinRadiusMeters, spacing * 0.75));
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return {
      center: { lat: start.lat + (end.lat - start.lat) * t, lng: start.lng + (end.lng - start.lng) * t },
      radiusMeters,
    };
  });
}

/**
 * Waterfront spots near the middle of the trip that are a small detour, to
 * route extra candidates through. Google's own alternatives rarely hug the shore.
 */
export function pickWaterWaypoints(start: LatLng, end: LatLng, water: Poi[]): LatLng[] {
  const direct = haversineMeters(start, end);
  const maxDetour = Math.max(SCENIC.waypointMinDetourMeters, direct * SCENIC.waypointMaxDetourFraction);
  const options = water
    .filter((p) => p.primaryType !== undefined && WATER_WAYPOINT_TYPES.includes(p.primaryType))
    .map((p) => {
      const fromStart = haversineMeters(start, p);
      const toEnd = haversineMeters(p, end);
      return { p, detour: fromStart + toEnd - direct, progress: fromStart / (fromStart + toEnd) };
    })
    .filter((o) => o.detour <= maxDetour && o.progress >= 0.2 && o.progress <= 0.8)
    .sort((a, b) => a.detour - b.detour);

  const picked: LatLng[] = [];
  for (const { p } of options) {
    if (picked.length >= SCENIC.maxWaterWaypoints) break;
    if (picked.every((q) => haversineMeters(p, q) >= SCENIC.waypointMinSpacingMeters)) picked.push(p);
  }
  return picked;
}
