import { Router } from "express";
import {
  PLACES_SEARCH_DEFAULT_LIMIT,
  PLACES_SEARCH_DEFAULT_RADIUS_METERS,
  PLACES_SEARCH_MAX_LIMIT,
  PLACES_SEARCH_MAX_RADIUS_METERS,
} from "../config";
import { GoogleMapsError } from "../lib/googleMaps";
import { findPlaces } from "../lib/placeSearch";

export const placesRouter = Router();

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Good places near a point, nearest first, for backend/'s "Where to?" guide.
// Google's key stays here; the backend calls this with SERVER_URL.
placesRouter.post("/places/nearby", async (req, res) => {
  const { lat, lng, types, query, radiusMeters, limit, minRating, minReviews, requireOpen, sortBy } = req.body ?? {};

  if (!isNum(lat) || !isNum(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    res.status(400).json({ error: "Request body must include valid 'lat' and 'lng' numbers" });
    return;
  }
  const typeList = Array.isArray(types) ? types.filter((t): t is string => typeof t === "string" && t.length > 0) : [];
  const text = typeof query === "string" ? query.trim().slice(0, 200) : "";
  if (typeList.length === 0 && !text) {
    res.status(400).json({ error: "Request body must include 'types' (Google place types) or a 'query' string" });
    return;
  }

  try {
    const places = await findPlaces({
      center: { lat, lng },
      types: typeList,
      query: text || undefined,
      radiusMeters: clamp(isNum(radiusMeters) ? radiusMeters : PLACES_SEARCH_DEFAULT_RADIUS_METERS, 100, PLACES_SEARCH_MAX_RADIUS_METERS),
      limit: clamp(isNum(limit) ? Math.round(limit) : PLACES_SEARCH_DEFAULT_LIMIT, 1, PLACES_SEARCH_MAX_LIMIT),
      minRating: isNum(minRating) ? minRating : undefined,
      minReviews: isNum(minReviews) ? minReviews : undefined,
      requireOpen: requireOpen === true,
      sortBy: sortBy === "rating" ? "rating" : "distance",
    });
    res.json({ places });
  } catch (err) {
    if (err instanceof GoogleMapsError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
