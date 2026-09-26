import { NATURE_TYPES, type Poi } from "./places";
import { CURATED_SCORE_WEIGHT, NATURE_SCORE_WEIGHT } from "../config";

export function isNature(poi: Poi): boolean {
  return poi.types.some((t) => NATURE_TYPES.includes(t));
}

// Rating-weighted: a route past a couple of great (4.5+) landmarks should
// outscore one through a cluster of mediocre/unrated stops. Nature stops
// count extra so the scenic route prefers beaches, parks and waterfront.
export function scoreCandidate(landmarks: Poi[]): number {
  return landmarks.reduce(
    (sum, landmark) =>
      sum +
      (landmark.rating ?? 0) *
        (isNature(landmark) ? NATURE_SCORE_WEIGHT : 1) *
        (landmark.curated ? CURATED_SCORE_WEIGHT : 1),
    0,
  );
}
