const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export class GoogleMapsError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new GoogleMapsError("GOOGLE_MAPS_API_KEY is not configured", 500);
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url);
  const data = await response.json();

  if (data.status === "ZERO_RESULTS") {
    throw new GoogleMapsError(`No results for address: ${address}`, 404);
  }
  if (data.status !== "OK") {
    throw new GoogleMapsError(
      `Geocoding failed: ${data.status}${data.error_message ? ` - ${data.error_message}` : ""}`,
      502,
    );
  }

  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
  };
}

export interface AutocompleteSuggestion {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText?: string;
}

/** Places Autocomplete (New). `sessionToken` should be the same string for every
 * keystroke of one address search and a fresh one per search, per Google's
 * session-based billing — see mobile's AddressAutocompleteField. */
export async function autocompletePlaces(
  input: string,
  sessionToken?: string,
): Promise<AutocompleteSuggestion[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new GoogleMapsError("GOOGLE_MAPS_API_KEY is not configured", 500);
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
    },
    body: JSON.stringify({ input, ...(sessionToken ? { sessionToken } : {}) }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new GoogleMapsError(
      `Autocomplete failed: ${data.error?.message ?? response.statusText}`,
      502,
    );
  }

  return (data.suggestions ?? [])
    .filter((s: any) => s.placePrediction)
    .map((s: any): AutocompleteSuggestion => {
      const prediction = s.placePrediction;
      return {
        placeId: prediction.placeId,
        text: prediction.text?.text ?? "",
        mainText: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "",
        secondaryText: prediction.structuredFormat?.secondaryText?.text,
      };
    });
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteCandidate {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
}

export async function computeRoutes(origin: LatLng, destination: LatLng): Promise<RouteCandidate[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new GoogleMapsError("GOOGLE_MAPS_API_KEY is not configured", 500);
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: true,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new GoogleMapsError(
      `Routes API failed: ${data.error?.message ?? response.statusText}`,
      502,
    );
  }
  if (!data.routes || data.routes.length === 0) {
    throw new GoogleMapsError("No routes found between the given points", 404);
  }

  return data.routes.map((route: any) => ({
    distanceMeters: route.distanceMeters,
    durationSeconds: parseInt(route.duration, 10),
    encodedPolyline: route.polyline.encodedPolyline,
  }));
}
