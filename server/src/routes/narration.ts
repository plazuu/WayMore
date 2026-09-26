import express, { Router } from "express";
import { audioCacheDir } from "../config";
import { AUDIO_ROUTE, getNarration, pregenerate } from "../narration/cache";
import type { Place } from "../types";

const MAX_PLACES = 100;

/** Returns an error message, or null if `value` is a valid Place. */
export function validatePlace(value: unknown): string | null {
  if (!value || typeof value !== "object") return "place must be an object";
  const p = value as Record<string, unknown>;
  if (typeof p.id !== "string" || !p.id) return "id must be a non-empty string";
  if (typeof p.name !== "string" || !p.name) return "name must be a non-empty string";
  if (p.kind !== "landmark" && p.kind !== "restaurant") return 'kind must be "landmark" or "restaurant"';
  if (typeof p.lat !== "number" || typeof p.lng !== "number") return "lat and lng must be numbers";
  if (p.side !== undefined && !["left", "right", "ahead"].includes(p.side as string)) {
    return 'side must be "left", "right", or "ahead"';
  }
  for (const field of ["tagline", "category", "description"]) {
    if (p[field] !== undefined && typeof p[field] !== "string") return `${field} must be a string`;
  }
  if (p.facts !== undefined && !(Array.isArray(p.facts) && p.facts.every((f) => typeof f === "string"))) {
    return "facts must be an array of strings";
  }
  return null;
}

export const narrationRouter = Router();

narrationRouter.post("/narration/pregenerate", async (req, res) => {
  const places = req.body?.places;
  if (!Array.isArray(places) || places.length === 0) {
    res.status(400).json({ error: "body must be { places: Place[] } with at least one place" });
    return;
  }
  if (places.length > MAX_PLACES) {
    res.status(400).json({ error: `at most ${MAX_PLACES} places per request` });
    return;
  }
  for (const [i, place] of places.entries()) {
    const error = validatePlace(place);
    if (error) {
      res.status(400).json({ error: `places[${i}]: ${error}` });
      return;
    }
  }
  res.json(await pregenerate(places as Place[]));
});

narrationRouter.post("/narration", async (req, res) => {
  const error = validatePlace(req.body);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  res.json(await getNarration(req.body as Place));
});

// Serve cached MP3s only (the .json files next to them are internal).
export const audioRouter = Router();
audioRouter.use(AUDIO_ROUTE, (req, res, next) => {
  if (!req.path.endsWith(".mp3")) {
    res.status(404).end();
    return;
  }
  express.static(audioCacheDir(), { fallthrough: false, maxAge: "1d" })(req, res, next);
});
