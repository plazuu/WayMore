import { Router } from "express";
import {
  geocodeAddress,
  computeRoutes,
  GoogleMapsError,
  type LatLng,
  type RouteCandidate,
  type RouteOptions,
} from "../lib/googleMaps";
import { decodePolyline, sampleAlongPath } from "../lib/polyline";
import { searchNearby, dedupeById, LANDMARK_TYPES, FOOD_TYPES, WATER_TYPES, type Poi } from "../lib/places";
import {
  analyzeSteps,
  isRealWaterPlace,
  pickScenic,
  pickWaterWaypoints,
  scenicScore,
  waterSearchCircles,
  withinBudget,
} from "../lib/scoring";
import {
  DEFAULT_SAMPLE_INTERVAL_METERS,
  MIN_SAMPLE_INTERVAL_METERS,
  MAX_SAMPLE_INTERVAL_METERS,
  DEFAULT_SEARCH_RADIUS_METERS,
  MIN_SEARCH_RADIUS_METERS,
  MAX_SEARCH_RADIUS_METERS,
} from "../config";

export const routeRouter = Router();

function parseNumberParam(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "string") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

interface ScoredCandidate extends RouteCandidate {
  samplePointCount: number;
  landmarks: Poi[];
  foodStops: Poi[];
  waterfrontMeters: number;
  highwayMeters: number;
  score: number;
}

function toRouteResponse(candidate: ScoredCandidate) {
  return {
    distanceMeters: candidate.distanceMeters,
    durationSeconds: candidate.durationSeconds,
    polyline: candidate.encodedPolyline,
    samplePointCount: candidate.samplePointCount,
    score: candidate.score,
    waterfrontMeters: candidate.waterfrontMeters,
    highwayMeters: candidate.highwayMeters,
    landmarks: candidate.landmarks,
    foodStops: candidate.foodStops,
  };
}

/** Extra candidates are best-effort: one Google can't route shouldn't fail the request. */
async function optionalRoutes(origin: LatLng, destination: LatLng, options: RouteOptions) {
  try {
    return await computeRoutes(origin, destination, options);
  } catch (err) {
    if (err instanceof GoogleMapsError) return [];
    throw err;
  }
}

/** Water places only refine the scenic choice, so a failed search just finds none there. */
async function optionalWaterPlaces(center: LatLng, radiusMeters: number) {
  try {
    return await searchNearby(center, radiusMeters, WATER_TYPES, 20, "DISTANCE");
  } catch (err) {
    if (err instanceof GoogleMapsError) return [];
    throw err;
  }
}

function dedupeRoutes(candidates: RouteCandidate[]): RouteCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.encodedPolyline)) return false;
    seen.add(c.encodedPolyline);
    return true;
  });
}

// Response always returns both the fastest ("normal") and the scenic candidate
// plus the time difference between them, so the mobile app's normal/scenic
// toggle needs only one call. How "scenic" is chosen: see lib/scoring.ts.
routeRouter.post("/route", async (req, res) => {
  const { start, end } = req.body ?? {};

  if (typeof start !== "string" || start.trim().length === 0) {
    res.status(400).json({ error: "Request body must include a non-empty 'start' string" });
    return;
  }
  if (typeof end !== "string" || end.trim().length === 0) {
    res.status(400).json({ error: "Request body must include a non-empty 'end' string" });
    return;
  }

  const sampleIntervalMeters = parseNumberParam(
    req.query.sampleIntervalMeters,
    DEFAULT_SAMPLE_INTERVAL_METERS,
    MIN_SAMPLE_INTERVAL_METERS,
    MAX_SAMPLE_INTERVAL_METERS,
  );
  const searchRadiusMeters = parseNumberParam(
    req.query.searchRadiusMeters,
    DEFAULT_SEARCH_RADIUS_METERS,
    MIN_SEARCH_RADIUS_METERS,
    MAX_SEARCH_RADIUS_METERS,
  );

  try {
    const [startGeo, endGeo] = await Promise.all([geocodeAddress(start), geocodeAddress(end)]);

    // Candidates overlap heavily, so one Places search per spot serves them all.
    const searches = new Map<string, Promise<Poi[]>>();
    const search = (pt: LatLng, types: string[]) => {
      const key = `${pt.lat.toFixed(3)},${pt.lng.toFixed(3)}|${types.join(",")}`;
      if (!searches.has(key)) searches.set(key, searchNearby(pt, searchRadiusMeters, types));
      return searches.get(key)!;
    };

    const [baseRoutes, waterResults] = await Promise.all([
      computeRoutes(startGeo, endGeo),
      Promise.all(waterSearchCircles(startGeo, endGeo).map((c) => optionalWaterPlaces(c.center, c.radiusMeters))),
    ]);
    const water = dedupeById(waterResults.flat()).filter(isRealWaterPlace);

    // Google's alternatives favor highways and rarely follow the shore, so also
    // ask for a no-highway route and routes through waterfront spots.
    const extraRoutes = await Promise.all([
      optionalRoutes(startGeo, endGeo, { avoidHighways: true }),
      ...pickWaterWaypoints(startGeo, endGeo, water).map((w) =>
        optionalRoutes(startGeo, endGeo, { avoidHighways: true, via: [w] }),
      ),
    ]);

    const allRoutes = dedupeRoutes([...baseRoutes, ...extraRoutes.flat()]);
    const fastestSeconds = Math.min(...allRoutes.map((c) => c.durationSeconds));
    // Routes over the time budget can be neither normal nor scenic: skip their Places searches.
    const candidates = withinBudget(allRoutes, fastestSeconds);

    const enrichedCandidates: ScoredCandidate[] = await Promise.all(
      candidates.map(async (candidate) => {
        const points = decodePolyline(candidate.encodedPolyline);
        const samplePoints = sampleAlongPath(points, sampleIntervalMeters);

        const [landmarkResults, foodResults] = await Promise.all([
          Promise.all(samplePoints.map((pt) => search(pt, LANDMARK_TYPES))),
          Promise.all(samplePoints.map((pt) => search(pt, FOOD_TYPES))),
        ]);

        const landmarks = dedupeById(landmarkResults.flat());
        const foodStops = dedupeById(foodResults.flat()).filter((poi) => (poi.rating ?? 0) >= 4.0);
        const scenery = analyzeSteps(candidate.steps, water);

        return {
          ...candidate,
          samplePointCount: samplePoints.length,
          landmarks,
          foodStops,
          ...scenery,
          score: scenicScore({
            waterfrontMeters: scenery.waterfrontMeters,
            landmarks,
            dropOff: endGeo,
            extraSeconds: candidate.durationSeconds - fastestSeconds,
          }),
        };
      }),
    );

    const normal = enrichedCandidates.reduce((fastest, c) =>
      c.durationSeconds < fastest.durationSeconds ? c : fastest,
    );
    const scenic = pickScenic(enrichedCandidates);

    res.json({
      start: startGeo,
      end: endGeo,
      normal: toRouteResponse(normal),
      scenic: toRouteResponse(scenic),
      extraTimeSeconds: scenic.durationSeconds - normal.durationSeconds,
    });
  } catch (err) {
    if (err instanceof GoogleMapsError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
