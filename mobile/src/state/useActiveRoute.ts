import { useMemo } from 'react';

import { decodePolyline } from '@/lib/polyline';

import { getTripPois, otherMode } from './selectors';
import { useTrip } from './TripContext';

/** Everything the map and sheets need about the currently selected route option. */
export function useActiveRoute() {
  const { state } = useTrip();
  const { route, mode, filter, selectedPoiId } = state;

  return useMemo(() => {
    if (!route) return null;
    const option = route[mode];
    const alternate = route[otherMode(mode)];
    const allPois = getTripPois(option, 'all');
    return {
      option,
      coordinates: decodePolyline(option.polyline),
      // Only drawn when it's a different route.
      alternateCoordinates: alternate.polyline === option.polyline ? null : decodePolyline(alternate.polyline),
      allPois,
      visiblePois: getTripPois(option, filter),
      selectedPoi: allPois.find((p) => p.id === selectedPoiId) ?? null,
      sameRoute: route.normal.polyline === route.scenic.polyline,
    };
  }, [route, mode, filter, selectedPoiId]);
}

export type ActiveRoute = NonNullable<ReturnType<typeof useActiveRoute>>;
