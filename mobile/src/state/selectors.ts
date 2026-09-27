import type { PoiFilter } from './tripReducer';

import type { Poi, RouteMode, RouteOption, TopRank, TripPoi } from '@/api/types';

/** Reviews a rating needs before it outweighs the typical-landmark prior below. */
const RATING_CONFIDENCE_REVIEWS = 200;
const TYPICAL_LANDMARK_RATING = 4.3;

/**
 * Rating pulled toward a typical landmark's until it has enough reviews, so a
 * 5.0 with three reviews doesn't outrank a 4.7 with twenty thousand.
 */
function landmarkStanding(poi: Poi): number {
  const reviews = poi.userRatingCount ?? 0;
  if (poi.rating === undefined || reviews === 0) return 0;
  return (reviews * poi.rating + RATING_CONFIDENCE_REVIEWS * TYPICAL_LANDMARK_RATING) / (reviews + RATING_CONFIDENCE_REVIEWS);
}

/** Categories that make a place a real attraction; plain parks and businesses tagged as attractions don't qualify. */
const ATTRACTION_TYPES = new Set([
  'tourist_attraction',
  'historical_landmark',
  'historical_place',
  'cultural_landmark',
  'monument',
  'sculpture',
  'art_gallery',
  'observation_deck',
]);

function isAttraction(poi: Poi): boolean {
  // Older/demo data has no primaryType; let it compete on rating alone.
  if (!poi.primaryType) return true;
  return ATTRACTION_TYPES.has(poi.primaryType) || poi.primaryType.endsWith('museum');
}

/** Ids of the route's three best attractions, mapped to their rank. */
function topLandmarkRanks(landmarks: Poi[]): Map<string, TopRank> {
  const ranked = landmarks
    .filter((p) => isAttraction(p) && landmarkStanding(p) > 0)
    .sort((a, b) => landmarkStanding(b) - landmarkStanding(a))
    .slice(0, 3);
  return new Map(ranked.map((p, i) => [p.id, (i + 1) as TopRank]));
}

/** Landmarks and food stops merged into one list, tagged by kind, narrowed by the filter. */
export function getTripPois(option: RouteOption, filter: PoiFilter): TripPoi[] {
  const topRanks = topLandmarkRanks(option.landmarks);
  const landmarks: TripPoi[] =
    filter === 'food'
      ? []
      : option.landmarks.map((p) => ({ ...p, kind: 'landmark', topRank: topRanks.get(p.id) }));
  const food: TripPoi[] = filter === 'landmarks' ? [] : option.foodStops.map((p) => ({ ...p, kind: 'food' }));
  return [...landmarks, ...food];
}

export const otherMode = (mode: RouteMode): RouteMode => (mode === 'scenic' ? 'normal' : 'scenic');
