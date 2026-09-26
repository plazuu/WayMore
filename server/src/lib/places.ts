import { GoogleMapsError } from "./googleMaps";
import type { LatLng } from "./polyline";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export const LANDMARK_TYPES = ["tourist_attraction", "park", "museum", "historical_landmark"];
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
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  cuisine?: string;
  description?: string;
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
