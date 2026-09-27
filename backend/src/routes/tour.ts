import express, { Router, type ErrorRequestHandler, type Response } from "express";
import { audioCacheDir, LIVE_GUIDE } from "../config";
import { answer, type ChatLlm, type RideContext } from "../live/chat";
import type { LiveNarration, SessionStore, TickInput, TourSession } from "../live/session";
import { AUDIO_ROUTE } from "../narration/cache";
import type { Place } from "../types";

const MAX_PLACES = 200;

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
  if (p.rating !== undefined && !(typeof p.rating === "number" && Number.isFinite(p.rating))) {
    return "rating must be a number";
  }
  if (p.facts !== undefined && !(Array.isArray(p.facts) && p.facts.every((f) => typeof f === "string"))) {
    return "facts must be an array of strings";
  }
  return null;
}

function fail(res: Response, status: number, error: string, message: string) {
  res.status(status).json({ error, message });
}

/** Sessions store relative audio paths; PUBLIC_BASE_URL (read per request) makes them absolute. */
export function publicAudioUrl(url: string | null): string | null {
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return url && base ? `${base}${url}` : url;
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const MAX_RECENT = 5;

/** Optional `ride` on /tour/chat: the app's own view of the trip. Returns an error message or the parsed value. */
export function parseRide(value: unknown): { ride?: RideContext; error?: string } {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object") return { error: "ride must be an object" };
  const r = value as Record<string, unknown>;
  const ride: RideContext = {};
  if (r.lat !== undefined || r.lng !== undefined) {
    if (!isNum(r.lat) || !isNum(r.lng) || Math.abs(r.lat) > 90 || Math.abs(r.lng) > 180) {
      return { error: "ride.lat and ride.lng must be valid coordinates" };
    }
    ride.position = { lat: r.lat, lng: r.lng };
    const heading = r.heading ?? null;
    if (heading !== null && !isNum(heading)) return { error: "ride.heading must be a number when present" };
    ride.heading = heading;
  }
  if (r.passedPlaceIds !== undefined) {
    const ids = r.passedPlaceIds;
    if (!Array.isArray(ids) || ids.length > MAX_PLACES || !ids.every((id) => typeof id === "string")) {
      return { error: `ride.passedPlaceIds must be an array of at most ${MAX_PLACES} strings` };
    }
    ride.passedPlaceIds = ids;
  }
  if (r.recent !== undefined) {
    const recent = r.recent;
    const valid =
      Array.isArray(recent) &&
      recent.every(
        (n) => n && typeof n === "object" && typeof n.placeId === "string" && typeof n.text === "string",
      );
    if (!valid) return { error: "ride.recent must be an array of { placeId, text }" };
    ride.recent = (recent as { placeId: string; text: string }[])
      .slice(-MAX_RECENT)
      .map(({ placeId, text }) => ({ placeId, text: text.slice(0, 600) }));
  }
  return { ride };
}

export interface TourRouterOptions {
  store: SessionStore;
  chatLlm?: ChatLlm;
  chatTimeoutMs?: number;
}

export function createTourRouter({ store, chatLlm, chatTimeoutMs }: TourRouterOptions): Router {
  const router = Router();

  function session(res: Response, id: unknown): TourSession | undefined {
    if (typeof id !== "string" || !id) {
      fail(res, 400, "bad_request", "sessionId must be a non-empty string");
      return undefined;
    }
    const s = store.get(id);
    if (!s) fail(res, 404, "unknown_session", "Unknown or expired session; call /tour/start again with the same places");
    return s;
  }

  router.post("/tour/start", (req, res) => {
    const places = req.body?.places;
    if (!Array.isArray(places)) {
      fail(res, 400, "bad_request", "body must be { places: Place[] }");
      return;
    }
    if (places.length > MAX_PLACES) {
      fail(res, 400, "bad_request", `at most ${MAX_PLACES} places per session`);
      return;
    }
    for (const [i, place] of places.entries()) {
      const error = validatePlace(place);
      if (error) {
        fail(res, 400, "bad_request", `places[${i}]: ${error}`);
        return;
      }
    }
    const s = store.create(places as Place[]);
    console.log(`[live] session ${s.id} started with ${places.length} places`);
    res.json({ sessionId: s.id });
  });

  router.post("/tour/end", (req, res) => {
    const s = session(res, req.body?.sessionId);
    if (!s) return;
    store.end(s.id);
    res.json({ ok: true });
  });

  router.post("/tour/tick", (req, res) => {
    const body = req.body ?? {};
    const { lat, lng } = body;
    if (!isNum(lat) || !isNum(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      fail(res, 400, "bad_request", "lat and lng must be valid coordinates");
      return;
    }
    // expo-location reports unknown values as null or -1; null is treated as absent.
    const heading = body.heading ?? undefined;
    const speedMps = body.speedMps ?? undefined;
    if ((heading !== undefined && !isNum(heading)) || (speedMps !== undefined && !isNum(speedMps))) {
      fail(res, 400, "bad_request", "heading and speedMps must be numbers when present");
      return;
    }
    const s = session(res, body.sessionId);
    if (!s) return;
    const input: TickInput = { lat, lng, heading, speedMps };
    const { narration, pending } = store.tick(s, input);
    const out: LiveNarration | null = narration && { ...narration, audioUrl: publicAudioUrl(narration.audioUrl) };
    res.json({ narration: out, pending });
  });

  router.post("/tour/chat", async (req, res) => {
    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim()) {
      fail(res, 400, "bad_request", "message must be a non-empty string");
      return;
    }
    if (message.length > LIVE_GUIDE.chatMaxMessageChars) {
      fail(res, 400, "message_too_long", `message must be at most ${LIVE_GUIDE.chatMaxMessageChars} characters`);
      return;
    }
    const { ride, error } = parseRide(req.body?.ride);
    if (error) {
      fail(res, 400, "bad_request", error);
      return;
    }
    const s = session(res, req.body?.sessionId);
    if (!s) return;
    res.json(await answer(s, message.trim(), { llm: chatLlm, timeoutMs: chatTimeoutMs, now: store.now, ride }));
  });

  return router;
}

/** Malformed JSON bodies on /tour get the same { error, message } shape. */
export const tourErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    fail(res, 400, "bad_request", (err as Error).message);
    return;
  }
  console.error("[live] unexpected error:", err);
  fail(res, 500, "internal", "Unexpected server error");
};

// Serve cached MP3s only (the .json files next to them are internal).
export const audioRouter = Router();
audioRouter.use(AUDIO_ROUTE, (req, res, next) => {
  if (!req.path.endsWith(".mp3")) {
    res.status(404).end();
    return;
  }
  express.static(audioCacheDir(), { fallthrough: false, maxAge: "1d" })(req, res, next);
});
