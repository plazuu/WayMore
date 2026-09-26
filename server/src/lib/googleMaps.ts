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

/** Suggestions near `bias` rank first; farther matches still show up. 50 km is Google's max. */
const AUTOCOMPLETE_BIAS_RADIUS_METERS = 50_000;

/** Places Autocomplete (New). `sessionToken` should be the same string for every
 * keystroke of one address search and a fresh one per search, per Google's
 * session-based billing — see mobile's AddressAutocompleteField. */
export async function autocompletePlaces(
  input: string,
  sessionToken?: string,
  bias?: LatLng,
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
    body: JSON.stringify({
      input,
      ...(sessionToken ? { sessionToken } : {}),
      ...(bias
        ? {
            locationBias: {
              circle: {
                center: { latitude: bias.lat, longitude: bias.lng },
                radius: AUTOCOMPLETE_BIAS_RADIUS_METERS,
              },
            },
          }
        : {}),
    }),
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

export interface RouteStep {
  distanceMeters: number;
  /** Traffic-free time, so speed reflects the road type rather than today's traffic. */
  staticDurationSeconds: number;
  instruction: string;
  encodedPolyline: string;
}

export interface RouteCandidate {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  steps: RouteStep[];
}

export interface RouteOptions {
  avoidHighways?: boolean;
  /** Pass-through points (no stop). Google returns no alternatives when these are set. */
  via?: LatLng[];
}

const toLatLng = (p: LatLng) => ({ latLng: { latitude: p.lat, longitude: p.lng } });

export async function computeRoutes(
  origin: LatLng,
  destination: LatLng,
  options: RouteOptions = {},
): Promise<RouteCandidate[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new GoogleMapsError("GOOGLE_MAPS_API_KEY is not configured", 500);
  }

  const via = options.via ?? [];
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": [
        "routes.duration",
        "routes.distanceMeters",
        "routes.polyline.encodedPolyline",
        "routes.legs.steps.distanceMeters",
        "routes.legs.steps.staticDuration",
        "routes.legs.steps.navigationInstruction.instructions",
        "routes.legs.steps.polyline.encodedPolyline",
      ].join(","),
    },
    body: JSON.stringify({
      origin: { location: toLatLng(origin) },
      destination: { location: toLatLng(destination) },
      ...(via.length ? { intermediates: via.map((p) => ({ via: true, location: toLatLng(p) })) } : {}),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: via.length === 0,
      ...(options.avoidHighways ? { routeModifiers: { avoidHighways: true } } : {}),
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
    steps: (route.legs ?? []).flatMap((leg: any) =>
      (leg.steps ?? []).map(
        (step: any): RouteStep => ({
          distanceMeters: step.distanceMeters ?? 0,
          staticDurationSeconds: parseInt(step.staticDuration ?? "0", 10),
          instruction: step.navigationInstruction?.instructions ?? "",
          encodedPolyline: step.polyline?.encodedPolyline ?? "",
        }),
      ),
    ),
  }));
}
