import { Router } from "express";
import { geocodeAddress, GoogleMapsError } from "../lib/googleMaps";

export const geocodeRouter = Router();

geocodeRouter.post("/geocode", async (req, res) => {
  const { address } = req.body ?? {};

  if (typeof address !== "string" || address.trim().length === 0) {
    res.status(400).json({ error: "Request body must include a non-empty 'address' string" });
    return;
  }

  try {
    const result = await geocodeAddress(address);
    res.json(result);
  } catch (err) {
    if (err instanceof GoogleMapsError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
