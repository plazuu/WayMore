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
  /** How far the place is from the route line; set for landmarks only. */
  distanceFromRouteMeters?: number;
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
}

export async function searchNearby(
  center: LatLng,
  radiusMeters: number,
  includedTypes: string[],
  maxResultCount = 10,
): Promise<Poi[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new GoogleMapsError("GOOGLE_MAPS_API_KEY is not configured", 500);
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.types,places.priceLevel,places.photos,places.editorialSummary",
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount,
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

  return (data.places ?? []).map((place: any): Poi => {
    const types = place.types ?? [];
    const photoName = place.photos?.[0]?.name;
    return {
      id: place.id,
      name: place.displayName?.text ?? "Unknown",
      lat: place.location.latitude,
      lng: place.location.longitude,
      types,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      priceLevel: place.priceLevel ? PRICE_LEVEL_DISPLAY[place.priceLevel] : undefined,
      cuisine: deriveCuisine(types),
      description: place.editorialSummary?.text,
      photoUrl: photoName ? `/photo?name=${encodeURIComponent(photoName)}` : undefined,
    };
  });
}

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (!seen.has(item.id)) seen.set(item.id, item);
  }
  return [...seen.values()];
}
