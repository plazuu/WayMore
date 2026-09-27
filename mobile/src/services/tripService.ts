import { ApiError } from '@/api/client';
import { getNarrationIntro, postNarrationPregenerate, postRoute } from '@/api/endpoints';
import { buildMockRoute } from '@/api/mock/mockRoute';
import { TOUR } from '@/config';
import { getCurrentLocation, isCurrentLocationLabel } from '@/features/location/currentLocation';
import { toNarrationPlace } from '@/features/tour/narrationText';
import { distanceMeters } from '@/lib/geo';
import { getTripPois } from '@/state/selectors';

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
  return postRoute(await resolveCurrentLocation(start), await resolveCurrentLocation(end), {
    sampleIntervalMeters: settings.sampleIntervalMeters,
    searchRadiusMeters: settings.searchRadiusMeters,
    preference: settings.scenicPreference,
    // 0 means automatic: leave it out so the server scales it with the trip.
    maxExtraMinutes: settings.maxExtraMinutes > 0 ? settings.maxExtraMinutes : undefined,
  });
}

/**
 * "Current location" becomes the phone's coordinates as "lat,lng", which the
 * server's geocoder accepts like an address.
 */
async function resolveCurrentLocation(place: string): Promise<string> {
  if (!isCurrentLocationLabel(place)) return place;
  const here = await getCurrentLocation();
  if (!here) throw new ApiError("Couldn't get your location. Allow location access, or type a starting address.");
  return `${here.latitude.toFixed(6)},${here.longitude.toFixed(6)}`;
}

// Voiced narrations received this session, by POI id. The server caches every
// clip on disk, so one fetched once (by the preview warm-up or an earlier tour)
// never needs asking for again.
const received = new Map<string, Narration>();

// The voiced trip greeting, once fetched (the same for every trip).
let intro: Narration | undefined;

/** The server's voiced trip greeting, if it has arrived. */
export function receivedIntro(): Narration | undefined {
  return intro;
}

/** The server's voiced narration for a POI, if it has arrived. */
export function receivedNarration(poiId: string): Narration | undefined {
  return received.get(poiId);
}

/**
 * Server narration (line + voice) for a few POIs, in the same order. The tour
 * asks for POIs as they come into range (see useTourGuide). Also asked in
 * demo-data mode: demo data only replaces the route search, so the server's
 * voice still plays whenever the server is reachable. Throws when the server
 * can't be reached; the tour then keeps its local lines.
 */
export async function fetchNarrations(pois: TripPoi[]): Promise<Narration[]> {
  const narrations = await postNarrationPregenerate(pois.map(toNarrationPlace));
  // Lines without audio aren't kept: the local line can say left/right, and a later ask may get audio.
  for (const n of narrations) if (n.audioUrl) received.set(n.placeId, n);
  return narrations;
}

/**
 * Starts generating narration for the POIs nearest the trip's start while the
 * route preview is open, so their clips are cached on the server when the tour
 * begins; the tour's own lookahead can't have them ready at its first position.
 * Covers both routes (they share the start). Fire and forget: results land in
 * `receivedNarration`, and a POI the tour asks for meanwhile is shared by the
 * server with the warm-up's request.
 */
export function warmStartNarrations(route: RouteResponse): void {
  const start = { latitude: route.start.lat, longitude: route.start.lng };
  const byId = new Map<string, TripPoi>();
  for (const option of [route.scenic, route.normal, ...(route.scenicLong ? [route.scenicLong] : [])]) {
    for (const poi of getTripPois(option, 'all')) byId.set(poi.id, poi);
  }
  const nearest = [...byId.values()]
    .map((poi) => ({ poi, distance: distanceMeters(start, { latitude: poi.lat, longitude: poi.lng }) }))
    .filter(({ poi, distance }) => distance <= TOUR.warmupRadiusMeters && !received.has(poi.id))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, TOUR.warmupMaxPlaces)
    .map(({ poi }) => poi);
  // The greeting plays first, so fetch it before the places.
  const introReady = intro
    ? Promise.resolve()
    : getNarrationIntro()
        .then((n) => {
          if (n.audioUrl) intro = n;
        })
        .catch(() => {});
  void (async () => {
    await introReady;
    // Batches in order, so the nearest arrive first.
    for (let i = 0; i < nearest.length; i += TOUR.prefetchBatchSize) {
      await fetchNarrations(nearest.slice(i, i + TOUR.prefetchBatchSize));
    }
  })().catch(() => {});
}
