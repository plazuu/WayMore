import { Router } from "express";
import { getNarration, pregenerate } from "../narration/cache";
import { getIntroNarration } from "../narration/intro";
import type { Place } from "../types";
import { validatePlace } from "./tour";

// Pregenerated narration: the app's current tour mode asks for every place's
// line and audio up front and triggers playback itself. The live guide
// (/tour/*) is the server-driven alternative. Errors keep this API's original
// { error: "<message>" } shape, which the app reads.

const MAX_PLACES = 100;

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

// The trip's opening greeting ("I'm your scenic copilot..."), played before the
// first place. Same shape as a place's narration, with placeId "intro".
narrationRouter.get("/narration/intro", async (_req, res) => {
  res.json(await getIntroNarration());
});
