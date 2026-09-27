import { GUIDE, serverUrl } from "../config";

// Place search for the guide. The Google key lives in server/, so this calls
// server/'s POST /places/nearby (SERVER_URL). Places only ever come from here.

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
  /** Relative, through server/'s /photo proxy. */
  photoUrl?: string;
}

/** The body of server/'s POST /places/nearby. */
export interface PlaceQuery {
  lat: number;
  lng: number;
  types?: string[];
  query?: string;
  radiusMeters: number;
  limit: number;
  minRating?: number;
  requireOpen?: boolean;
  sortBy?: "distance" | "rating";
}

export type SearchPlaces = (query: PlaceQuery) => Promise<PlaceCard[]>;

export const searchPlacesViaServer: SearchPlaces = async (query) => {
  const res = await fetch(`${serverUrl()}/places/nearby`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(GUIDE.placesTimeoutMs),
  });
  const body = (await res.json().catch(() => ({}))) as { places?: PlaceCard[]; error?: string };
  if (!res.ok || !Array.isArray(body.places)) {
    throw new Error(`place search failed: ${res.status} ${body.error ?? ""}`.trim());
  }
  return body.places;
};
