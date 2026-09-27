import { Image } from 'react-native';

import { resolveServerUrl } from '@/api/client';

import type { TripPoi } from '@/api/types';

/**
 * One width for every POI photo. The card list and the detail card asking for
 * the same width means the same URL, so opening a POI reuses the image the list
 * already loaded instead of fetching a second size. 640 px covers the widest
 * use (a full-width detail photo) on a 2-3x screen.
 */
export const POI_PHOTO_WIDTH_PX = 640;

/** Loadable URL for a POI's photo, or undefined when Places had none. */
export function poiPhotoUri(poi: TripPoi): string | undefined {
  return poi.photoUrl ? `${resolveServerUrl(poi.photoUrl)}&maxWidthPx=${POI_PHOTO_WIDTH_PX}` : undefined;
}

/** Photos downloading at once. Enough to fill the visible cards fast, few enough to leave room for narration requests. */
const PREFETCH_CONCURRENCY = 4;

// URIs already handed to the image loader, so switching route mode or filter
// (which remounts the card list) never re-requests them.
const started = new Set<string>();

/**
 * Warms the device image cache for these POIs' photos, so a card scrolled into
 * view or a POI tapped shows its photo immediately instead of starting a
 * request then. Fire and forget: failures just leave the placeholder in place.
 */
export function prefetchPoiPhotos(pois: TripPoi[]): void {
  const uris = [...new Set(pois.map(poiPhotoUri))].filter((uri): uri is string => !!uri && !started.has(uri));
  if (uris.length === 0) return;
  for (const uri of uris) started.add(uri);

  let next = 0;
  const worker = async () => {
    while (next < uris.length) {
      const uri = uris[next++];
      // Dropped from `started` on failure so a later render can try again.
      await Image.prefetch(uri).catch(() => started.delete(uri));
    }
  };
  void Promise.all(Array.from({ length: Math.min(PREFETCH_CONCURRENCY, uris.length) }, worker));
}
