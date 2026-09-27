// Shapes returned by the Express server in `server/`. Keep in sync with
// server/API.md (route + photo) and docs/narration-api.md (narration).

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export interface AddressSuggestion {
  placeId: string;
  /** Full, unambiguous address — pass this straight to postRoute/geocode. */
  text: string;
  mainText: string;
  secondaryText?: string;
}

export interface Poi {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Raw Google Places types, e.g. ["tourist_attraction", ...]. */
  types: string[];
  rating?: number;
  userRatingCount?: number;
  /** Google's main category for the place, e.g. "museum" or "service". */
  primaryType?: string;
  /** "$".."$$$$" or "Free"; food stops only. */
  priceLevel?: string;
  /** e.g. "Mediterranean"; food stops only. */
  cuisine?: string;
  /** Only about a third of POIs have one, so never assume it is there. */
  description?: string;
  /** Path on our server, e.g. "/photo?name=...". Resolve with `resolveServerUrl`. */
  photoUrl?: string;
}

export interface RouteOption {
  distanceMeters: number;
  durationSeconds: number;
  /** Google encoded polyline. Decode with `decodePolyline`. */
  polyline: string;
  samplePointCount: number;
  score: number;
  /** Road along the water (server-side scenic scoring; debug). */
  waterfrontMeters?: number;
  /** Highway not along the water (server-side scenic scoring; debug). */
  highwayMeters?: number;
  landmarks: Poi[];
  foodStops: Poi[];
}

export interface RouteResponse {
  start: GeoPoint;
  end: GeoPoint;
  /** Fastest candidate. */
  normal: RouteOption;
  /** Most waterfront and landmarks within the extra-time budget, avoiding plain highways. May be the same route as `normal`. */
  scenic: RouteOption;
  /** scenic.durationSeconds - normal.durationSeconds, can be 0. */
  extraTimeSeconds: number;
}

export interface RouteTuning {
  sampleIntervalMeters?: number;
  searchRadiusMeters?: number;
}

export interface NarrationPlace {
  id: string;
  name: string;
  kind: 'landmark' | 'restaurant';
  tagline?: string;
  category?: string;
  description?: string;
  facts?: string[];
  lat: number;
  lng: number;
  side?: 'left' | 'right' | 'ahead';
}

export interface Narration {
  placeId: string;
  text: string;
  /** Path on our server, e.g. "/audio/<key>.mp3". Null in mock mode or when TTS failed. */
  audioUrl: string | null;
  durationHintS: number;
}

// ---- App-side types derived from the server shapes ----

export type RouteMode = 'normal' | 'scenic';

export type PoiKind = 'landmark' | 'food';

/** A POI tagged with which list it came from, so landmarks and food stops can share one list/map layer. */
export interface TripPoi extends Poi {
  kind: PoiKind;
  /** 1–3 for the route's top three landmarks (see `getTripPois`). */
  topRank?: TopRank;
}

export type TopRank = 1 | 2 | 3;
