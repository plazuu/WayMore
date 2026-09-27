// Shapes returned by the Express server in `server/`. Keep in sync with
// docs/api.md.

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
  /** How much longer than the fastest route the scenic route may take. */
  maxExtraMinutes?: number;
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

// ---- Live guide chat (docs/api.md#live-guide) ----

export interface ChatSource {
  title: string;
  url: string;
}

/** The app's view of the trip, sent with each question so the guide knows what's been passed. */
export interface ChatRide {
  lat?: number;
  lng?: number;
  heading?: number | null;
  /** Places the car has reached; everything else is still ahead. */
  passedPlaceIds: string[];
  /** Lines narrated most recently, oldest first. */
  recent: { placeId: string; text: string }[];
}

export interface ChatReply {
  /** 1–4 plain-text sentences in the guide's voice. */
  reply: string;
  /** The route place the exchange is about, or null. */
  placeId: string | null;
  /** Web pages the answer cited; can be empty. */
  sources: ChatSource[];
}

// --- "Where to?" guide (POST /guide/destination, docs/destination-guide-api.md) ---

export type GuideStage = 'intent' | 'category' | 'results' | 'confirmed';

export interface GuideChip {
  id: string;
  label: string;
}

export interface GuidePlaceCard {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean;
  /** Relative. Resolve with `resolveServerUrl`. */
  photoUrl?: string;
}

export interface GuideDestination {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface GuideRequest {
  conversationId?: string;
  message?: string;
  choice?: { chipId?: string; placeId?: string };
  lat: number;
  lng: number;
}

export interface GuideResponse {
  conversationId: string;
  stage: GuideStage;
  reply: string;
  chips: GuideChip[];
  places: GuidePlaceCard[];
  destination: GuideDestination | null;
}
