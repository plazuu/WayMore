import { humanizeType } from '@/lib/format';

import type { Narration, NarrationPlace, TripPoi } from '@/api/types';

export type Side = NonNullable<NarrationPlace['side']>;

/** Maps an app POI to the server's narration input. */
export function toNarrationPlace(poi: TripPoi): NarrationPlace {
  return {
    id: poi.id,
    name: poi.name,
    kind: poi.kind === 'food' ? 'restaurant' : 'landmark',
    category: poi.cuisine ?? humanizeType(poi.types[0]),
    description: poi.description,
    lat: poi.lat,
    lng: poi.lng,
  };
}

/**
 * Line used when the server has no narration for a POI (demo data, server down,
 * or not generated yet). Mirrors the server's own mock template tone: landmarks
 * informative, food stops a suggestion.
 */
export function localNarration(poi: TripPoi, side?: Side): Narration {
  const where = side && side !== 'ahead' ? `On your ${side} is` : 'Coming up is';
  const text =
    poi.kind === 'food'
      ? `${where} ${poi.name}${poi.cuisine ? `, a ${poi.cuisine.toLowerCase()} spot` : ''}. A great stop if you're hungry.`
      : `${where} ${poi.name}. ${poi.description ?? ''}`.trim();
  const words = text.split(/\s+/).length;
  return { placeId: poi.id, text, audioUrl: null, durationHintS: Math.max(3, words / 2.6) };
}
