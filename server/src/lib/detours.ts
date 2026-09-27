import { computeRoutes, GoogleMapsError, type LatLng, type RouteCandidate } from "./googleMaps";
import { curatedOnRoute, orderAlongRoute, rankMisses, type CuratedLandmark } from "./curated";
import { decodePolyline } from "./polyline";
import { scoreCandidate } from "./scoring";
import {
  DEFAULT_SCENIC_PREFERENCE,
  DETOUR_TIME_PENALTY_PER_MINUTE,
  MAX_CURATED_TRIALS,
  MAX_CURATED_WAYPOINTS,
  type ScenicPreference,
} from "../config";

export type DetourCandidate = RouteCandidate & { viaIds: string[] };

interface Trial {
  route: DetourCandidate;
  value: number;
}

// Searches for a better scenic route by adding hand-picked landmarks as
// pass-through waypoints. Only Routes API calls (cheap) and local scoring are
// used here; the expensive Places search runs later, only on what this returns.
//
//   1. Trial a detour via each of the top misses on its own.
//   2. Keep the best one that fits the time budget.
//   3. Try adding each other miss to it, one at a time; keep the result if the
//      value improves, and repeat until it stops improving (or hits the cap).
export async function findScenicDetours(
  start: LatLng,
  end: LatLng,
  fastest: RouteCandidate,
  budgetSeconds: number,
  preference: ScenicPreference = DEFAULT_SCENIC_PREFERENCE,
): Promise<DetourCandidate[]> {
  const basePath = decodePolyline(fastest.encodedPolyline);
  const misses = rankMisses(basePath, MAX_CURATED_TRIALS, undefined, preference);
  if (misses.length === 0) return [];

  const value = (path: LatLng[], viaIds: string[], durationSeconds: number) => {
    const extraMinutes = Math.max(0, durationSeconds - fastest.durationSeconds) / 60;
    return scoreCandidate(curatedOnRoute(path, viaIds), preference) - extraMinutes * DETOUR_TIME_PENALTY_PER_MINUTE;
  };
  const baseValue = value(basePath, [], fastest.durationSeconds);

  const seen = new Map<string, Trial | null>();
  const tryWaypoints = async (set: CuratedLandmark[]): Promise<Trial | null> => {
    const ordered = orderAlongRoute(basePath, set);
    const key = ordered.map((c) => c.id).join(",");
    if (seen.has(key)) return seen.get(key)!;

    let trial: Trial | null = null;
    try {
      const [route] = await computeRoutes(start, end, ordered);
      if (route.durationSeconds - fastest.durationSeconds <= budgetSeconds) {
        const viaIds = ordered.map((c) => c.id);
        trial = {
          route: { ...route, viaIds },
          value: value(decodePolyline(route.encodedPolyline), viaIds, route.durationSeconds),
        };
      }
    } catch (err) {
      if (!(err instanceof GoogleMapsError)) throw err; // a failed trial is just skipped
    }
    seen.set(key, trial);
    return trial;
  };
  const best = (trials: Array<Trial | null>): Trial | undefined =>
    trials.filter((t): t is Trial => t !== null).sort((a, b) => b.value - a.value)[0];

  let current = best(await Promise.all(misses.map((m) => tryWaypoints([m]))));
  while (current && current.value > baseValue && current.route.viaIds.length < MAX_CURATED_WAYPOINTS) {
    const have = new Set(current.route.viaIds);
    const held = misses.filter((m) => have.has(m.id));
    const next = best(await Promise.all(misses.filter((m) => !have.has(m.id)).map((m) => tryWaypoints([...held, m]))));
    if (!next || next.value <= current.value) break;
    current = next;
  }

  // The winner plus the next best distinct alternative, so scoring has a choice.
  return [...seen.values()]
    .filter((t): t is Trial => t !== null && t.value > baseValue)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((t) => t.route);
}
