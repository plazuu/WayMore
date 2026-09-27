import { Router } from "express";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Matches Places (New) photo resource names, e.g. "places/ChIJ.../photos/AeJ..."
const PHOTO_NAME_PATTERN = /^places\/[\w-]+\/photos\/[\w-]+$/;

export const photoRouter = Router();

// Proxies Places Photo Media so the API key never reaches the mobile client
// (the key is required as a query param on Google's media endpoint).
photoRouter.get("/photo", async (req, res) => {
  const { name, maxWidthPx } = req.query;

  if (typeof name !== "string" || !PHOTO_NAME_PATTERN.test(name)) {
    res.status(400).json({ error: "Query param 'name' must be a valid Places photo resource name" });
    return;
  }
  if (!GOOGLE_MAPS_API_KEY) {
    res.status(500).json({ error: "GOOGLE_MAPS_API_KEY is not configured" });
    return;
  }

  const width = typeof maxWidthPx === "string" && Number.isFinite(Number(maxWidthPx)) ? Number(maxWidthPx) : 800;
  const clampedWidth = Math.min(1600, Math.max(100, width));

  const url = new URL(`https://places.googleapis.com/v1/${name}/media`);
  url.searchParams.set("maxWidthPx", String(clampedWidth));
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const upstream = await fetch(url);
  if (!upstream.ok) {
    res.status(upstream.status === 404 ? 404 : 502).json({ error: "Failed to fetch photo" });
    return;
  }

  res.set("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(Buffer.from(await upstream.arrayBuffer()));
});
