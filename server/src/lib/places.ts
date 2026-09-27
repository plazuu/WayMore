import { GoogleMapsError } from "./googleMaps";
import type { LatLng } from "./polyline";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Searched for along the route. Deliberately outdoor / street-visible: what a
// passenger can enjoy through the window, not what is impressive inside
// (museums, galleries and aquariums are left out on purpose).
export const NATURE_TYPES = ["beach", "park", "city_park", "national_park", "state_park", "botanical_garden", "garden", "marina", "scenic_spot"];
export const LANDMARK_ONLY_TYPES = ["tourist_attraction", "historical_landmark", "monument", "sculpture", "plaza", "fountain", "bridge", "observation_deck", "cultural_landmark"];
export const LANDMARK_TYPES = [...LANDMARK_ONLY_TYPES, ...NATURE_TYPES];
export const FOOD_TYPES = ["restaurant", "cafe"];
/** Places that sit on the water; road near them counts as waterfront. */
export const WATER_TYPES = ["marina", "beach", "fishing_pier", "ferry_terminal", "island"];
/** Water places a car can drive past, so routing through one hugs the shore (islands can be dead ends). */
export const WATER_WAYPOINT_TYPES = ["marina", "beach", "fishing_pier"];

const PRICE_LEVEL_DISPLAY: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

function deriveCuisine(types: string[]): string | undefined {
  const cuisineType = types.find((t) => t.endsWith("_restaurant") && t !== "restaurant");
  if (!cuisineType) return undefined;
  return cuisineType
    .replace(/_restaurant$/, "")
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export interface Poi {
  id: string;
  name: string;
  lat: number;
  lng: number;
  types: string[];
  /** Food stops only: close enough to the final stretch of the route to be seen from the car. */
  visibleFromRoute?: boolean;
  /** Food stops only: how far the place is from the destination. */
  distanceFromDestinationMeters?: number;
  /** How far the place is from the route line; set for landmarks only. */
  distanceFromRouteMeters?: number;
  primaryType?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  cuisine?: string;
  description?: string;
  /** True for hand-picked stops from data/landmarks.json (see lib/curated.ts). */
  curated?: boolean;
  // Relative path on this server, not a direct Google URL — the API key
  // stays server-side, so the mobile app must load photos through /photo.
  photoUrl?: string;
  /** Detailed searches only (see SearchOptions). */
  address?: string;
  /** Detailed searches only; absent when Google has no opening hours for the place. */
  openNow?: boolean;
}

const BASE_FIELDS =
  "places.id,places.displayName,places.location,places.primaryType,places.rating,places.userRatingCount,places.types,places.priceLevel,places.photos,places.editorialSummary";
// Opening hours put a request in a more expensive Places pricing tier, so only
// the destination guide asks for these; /route's searches stay on BASE_FIELDS.
const DETAIL_FIELDS = ",places.formattedAddress,places.currentOpeningHours.openNow";

export interface SearchOptions {
  /** Adds `address` and `openNow` to each result. */
  detailed?: boolean;
}

function fieldMask({ detailed }: SearchOptions): string {
  return detailed ? BASE_FIELDS + DETAIL_FIELDS : BASE_FIELDS;
}

function toPoi(place: any): Poi {
  const types = place.types ?? [];
  const photoName = place.photos?.[0]?.name;
  return {
    id: place.id,
    name: place.displayName?.text ?? "Unknown",
    lat: place.location.latitude,
    lng: place.location.longitude,
    types,
    primaryType: place.primaryType,
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    priceLevel: place.priceLevel ? PRICE_LEVEL_DISPLAY[place.priceLevel] : undefined,
    cuisine: deriveCuisine(types),
    description: place.editorialSummary?.text,
    photoUrl: photoName ? `/photo?name=${encodeURIComponent(photoName)}` : undefined,
    address: place.formattedAddress,
    openNow: place.currentOpeningHours?.openNow,
  };
}

export async function searchNearby(
  center: LatLng,
  radiusMeters: number,
  includedTypes: string[],
  maxResultCount = 10,
  rankPreference: "POPULARITY" | "DISTANCE" = "POPULARITY",
  options: SearchOptions = {},
): Promise<Poi[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new GoogleMapsError("GOOGLE_MAPS_API_KEY is not configured", 500);
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": fieldMask(options),
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount,
      rankPreference,
      locationRestriction: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusMeters,
        },
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new GoogleMapsError(`Places search failed: ${data.error?.message ?? response.statusText}`, 502);
  }

  return (data.places ?? []).map(toPoi);
}

/**
 * Places Text Search (New) for free text like "sushi" or a restaurant's name,
 * biased (not restricted) to a circle, so a well-known match a bit farther out
 * still shows up.
 */
export async function searchText(
  textQuery: string,
  center: LatLng,
  radiusMeters: number,
  pageSize = 10,
  options: SearchOptions = {},
): Promise<Poi[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new GoogleMapsError("GOOGLE_MAPS_API_KEY is not configured", 500);
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": fieldMask(options),
    },
    body: JSON.stringify({
      textQuery,
      pageSize,
      locationBias: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusMeters,
        },
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new GoogleMapsError(`Places search failed: ${data.error?.message ?? response.statusText}`, 502);
  }

  return (data.places ?? []).map(toPoi);
}

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (!seen.has(item.id)) seen.set(item.id, item);
  }
  return [...seen.values()];
}
