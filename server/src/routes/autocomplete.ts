import { Router } from "express";
import { autocompletePlaces, GoogleMapsError } from "../lib/googleMaps";

export const autocompleteRouter = Router();

autocompleteRouter.get("/autocomplete", async (req, res) => {
  const { input, sessionToken } = req.query;

  if (typeof input !== "string" || input.trim().length === 0) {
    res.status(400).json({ error: "Query param 'input' must be a non-empty string" });
    return;
  }

  try {
    const suggestions = await autocompletePlaces(
      input,
      typeof sessionToken === "string" ? sessionToken : undefined,
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
