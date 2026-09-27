import { Router } from "express";
import { autocompletePlaces, GoogleMapsError } from "../lib/googleMaps";

export const autocompleteRouter = Router();

/** Optional `lat`/`lng` query params; ignored unless both are valid coordinates. */
function parseBias(lat: unknown, lng: unknown) {
  if (typeof lat !== "string" || typeof lng !== "string" || !lat.trim() || !lng.trim()) return undefined;
  const bias = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(bias.lat) || !Number.isFinite(bias.lng)) return undefined;
  if (Math.abs(bias.lat) > 90 || Math.abs(bias.lng) > 180) return undefined;
  return bias;
}

autocompleteRouter.get("/autocomplete", async (req, res) => {
  const { input, sessionToken, lat, lng } = req.query;

  if (typeof input !== "string" || input.trim().length === 0) {
    res.status(400).json({ error: "Query param 'input' must be a non-empty string" });
    return;
  }

  try {
    const suggestions = await autocompletePlaces(
      input,
      typeof sessionToken === "string" ? sessionToken : undefined,
      parseBias(lat, lng),
    );
    res.json({ suggestions });
  } catch (err) {
    if (err instanceof GoogleMapsError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
