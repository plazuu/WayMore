import { Router, type Response } from "express";
import { PHOTO_CACHE_MAX_ENTRIES, PHOTO_CACHE_TTL_MS, PHOTO_FETCH_TIMEOUT_MS } from "../config";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Matches Places (New) photo resource names, e.g. "places/ChIJ.../photos/AeJ..."
const PHOTO_NAME_PATTERN = /^places\/[\w-]+\/photos\/[\w-]+$/;

// Resolved CDN URLs by `${name}|${width}`. Google's photoUri is a signed
// googleusercontent link that carries no API key, so it is safe to hand to the
// client and to reuse until it expires. Insertion-ordered, so the oldest entry
// is the first key when the cache is full.
const resolved = new Map<string, { uri: string; expiresAt: number }>();

function cachedUri(key: string): string | undefined {
  const hit = resolved.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    resolved.delete(key);
    return undefined;
  }
  return hit.uri;
}

function rememberUri(key: string, uri: string): void {
  if (resolved.size >= PHOTO_CACHE_MAX_ENTRIES) {
    const oldest = resolved.keys().next();
    if (!oldest.done) resolved.delete(oldest.value);
  }
  resolved.set(key, { uri, expiresAt: Date.now() + PHOTO_CACHE_TTL_MS });
}

export const photoRouter = Router();

/**
 * Resolves a Places photo to its CDN URL and redirects there, so the API key
 * never reaches the mobile client (it is required as a query param on Google's
 * media endpoint) but the image bytes never travel through us either: the phone
 * downloads them straight from Google's CDN, in parallel, and caches them.
 */
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
  const key = `${name}|${clampedWidth}`;

  const hit = cachedUri(key);
  if (hit) {
    sendRedirect(res, hit);
    return;
  }

  const url = new URL(`https://places.googleapis.com/v1/${name}/media`);
  url.searchParams.set("maxWidthPx", String(clampedWidth));
  // Returns {name, photoUri} instead of a 302 to the image, so we can cache the
  // CDN URL and skip this lookup for every later request for the same photo.
  url.searchParams.set("skipHttpRedirect", "true");
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  let photoUri: string | undefined;
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS) });
    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 502).json({ error: "Failed to fetch photo" });
      return;
    }
    photoUri = ((await upstream.json()) as { photoUri?: string }).photoUri;
  } catch {
    res.status(502).json({ error: "Failed to fetch photo" });
    return;
  }

  if (!photoUri) {
    res.status(502).json({ error: "Failed to fetch photo" });
    return;
  }

  rememberUri(key, photoUri);
  sendRedirect(res, photoUri);
});

function sendRedirect(res: Response, uri: string): void {
  // Temporary: the signed CDN URL expires, so clients must come back for a new one.
  res.set("Cache-Control", `public, max-age=${Math.floor(PHOTO_CACHE_TTL_MS / 1000)}`);
  res.redirect(302, uri);
}
