import type { Poi } from "./places";

// Rating-weighted: a route past a couple of great (4.5+) landmarks should
// outscore one through a cluster of mediocre/unrated stops.
export function scoreCandidate(landmarks: Poi[]): number {
  return landmarks.reduce((sum, landmark) => sum + (landmark.rating ?? 0), 0);
}
