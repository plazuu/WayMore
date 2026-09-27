import { randomUUID } from "node:crypto";
import { LIVE_GUIDE } from "../config";
import { getNarration } from "../narration/cache";
import { durationHint, templateLine } from "../narration/scriptWriter";
import type { Narration, Place } from "../types";
import { bearingDeg, distanceMeters, relativeAngle, sideOf, type LatLng } from "./geo";
import { importanceScore } from "./importance";

export type Side = "left" | "right" | "ahead";

export interface LiveNarration {
  placeId: string;
  name: string;
  side: Side;
  text: string;
  /** Relative ("/audio/<key>.mp3") inside the session; the route makes it absolute when configured. */
  audioUrl: string | null;
  durationHintS: number;
}

export interface TickInput {
  lat: number;
  lng: number;
  heading?: number;
  speedMps?: number;
}

export interface TickResult {
  narration: LiveNarration | null;
  pending: string | null;
}

export interface NarratedEntry {
  placeId: string;
  name: string;
  side: Side;
  text: string;
  at: number;
}

export interface ChatTurn {
  user: string;
  reply: string;
  at: number;
}

export interface GenerationStat {
  placeId: string;
  name: string;
  side: Side;
  /** Wall-clock generation time (LLM + TTS, or a cache hit). */
  ms: number;
  audio: boolean;
}

/** Writes the line and voices it. Must never reject for expected failures (the default doesn't). */
export type Narrate = (place: Place) => Promise<Narration>;

type Status = "idle" | "queued" | "generating" | "ready" | "delivered" | "dropped";

interface PlaceTrack {
  status: Status;
  /** Distance at the last tick, null before the first tick. */
  distance: number | null;
  /** Consecutive ticks the distance grew. */
  growTicks: number;
  /** Bearing outside ±inFrontHalfAngleDeg of a known heading at the last tick. */
  behind: boolean;
}

// GPS jitter below this doesn't count as "distance grew".
const DISTANCE_NOISE_M = 2;

export class TourSession {
  readonly id = randomUUID();
  readonly places: Place[];
  lastSeen: number;
  /** Latest position/heading from tick, used by chat for context. */
  position: LatLng | null = null;
  heading: number | null = null;
  /** Last position at least minMoveForHeadingM away from the one before; used to derive a heading. */
  anchor: LatLng | null = null;
  readonly tracks = new Map<string, PlaceTrack>();
  readonly queue: { placeId: string; side: Side }[] = [];
  generating: string | null = null;
  readonly ready: { narration: LiveNarration; readyAt: number }[] = [];
  readonly narrated: NarratedEntry[] = [];
  readonly chat: ChatTurn[] = [];
  readonly stats: GenerationStat[] = [];
  worker: Promise<void> | null = null;
  /** The opening greeting, once voiced; delivered on the first tick before any place. */
  intro: LiveNarration | null = null;
  introWork: Promise<void> | null = null;
  ended = false;

  constructor(places: Place[], now: number) {
    // side is computed live from the car's heading, so drop any preset one.
    this.places = places.map(({ side: _side, ...place }) => place);
    this.lastSeen = now;
    for (const p of this.places) {
      this.tracks.set(p.id, { status: "idle", distance: null, growTicks: 0, behind: false });
    }
  }

  place(id: string): Place | undefined {
    return this.places.find((p) => p.id === id);
  }

  track(id: string): PlaceTrack {
    return this.tracks.get(id)!;
  }
}

export interface SessionStoreOptions {
  now?: () => number;
  narrate?: Narrate;
  /** The trip's opening greeting. Without it (tests), sessions start straight with places. */
  intro?: () => Promise<Narration>;
}

export class SessionStore {
  readonly now: () => number;
  private readonly narrate: Narrate;
  private readonly intro?: () => Promise<Narration>;
  private readonly sessions = new Map<string, TourSession>();

  constructor({ now = Date.now, narrate = getNarration, intro }: SessionStoreOptions = {}) {
    this.now = now;
    this.narrate = narrate;
    this.intro = intro;
  }

  create(places: Place[]): TourSession {
    this.sweep();
    const session = new TourSession(places, this.now());
    this.sessions.set(session.id, session);
    // Voice the greeting in the background (a cache hit after the first trip).
    // A session with no places (the app's chat) never ticks, so it gets none.
    if (this.intro && places.length) {
      session.introWork = this.intro()
        .then(({ placeId, text, audioUrl, durationHintS }) => {
          if (!session.ended) session.intro = { placeId, name: "Your scenic copilot", side: "ahead", text, audioUrl, durationHintS };
        })
        .catch((err) => console.warn("[live] intro failed:", (err as Error).message))
        .finally(() => {
          session.introWork = null;
        });
    }
    return session;
  }

  /** Returns the live session and refreshes its TTL, or undefined if unknown/expired. */
  get(id: string): TourSession | undefined {
    this.sweep();
    const session = this.sessions.get(id);
    if (session) session.lastSeen = this.now();
    return session;
  }

  end(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.ended = true;
    this.sessions.delete(id);
    return true;
  }

  /** Resolves once the session's background generation queue is empty (tests and the replay script). */
  async idle(session: TourSession): Promise<void> {
    while (session.worker || session.introWork) await (session.worker ?? session.introWork);
  }

  /** Waits for every live session's background generation to finish. */
  async idleAll(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => this.idle(s)));
  }

  private sweep() {
    const cutoff = this.now() - LIVE_GUIDE.sessionTtlMs;
    for (const [id, s] of this.sessions) {
      if (s.lastSeen < cutoff) this.end(id);
    }
  }

  tick(s: TourSession, input: TickInput): TickResult {
    const cfg = LIVE_GUIDE;
    const now = this.now();
    const pos = { lat: input.lat, lng: input.lng };

    const heading = resolveHeading(s, input);
    s.position = pos;
    s.heading = heading;

    // Refresh distance/bearing state for every place.
    const rel = new Map<string, number | null>();
    for (const p of s.places) {
      const t = s.track(p.id);
      const d = distanceMeters(pos, p);
      const r = heading === null ? null : relativeAngle(heading, bearingDeg(pos, p));
      rel.set(p.id, r);
      t.growTicks = t.distance !== null && d > t.distance + DISTANCE_NOISE_M ? t.growTicks + 1 : 0;
      t.distance = d;
      t.behind = r !== null && Math.abs(r) > cfg.inFrontHalfAngleDeg;
    }

    // The greeting goes first, and only while nothing has been narrated yet:
    // once the tour has started talking about places, it's too late for hello.
    let narration: LiveNarration | null = null;
    if (s.intro) {
      if (s.narrated.length === 0) narration = s.intro;
      s.intro = null;
    }

    // Deliver at most one ready narration, dropping any that went stale.
    while (!narration && s.ready.length) {
      const item = s.ready.shift()!;
      const t = s.track(item.narration.placeId);
      const tooOld = now - item.readyAt > cfg.readyMaxAgeS * 1000;
      if (tooOld || isStale(t)) {
        t.status = "dropped";
        console.log(`[live] dropped stale narration for ${item.narration.name}${tooOld ? " (too old)" : ""}`);
        continue;
      }
      t.status = "delivered";
      narration = item.narration;
      s.narrated.push({ ...pick(narration), at: now });
    }

    // Of the places that qualify, trigger the most important one (see importance.ts):
    // a heritage sight beats a chain whatever their ratings; within a tier, the
    // nearer and better-rated one wins. Chains still narrate when nothing else qualifies.
    const speed = input.speedMps !== undefined && input.speedMps >= 0 ? input.speedMps : 0;
    let best: Place | null = null;
    let bestScore = -Infinity;
    for (const p of s.places) {
      const t = s.track(p.id);
      if (t.status !== "idle" || t.behind) continue;
      const d = t.distance!;
      const eta = d / Math.max(speed, cfg.etaMinSpeedMps);
      if (eta > cfg.triggerEtaS && d > cfg.triggerDistanceM) continue;
      const score = importanceScore(p, d);
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    if (best) {
      const r = rel.get(best.id) ?? null;
      const side: Side = r === null ? "ahead" : sideOf(r, cfg.aheadHalfAngleDeg);
      s.track(best.id).status = "queued";
      s.queue.push({ placeId: best.id, side });
      this.pump(s);
    }

    return { narration, pending: s.generating ?? s.queue[0]?.placeId ?? null };
  }

  /** Starts the background worker if it isn't running. One generation at a time per session. */
  private pump(s: TourSession) {
    if (s.worker) return;
    s.worker = this.work(s).finally(() => {
      s.worker = null;
    });
  }

  private async work(s: TourSession): Promise<void> {
    while (s.queue.length && !s.ended) {
      const { placeId, side } = s.queue.shift()!;
      const t = s.track(placeId);
      if (isStale(t)) {
        t.status = "dropped";
        console.log(`[live] skipped queued ${s.place(placeId)?.name}: car already passed it`);
        continue;
      }
      const place = { ...s.place(placeId)!, side };
      t.status = "generating";
      s.generating = placeId;
      const started = performance.now();
      let n: Narration;
      try {
        n = await this.narrate(place);
      } catch (err) {
        console.warn(`[live] narration failed for ${place.id}:`, (err as Error).message);
        const text = templateLine(place);
        n = { placeId, text, audioUrl: null, durationHintS: durationHint(text) };
      }
      const ms = Math.round(performance.now() - started);
      s.generating = null;
      if (s.ended) return;
      s.stats.push({ placeId, name: place.name, side, ms, audio: n.audioUrl !== null });
      console.log(`[live] ${place.name} (${side}) ready in ${ms} ms${n.audioUrl ? "" : ", no audio"}`);
      t.status = "ready";
      s.ready.push({
        narration: {
          placeId,
          name: place.name,
          side,
          text: n.text,
          audioUrl: n.audioUrl,
          durationHintS: n.durationHintS,
        },
        readyAt: this.now(),
      });
    }
  }
}

function isStale(t: PlaceTrack): boolean {
  return t.behind || t.growTicks >= LIVE_GUIDE.distanceGrowTicks;
}

function pick({ placeId, name, side, text }: LiveNarration) {
  return { placeId, name, side, text };
}

/**
 * Device heading when trustworthy (>= 0 and moving at least minHeadingSpeedMps),
 * else the bearing of the movement since the anchor position once the car has
 * moved minMoveForHeadingM, else null (unknown).
 */
function resolveHeading(s: TourSession, input: TickInput): number | null {
  const cfg = LIVE_GUIDE;
  const pos = { lat: input.lat, lng: input.lng };
  let derived: number | null = null;
  if (!s.anchor) {
    s.anchor = pos;
  } else if (distanceMeters(s.anchor, pos) >= cfg.minMoveForHeadingM) {
    derived = bearingDeg(s.anchor, pos);
    s.anchor = pos;
  }
  const slow = input.speedMps !== undefined && input.speedMps < cfg.minHeadingSpeedMps;
  if (input.heading !== undefined && input.heading >= 0 && !slow) return input.heading % 360;
  return derived;
}
