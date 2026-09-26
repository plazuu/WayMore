import { Router } from "express";
import { geocodeAddress, computeRoutes, GoogleMapsError, type RouteCandidate } from "../lib/googleMaps";
import { decodePolyline, sampleAlongPath, haversineMeters } from "../lib/polyline";
import { searchNearby, dedupeById, LANDMARK_TYPES, FOOD_TYPES, type Poi } from "../lib/places";
import { scoreCandidate } from "../lib/scoring";
import { filterLandmarks, filterFoodStops } from "./filter";
import { curatedOnRoute } from "../lib/curated";
import { findScenicDetours } from "../lib/detours";
import {
  DEFAULT_SAMPLE_INTERVAL_METERS,
  MIN_SAMPLE_INTERVAL_METERS,
  MAX_SAMPLE_INTERVAL_METERS,
  DEFAULT_SEARCH_RADIUS_METERS,
  MIN_SEARCH_RADIUS_METERS,
  MAX_SEARCH_RADIUS_METERS,
  MAX_LANDMARKS_PER_ROUTE,
  MAX_EXTRA_MINUTES_LIMIT,
  MAX_EXTRA_SECONDS_FOR_SCENIC,
  MAX_EXTRA_FRACTION_FOR_SCENIC,
} from "../config";

export const routeRouter = Router();

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
  const maxExtraMinutes =
    typeof req.query.maxExtraMinutes === "string"
      ? parseNumberParam(req.query.maxExtraMinutes, 0, 0, MAX_EXTRA_MINUTES_LIMIT)
      : undefined;

  try {
    const [startGeo, endGeo] = await Promise.all([geocodeAddress(start), geocodeAddress(end)]);
    const baseCandidates = await computeRoutes(startGeo, endGeo);
    const candidates: Array<RouteCandidate & { viaIds?: string[] }> = [...baseCandidates];

    const fastestBase = baseCandidates.reduce((a, c) => (c.durationSeconds < a.durationSeconds ? c : a));
    // An explicit maxExtraMinutes (query param) wins; otherwise the default is
    // the smaller of a fixed cap and a fraction of the fastest trip.
    const allowedExtra =
      maxExtraMinutes !== undefined
        ? maxExtraMinutes * 60
        : Math.min(MAX_EXTRA_SECONDS_FOR_SCENIC, fastestBase.durationSeconds * MAX_EXTRA_FRACTION_FOR_SCENIC);

    // Cross-reference the hand-picked landmark list against the fastest route and
    // search for a detour through great ones it misses (see lib/detours.ts).
    candidates.push(...(await findScenicDetours(startGeo, endGeo, fastestBase, allowedExtra)));

    const enrichedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const points = decodePolyline(candidate.encodedPolyline);
        const samplePoints = sampleAlongPath(points, sampleIntervalMeters);

        const [landmarkResults, foodResults] = await Promise.all([
          Promise.all(samplePoints.map((pt) => searchNearby(pt, searchRadiusMeters, LANDMARK_TYPES))),
          Promise.all(samplePoints.map((pt) => searchNearby(pt, searchRadiusMeters, FOOD_TYPES))),
        ]);

        const curatedStops = curatedOnRoute(points, candidate.viaIds);
        // Drop Places results that duplicate a curated stop (within ~250 m).
        const placesLandmarks = filterLandmarks(dedupeById(landmarkResults.flat()), points).filter(
          (poi) => !curatedStops.some((c) => haversineMeters(c, poi) < 250),
        );
        const landmarks = [...curatedStops, ...placesLandmarks].slice(0, MAX_LANDMARKS_PER_ROUTE);
        const foodStops = filterFoodStops(dedupeById(foodResults.flat()));

        return {
          ...candidate,
          samplePointCount: samplePoints.length,
          landmarks,
          foodStops,
          score: scoreCandidate(landmarks),
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
    });
  } catch (err) {
    if (err instanceof GoogleMapsError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
