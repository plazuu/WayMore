import type { PoiFilter } from './tripReducer';

import type { RouteMode, RouteOption, TripPoi } from '@/api/types';

/** Landmarks and food stops merged into one list, tagged by kind, narrowed by the filter. */
export function getTripPois(option: RouteOption, filter: PoiFilter): TripPoi[] {
  const landmarks: TripPoi[] = filter === 'food' ? [] : option.landmarks.map((p) => ({ ...p, kind: 'landmark' }));
  const food: TripPoi[] = filter === 'landmarks' ? [] : option.foodStops.map((p) => ({ ...p, kind: 'food' }));
  return [...landmarks, ...food];
}

export const otherMode = (mode: RouteMode): RouteMode => (mode === 'scenic' ? 'normal' : 'scenic');
