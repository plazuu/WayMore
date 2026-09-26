import { postNarrationPregenerate, postRoute } from '@/api/endpoints';
import { buildMockRoute } from '@/api/mock/mockRoute';
import { MAX_NARRATION_PLACES } from '@/config';
import { localNarration, toNarrationPlace } from '@/features/tour/narrationText';

import type { Narration, RouteResponse, TripPoi } from '@/api/types';
import type { AppSettings } from '@/state/SettingsContext';

// The one place that decides between real server calls and demo data. Screens
// and state call these, never the endpoints directly.

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function planRoute(start: string, end: string, settings: AppSettings): Promise<RouteResponse> {
  if (settings.useMockData) {
    await delay(900);
    return buildMockRoute(start, end);
  }
  return postRoute(start, end, {
    sampleIntervalMeters: settings.sampleIntervalMeters,
    searchRadiusMeters: settings.searchRadiusMeters,
  });
}

/**
 * Narration for every POI on the trip, keyed by POI id. Always resolves: any POI
 * the server couldn't cover gets a local fallback line so the tour still works.
 */
export async function prepareNarrations(
  pois: TripPoi[],
  settings: AppSettings,
): Promise<Record<string, Narration>> {
  const byId: Record<string, Narration> = {};
  for (const poi of pois) byId[poi.id] = localNarration(poi);
  if (settings.useMockData || pois.length === 0) return byId;

  try {
    const places = pois.slice(0, MAX_NARRATION_PLACES).map(toNarrationPlace);
    const narrations = await postNarrationPregenerate(places);
    for (const n of narrations) byId[n.placeId] = n;
  } catch (error) {
    console.warn('Narration pregenerate failed; using local lines.', error);
  }
  return byId;
}
