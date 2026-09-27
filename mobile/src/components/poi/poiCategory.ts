import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import { colors } from '@/theme';

import type { TripPoi } from '@/api/types';

export type PoiGlyph = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface PoiCategory {
  label: string;
  icon: PoiGlyph;
  color: string;
  softColor: string;
}

/**
 * Category colors after Apple Maps' palette: food & drink orange, arts &
 * culture pink, nature green, water blue, landmarks brown, faith gray,
 * shopping yellow.
 */
const C = colors.poi;

const category = (label: string, icon: PoiGlyph, color: string): PoiCategory => ({
  label,
  icon,
  color,
  softColor: `${color}1F`,
});

/** Google Places type → how the place is drawn. Checked against primaryType first, then every type in order. */
const BY_TYPE: Record<string, PoiCategory> = {
  // Food & drink
  cafe: category('Café', 'coffee', C.food),
  coffee_shop: category('Coffee', 'coffee', C.food),
  bakery: category('Bakery', 'cupcake', C.food),
  ice_cream_shop: category('Ice cream', 'ice-cream', C.food),
  bar: category('Bar', 'glass-cocktail', C.food),
  pub: category('Pub', 'glass-mug-variant', C.food),
  wine_bar: category('Wine bar', 'glass-cocktail', C.food),
  night_club: category('Nightlife', 'glass-cocktail', C.food),
  brewery: category('Brewery', 'glass-mug-variant', C.food),
  restaurant: category('Restaurant', 'silverware-fork-knife', C.food),
  food: category('Food', 'silverware-fork-knife', C.food),

  // Arts & culture
  museum: category('Museum', 'bank', C.culture),
  art_gallery: category('Art gallery', 'image-frame', C.culture),
  performing_arts_theater: category('Theater', 'drama-masks', C.culture),
  concert_hall: category('Concert hall', 'music', C.culture),
  opera_house: category('Opera house', 'drama-masks', C.culture),
  sculpture: category('Sculpture', 'palette', C.culture),
  cultural_center: category('Cultural center', 'palette', C.culture),
  event_venue: category('Venue', 'ticket', C.culture),
  convention_center: category('Venue', 'ticket', C.culture),
  amusement_park: category('Amusement park', 'ferris-wheel', C.culture),

  // Landmarks & history
  historical_landmark: category('Historic site', 'pillar', C.landmark),
  historical_place: category('Historic site', 'pillar', C.landmark),
  monument: category('Monument', 'pillar', C.landmark),
  cultural_landmark: category('Landmark', 'star', C.landmark),
  observation_deck: category('Viewpoint', 'binoculars', C.landmark),
  scenic_spot: category('Viewpoint', 'binoculars', C.landmark),
  bridge: category('Bridge', 'bridge', C.landmark),
  fountain: category('Fountain', 'fountain', C.landmark),
  castle: category('Castle', 'castle', C.landmark),
  city_hall: category('City hall', 'town-hall', C.landmark),
  library: category('Library', 'book-open-page-variant', C.landmark),
  university: category('University', 'school', C.landmark),
  cemetery: category('Cemetery', 'grave-stone', C.faith),

  // Nature & outdoors
  park: category('Park', 'tree', C.nature),
  city_park: category('Park', 'tree', C.nature),
  national_park: category('National park', 'pine-tree', C.nature),
  state_park: category('State park', 'pine-tree', C.nature),
  botanical_garden: category('Garden', 'flower-tulip', C.nature),
  garden: category('Garden', 'flower-tulip', C.nature),
  hiking_area: category('Trail', 'hiking', C.nature),
  zoo: category('Zoo', 'paw', C.nature),
  stadium: category('Stadium', 'stadium-variant', C.nature),
  arena: category('Arena', 'stadium-variant', C.nature),

  // Water
  beach: category('Beach', 'beach', C.water),
  marina: category('Marina', 'sail-boat', C.water),
  ferry_terminal: category('Ferry', 'ferry', C.water),
  fishing_pier: category('Pier', 'anchor', C.water),
  island: category('Island', 'island', C.water),
  aquarium: category('Aquarium', 'fish', C.water),

  // Faith
  church: category('Church', 'church', C.faith),
  mosque: category('Mosque', 'mosque', C.faith),
  synagogue: category('Synagogue', 'synagogue', C.faith),
  hindu_temple: category('Temple', 'temple-buddhist', C.faith),
  buddhist_temple: category('Temple', 'temple-buddhist', C.faith),
  place_of_worship: category('Place of worship', 'church', C.faith),

  // Shopping
  shopping_mall: category('Shopping', 'shopping', C.shopping),
  market: category('Market', 'shopping', C.shopping),
  store: category('Shop', 'shopping', C.shopping),
};

const FALLBACK: Record<TripPoi['kind'], PoiCategory> = {
  landmark: category('Landmark', 'star', C.landmark),
  food: category('Restaurant', 'silverware-fork-knife', C.food),
};

function lookup(type: string | undefined): PoiCategory | undefined {
  if (!type) return undefined;
  if (BY_TYPE[type]) return BY_TYPE[type];
  // "seafood_restaurant", "art_museum", "history_museum", ...
  if (type.endsWith('_restaurant')) return BY_TYPE.restaurant;
  if (type.endsWith('_museum')) return BY_TYPE.museum;
  return undefined;
}

/** How a POI is drawn: its specific category, like Apple Maps, falling back to landmark/food. */
export function getPoiCategory(poi: TripPoi): PoiCategory {
  const fromPrimary = lookup(poi.primaryType);
  if (fromPrimary) return fromPrimary;
  // Food stops came from a restaurant/café search; don't let a stray "store" tag relabel them.
  const types = poi.kind === 'food' ? poi.types.filter((t) => lookup(t)?.color === C.food) : poi.types;
  // tourist_attraction is on most results and says nothing specific, so it isn't in the table:
  // those places fall through to the generic landmark star.
  for (const type of types) {
    const found = lookup(type);
    if (found) return found;
  }
  return FALLBACK[poi.kind];
}
