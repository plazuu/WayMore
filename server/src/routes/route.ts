import { Router } from "express";
import { geocodeAddress, computeRoutes, GoogleMapsError, type RouteCandidate } from "../lib/googleMaps";
import { decodePolyline, sampleAlongPath } from "../lib/polyline";
import { searchNearby, dedupeById, LANDMARK_TYPES, FOOD_TYPES, type Poi } from "../lib/places";
import { scoreCandidate } from "../lib/scoring";
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

  try {
    const [startGeo, endGeo] = await Promise.all([geocodeAddress(start), geocodeAddress(end)]);
    const candidates = await computeRoutes(startGeo, endGeo);

    const enrichedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const points = decodePolyline(candidate.encodedPolyline);
        const samplePoints = sampleAlongPath(points, sampleIntervalMeters);

        const [landmarkResults, foodResults] = await Promise.all([
          Promise.all(samplePoints.map((pt) => searchNearby(pt, searchRadiusMeters, LANDMARK_TYPES))),
          Promise.all(samplePoints.map((pt) => searchNearby(pt, searchRadiusMeters, FOOD_TYPES))),
        ]);

        const landmarks = dedupeById(landmarkResults.flat());
        const foodStops = dedupeById(foodResults.flat()).filter((poi) => (poi.rating ?? 0) >= 4.0);

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
    const scenic = enrichedCandidates.reduce((best, c) => {
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
