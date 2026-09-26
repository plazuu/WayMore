import fs from "node:fs";
import path from "node:path";
import type { Poi } from "./places";
import { distanceToPathMeters, haversineMeters, type LatLng } from "./polyline";
import {
  CURATED_CORRIDOR_METERS,
  MAX_CURATED_TRIALS,
  MAX_LANDMARK_DISTANCE_FROM_ROUTE_METERS,
  MAX_NATURE_DISTANCE_FROM_ROUTE_METERS,
} from "../config";

// Hand-picked places worth seeing from the car. Edit data/landmarks.json to
// add or remove them; no code change needed.
export interface CuratedLandmark {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: "nature" | "view" | "historic" | "art" | "street";
  /** 1-5, how worth seeing it is. Used as the rating for scoring. */
  weight: number;
  note?: string;
}

// Mapped onto the Places type names the rest of the pipeline already understands
// (scoring treats "scenic_spot" as nature).
const KIND_TYPES: Record<CuratedLandmark["kind"], string[]> = {
  nature: ["scenic_spot"],
  view: ["scenic_spot"],
  historic: ["historical_landmark"],
  art: ["sculpture"],
  street: ["plaza"],
};

let cache: CuratedLandmark[] | undefined;

// Relative to the server/ directory, like the audio cache dir.
export function loadCurated(): CuratedLandmark[] {
  if (cache) return cache;
  const file = path.resolve(process.cwd(), process.env.CURATED_LANDMARKS_FILE || "data/landmarks.json");
  try {
    cache = JSON.parse(fs.readFileSync(file, "utf-8")) as CuratedLandmark[];
  } catch {
    cache = [];
  }
  return cache;
}

export function curatedToPoi(c: CuratedLandmark, distanceFromRouteMeters?: number): Poi {
  return {
    id: `curated:${c.id}`,
    name: c.name,
    lat: c.lat,
    lng: c.lng,
    types: KIND_TYPES[c.kind],
    rating: c.weight,
    userRatingCount: 10000,
    description: c.note,
    curated: true,
    distanceFromRouteMeters,
  };
}

function isOpenView(c: CuratedLandmark): boolean {
  return c.kind === "nature" || c.kind === "view";
}

// Curated landmarks already visible from this route. `forcedIds` are ones we
// routed through on purpose, kept regardless of the snapped-road distance.
export function curatedOnRoute(route: LatLng[], forcedIds: string[] = [], all = loadCurated()): Poi[] {
  const stops: Poi[] = [];
  for (const c of all) {
    const distance = Math.round(distanceToPathMeters(c, route));
    const limit = isOpenView(c) ? MAX_NATURE_DISTANCE_FROM_ROUTE_METERS : MAX_LANDMARK_DISTANCE_FROM_ROUTE_METERS;
    if (distance <= limit || forcedIds.includes(c.id)) stops.push(curatedToPoi(c, distance));
  }
  return stops;
}

// Curated landmarks the route misses but that sit within the corridor of it,
// best first. Ranked by worth minus a detour penalty (about one rating point
// per 3 km off the route).
export function rankMisses(route: LatLng[], max: number, all = loadCurated()): CuratedLandmark[] {
  const onRoute = new Set(curatedOnRoute(route, [], all).map((p) => p.id.replace("curated:", "")));
  return all
    .filter((c) => !onRoute.has(c.id))
    .map((c) => ({ c, score: 0, distance: distanceToPathMeters(c, route) }))
    .filter(({ distance }) => distance <= CURATED_CORRIDOR_METERS)
    .map((x) => ({ ...x, score: x.c.weight - x.distance / 3000 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ c }) => c);
}

// Sort landmarks in the order the route would pass them.
export function orderAlongRoute(route: LatLng[], landmarks: CuratedLandmark[]): CuratedLandmark[] {
  const progress = (c: CuratedLandmark) => {
    let best = 0;
    let bestDistance = Infinity;
    route.forEach((point, i) => {
      const d = haversineMeters(point, c);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    return best;
  };
  return [...landmarks].sort((a, b) => progress(a) - progress(b));
}
