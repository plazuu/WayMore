import { TOUR } from '@/config';
import { angleDelta, bearingDegrees, distanceMeters } from '@/lib/geo';

import type { Side } from './narrationText';
import type { LatLng, TripPoi } from '@/api/types';

export interface Position {
  coords: LatLng;
  /** Degrees from north, or null when unknown (stationary, no GPS heading). */
  heading: number | null;
  timestamp: number;
}

const poiCoords = (poi: TripPoi): LatLng => ({ latitude: poi.lat, longitude: poi.lng });

/** Where the POI is relative to the direction of travel. */
export function relativeSide(position: Position, poi: TripPoi): Side {
  if (position.heading == null) return 'ahead';
  const delta = angleDelta(position.heading, bearingDegrees(position.coords, poiCoords(poi)));
  if (Math.abs(delta) < 20) return 'ahead';
  return delta > 0 ? 'right' : 'left';
}

function isAhead(position: Position, poi: TripPoi): boolean {
  if (position.heading == null) return true;
  const delta = angleDelta(position.heading, bearingDegrees(position.coords, poiCoords(poi)));
  return Math.abs(delta) <= TOUR.aheadAngleDeg;
}

/** Unvisited POIs that should narrate now: in range and ahead of you (or right beside you), nearest first. */
export function findTriggeredPois(
  position: Position,
  pois: TripPoi[],
  visited: ReadonlySet<string>,
  triggerRadiusMeters: number,
): TripPoi[] {
  return pois
    .filter((poi) => !visited.has(poi.id))
    .map((poi) => ({ poi, distance: distanceMeters(position.coords, poiCoords(poi)) }))
    .filter(({ poi, distance }) => {
      if (distance > triggerRadiusMeters) return false;
      return distance <= TOUR.closeRadiusMeters || isAhead(position, poi);
    })
    .sort((a, b) => a.distance - b.distance)
    .map(({ poi }) => poi);
}

/** The nearest unvisited POI ahead, for the "Up next" banner. */
export function findNextPoi(
  position: Position,
  pois: TripPoi[],
  visited: ReadonlySet<string>,
): { poi: TripPoi; distanceMeters: number } | null {
  let best: { poi: TripPoi; distanceMeters: number } | null = null;
  for (const poi of pois) {
    if (visited.has(poi.id) || !isAhead(position, poi)) continue;
    const d = distanceMeters(position.coords, poiCoords(poi));
    if (!best || d < best.distanceMeters) best = { poi, distanceMeters: d };
  }
  return best;
}
