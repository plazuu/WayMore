import {
  PLACES_SEARCH_FETCH_COUNT,
  PLACES_SEARCH_MIN_RATING,
  PLACES_SEARCH_MIN_REVIEWS,
} from "../config";
import { haversineMeters, type LatLng } from "./polyline";
import { searchNearby, searchText, type Poi } from "./places";

// Place search for the destination guide: good places near the user, nearest
// first. Unlike /route's searches it asks Places for address and open-now.

export interface PlaceCard {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean;
  /** Relative, through this server's /photo proxy. */
  photoUrl?: string;
}

export interface PlaceSearch {
  center: LatLng;
  /** Google place types for Nearby Search. */
  types?: string[];
  /** Free text for Text Search. Used when there are no types, or when the type search fails. */
  query?: string;
  radiusMeters: number;
  limit: number;
  minRating?: number;
  minReviews?: number;
  /** Drop places not known to be open. By default only places known to be closed are dropped. */
  requireOpen?: boolean;
  /** "distance" (default): nearest first. "rating": best rated first. */
  sortBy?: "distance" | "rating";
}

async function fetchPlaces(search: PlaceSearch, radiusMeters: number): Promise<Poi[]> {
  const { center, types, query } = search;
  const detailed = { detailed: true };
  if (types?.length) {
    try {
      return await searchNearby(center, radiusMeters, types, PLACES_SEARCH_FETCH_COUNT, "POPULARITY", detailed);
    } catch (err) {
      // Google rejects the whole request if one type is unsupported; free text still works.
      if (!query) throw err;
      console.warn(`[places] nearby search for ${types.join(",")} failed, using text search:`, (err as Error).message);
    }
  }
  return searchText(query ?? "", center, radiusMeters, PLACES_SEARCH_FETCH_COUNT, detailed);
}

function toCards(pois: Poi[], search: PlaceSearch, radiusMeters: number): PlaceCard[] {
  const minRating = search.minRating ?? PLACES_SEARCH_MIN_RATING;
  const minReviews = search.minReviews ?? PLACES_SEARCH_MIN_REVIEWS;
  const cards = pois
    .filter((p) => (p.rating ?? 0) >= minRating && (p.userRatingCount ?? 0) >= minReviews)
    .filter((p) => (search.requireOpen ? p.openNow === true : p.openNow !== false))
    .map((p) => ({
      placeId: p.id,
      name: p.name,
      address: p.address ?? "",
      lat: p.lat,
      lng: p.lng,
      distanceMeters: Math.round(haversineMeters(search.center, p)),
      rating: p.rating,
      userRatingCount: p.userRatingCount,
      openNow: p.openNow,
      photoUrl: p.photoUrl,
    }))
    // Text Search is only biased to the circle, so drop far-away matches.
    .filter((c) => c.distanceMeters <= radiusMeters);
  if (search.sortBy === "rating") {
    return cards.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0));
  }
  return cards.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * Up to `limit` good places, nearest (or best rated) first. When fewer than
 * `limit` pass the filters, searches once more at double the radius.
 */
export async function findPlaces(search: PlaceSearch): Promise<PlaceCard[]> {
  let cards = toCards(await fetchPlaces(search, search.radiusMeters), search, search.radiusMeters);
  if (cards.length < search.limit) {
    // Google's maximum search radius is 50 km.
    const wider = Math.min(search.radiusMeters * 2, 50_000);
    cards = toCards(await fetchPlaces(search, wider), search, wider);
  }
  return cards.slice(0, search.limit);
}
