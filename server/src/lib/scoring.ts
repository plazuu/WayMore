import { NATURE_TYPES, type Poi } from "./places";
import { CURATED_SCORE_WEIGHT, DEFAULT_SCENIC_PREFERENCE, PREFERENCE_WEIGHTS, type ScenicPreference } from "../config";

// Google tags many city places with "park" too (a historic district, a memorial),
// so the primary type decides when we have it. Hand-picked stops are classified
// by their types, and demo/older data without a primary type falls back to types.
export function isNature(poi: Poi): boolean {
  if (!poi.curated && poi.primaryType) return NATURE_TYPES.includes(poi.primaryType);
  return poi.types.some((t) => NATURE_TYPES.includes(t));
}

// How much a stop counts for this user: nature stops for a nature lover, city
// stops (landmarks, art, architecture) for a city lover.
export function preferenceWeight(poi: Poi, preference: ScenicPreference = DEFAULT_SCENIC_PREFERENCE): number {
  const weights = PREFERENCE_WEIGHTS[preference];
  return isNature(poi) ? weights.nature : weights.city;
}

// Rating-weighted value of one stop: a great (4.5+) landmark is worth more than a
// mediocre one, hand-picked stops count extra, and the user's preference scales it.
export function landmarkValue(poi: Poi, preference: ScenicPreference = DEFAULT_SCENIC_PREFERENCE): number {
  return (poi.rating ?? 0) * preferenceWeight(poi, preference) * (poi.curated ? CURATED_SCORE_WEIGHT : 1);
}

// A route past a couple of great landmarks should outscore one through a cluster
// of mediocre/unrated stops.
export function scoreCandidate(landmarks: Poi[], preference: ScenicPreference = DEFAULT_SCENIC_PREFERENCE): number {
  return landmarks.reduce((sum, landmark) => sum + landmarkValue(landmark, preference), 0);
}
