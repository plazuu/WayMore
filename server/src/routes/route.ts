import { Router } from "express";
import { geocodeAddress, computeRoutes, GoogleMapsError, type RouteCandidate } from "../lib/googleMaps";
import { decodePolyline, sampleAlongPath, haversineMeters, lastStretch } from "../lib/polyline";
import { searchNearby, dedupeById, landmarkTypesFor, FOOD_TYPES, type Poi } from "../lib/places";
import { landmarkValue, scoreCandidate } from "../lib/scoring";
import { filterLandmarks, filterFoodStops } from "./filter";
import { curatedOnRoute } from "../lib/curated";
import { findScenicDetours } from "../lib/detours";
import { scenicBudgetSeconds } from "../lib/budget";
import {
  DEFAULT_SAMPLE_INTERVAL_METERS,
  MIN_SAMPLE_INTERVAL_METERS,
  MAX_SAMPLE_INTERVAL_METERS,
  DEFAULT_SEARCH_RADIUS_METERS,
  MIN_SEARCH_RADIUS_METERS,
  MAX_SEARCH_RADIUS_METERS,
  MAX_LANDMARKS_PER_ROUTE,
  DEFAULT_SCENIC_PREFERENCE,
  SCENIC_PREFERENCES,
  type ScenicPreference,
  LAST_MILE_RADIUS_METERS,
  FOOD_APPROACH_SAMPLE_METERS,
  FOOD_APPROACH_SEARCH_RADIUS_METERS,
  MAX_EXTRA_MINUTES_LIMIT,
} from "../config";

export const routeRouter = Router();

function parsePreference(value: unknown): ScenicPreference {
  return typeof value === "string" && (SCENIC_PREFERENCES as string[]).includes(value)
    ? (value as ScenicPreference)
    : DEFAULT_SCENIC_PREFERENCE;
}

function parseNumberParam(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "string") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

interface ScoredCandidate extends RouteCandidate {
  viaIds?: string[];
  samplePointCount: number;
  landmarks: Poi[];
  foodStops: Poi[];
  score: number;
}

function toRouteResponse(candidate: ScoredCandidate) {
  return {
    distanceMeters: candidate.distanceMeters,
    durationSeconds: candidate.durationSeconds,
    polyline: candidate.encodedPolyline,
    samplePointCount: candidate.samplePointCount,
    score: candidate.score,
    landmarks: candidate.landmarks,
    foodStops: candidate.foodStops,
  };
}

// WIP: enrichment (photos + descriptions) and web-search enrichment still
// land in later commits. Response always returns both the fastest ("normal")
// and highest-scoring ("scenic") candidate plus the time difference between
// them, so the mobile app's normal/scenic toggle needs only one call.
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

  // How much longer the user will accept for a more scenic drive, in minutes.
  const preference = parsePreference(req.query.preference);
  const maxExtraMinutes =
    typeof req.query.maxExtraMinutes === "string"
      ? parseNumberParam(req.query.maxExtraMinutes, 0, 0, MAX_EXTRA_MINUTES_LIMIT)
      : undefined;

  try {
    const [startGeo, endGeo] = await Promise.all([geocodeAddress(start), geocodeAddress(end)]);
    const baseCandidates = await computeRoutes(startGeo, endGeo);
    const candidates: Array<RouteCandidate & { viaIds?: string[] }> = [...baseCandidates];

    const fastestBase = baseCandidates.reduce((a, c) => (c.durationSeconds < a.durationSeconds ? c : a));
    const allowedExtra = scenicBudgetSeconds(fastestBase.durationSeconds, maxExtraMinutes);

    // Cross-reference the hand-picked landmark list against the fastest route and
    // search for a detour through great ones it misses (see lib/detours.ts).
    candidates.push(...(await findScenicDetours(startGeo, endGeo, fastestBase, allowedExtra, preference)));

    // Restaurants only matter for the last mile. One search around the
    // destination is shared by every candidate (they all end there); each route
    // adds a few small searches along its own final approach, then ranks by what
    // is visible from it.
    const lastMileFood = dedupeById(await searchNearby(endGeo, LAST_MILE_RADIUS_METERS, FOOD_TYPES, 20));

    const enrichedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const points = decodePolyline(candidate.encodedPolyline);
        const samplePoints = sampleAlongPath(points, sampleIntervalMeters);

        const landmarkResults = await Promise.all(
          samplePoints.map((pt) => searchNearby(pt, searchRadiusMeters, landmarkTypesFor(preference))),
        );

        const approach = lastStretch(points, LAST_MILE_RADIUS_METERS);
        const approachFood = await Promise.all(
          sampleAlongPath(approach, FOOD_APPROACH_SAMPLE_METERS).map((pt) =>
            searchNearby(pt, FOOD_APPROACH_SEARCH_RADIUS_METERS, FOOD_TYPES),
          ),
        );
        const foodPool = dedupeById([...lastMileFood, ...approachFood.flat()]);

        const curatedStops = curatedOnRoute(points, candidate.viaIds);
        // Drop Places results that duplicate a curated stop (within ~250 m).
        const placesLandmarks = filterLandmarks(dedupeById(landmarkResults.flat()), points, preference).filter(
          (poi) => !curatedStops.some((c) => haversineMeters(c, poi) < 250),
        );
        const landmarks = [...curatedStops, ...placesLandmarks]
          .sort((a, b) => landmarkValue(b, preference) - landmarkValue(a, preference))
          .slice(0, MAX_LANDMARKS_PER_ROUTE);
        // A place can match both type lists (e.g. a landmark market); it stays a
        // landmark only, since the app keys pins and narration by place id.
        const landmarkIds = new Set(landmarks.map((poi) => poi.id));

        return {
          ...candidate,
          samplePointCount: samplePoints.length,
          landmarks,
          foodStops: filterFoodStops(foodPool, approach, endGeo).filter((poi) => !landmarkIds.has(poi.id)),
          score: scoreCandidate(landmarks, preference),
        };
      }),
    );

    const normal = enrichedCandidates.reduce((fastest, c) =>
      c.durationSeconds < fastest.durationSeconds ? c : fastest,
    );
    // Only routes within the time budget can be "scenic"; otherwise scenic = normal.
    const withinBudget = enrichedCandidates.filter(
      (c) => c.durationSeconds - normal.durationSeconds <= allowedExtra,
    );
    const scenic = withinBudget.reduce((best, c) => {
      if (c.score > best.score) return c;
      if (c.score === best.score && c.durationSeconds < best.durationSeconds) return c;
      return best;
    });

    res.json({
      start: startGeo,
      end: endGeo,
      normal: toRouteResponse(normal),
      scenic: toRouteResponse(scenic),
      extraTimeSeconds: scenic.durationSeconds - normal.durationSeconds,
      preference,
    });
  } catch (err) {
    if (err instanceof GoogleMapsError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
