import { LIVE_GUIDE } from "../config";
import { cleanScript, normalizeForMatch } from "../narration/scriptWriter";
import { chat as llmChat, isLlmAvailable, isSearchUnavailable, type ChatMessage, type Source } from "../services/openai";
import { bearingDeg, distanceMeters, relativeAngle, type LatLng } from "./geo";
import type { Place } from "../types";
import type { TourSession } from "./session";

export type ChatLlm = typeof llmChat;

export interface ChatReply {
  reply: string;
  placeId: string | null;
  sources: Source[];
}

/**
 * Ride state the app sends with a question when it runs the tour itself and
 * never ticks this session (pregenerated narration). Overrides the session's own
 * position and narration history; `passedPlaceIds` makes "passed" authoritative.
 */
export interface RideContext {
  position?: LatLng;
  heading?: number | null;
  /** Places the car has reached. When present, every other place is still ahead. */
  passedPlaceIds?: string[];
  /** What the app narrated most recently, oldest first. */
  recent?: { placeId: string; text: string }[];
}

export const CHAT_FALLBACK = "Sorry, I lost my signal for a sec, can you ask again?";
const MAX_REPLY_WORDS = 90;
const CONTEXT_PLACES = 8;

/**
 * Strips citation markup the model leaves in its text so the reply reads (and
 * speaks) cleanly: [Source](url) -> Source, and [1], [1, 2], [[1]](url) and
 * 【...】 markers are removed. The sources themselves come from annotations.
 */
export function sanitizeChatReply(text: string): string {
  return text
    .replace(/\s*\[\[[^\]]*\]\]\([^)]*\)/g, "") // [[1]](url)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [Source](url) -> Source
    .replace(/\s*\[\d+(?:\s*[,\u2013-]\s*\d+)*\]/g, "") // [1], [1, 2], [1-3]
    .replace(/\s*【[^】]*】/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function chatSystemPrompt(grounding: boolean): string {
  return `You are a young, upbeat local tour guide riding along in the car, showing your friends around the city. You narrate places out loud as the car passes them, and the passenger can also text you questions. You are answering one of those texts now.

Rules:
- Reply in 1 to 4 short sentences of plain text. No markdown, lists, headings, emojis, or links.
- Sound like a friend, not an encyclopedia.
- Use the ride context (where the car is, what you just narrated, the places along the route) to work out what "it", "that" or "there" refers to.
- Only say the car has passed, reached or seen a place, or that you told them about it, if the ride context says so. Places not reached yet are still ahead.
${grounding ? "- Use web search to check facts before stating them.\n" : ""}- If you are not sure of something, say so plainly instead of guessing.
- Never state prices, opening hours, or phone numbers unless a search result you found gives them.
- If the question has nothing to do with the ride, the city, or the places around it, give a short friendly redirect back to the ride.
- Never give driving or navigation instructions; the driver follows their map app.`;
}

function compass(deg: number): string {
  return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][
    Math.round(deg / 45) % 8
  ];
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

/** The ride context block sent with each question. */
export function buildContext(s: TourSession, ride?: RideContext): string {
  const lines: string[] = [];
  const pos = ride?.position ?? s.position;
  const heading = ride?.position ? (ride.heading ?? null) : s.heading;
  if (pos) {
    const dir = heading === null ? "" : `, heading ${compass(heading)}`;
    lines.push(`Car position: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}${dir}`);
  } else {
    lines.push("Car position: unknown (the trip just started)");
  }

  const recent = ride?.recent
    ? ride.recent.map((r) => ({ name: s.place(r.placeId)?.name ?? r.placeId, side: null, text: r.text }))
    : s.narrated;
  lines.push("", "What you narrated most recently (oldest first):");
  if (recent.length) {
    for (const n of recent.slice(-3)) lines.push(`- ${n.name}${n.side ? ` (on the ${n.side})` : ""}: ${n.text}`);
  } else {
    lines.push("- nothing yet");
  }

  if (ride?.passedPlaceIds) {
    placesByProgress(s, new Set(ride.passedPlaceIds), pos, lines);
    return lines.join("\n");
  }

  lines.push("", "Places along this route:");
  const places = pos
    ? [...s.places]
        .map((p) => ({ p, d: distanceMeters(pos, p) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, CONTEXT_PLACES)
    : s.places.slice(0, CONTEXT_PLACES).map((p) => ({ p, d: null }));
  if (!places.length) lines.push("- none listed");
  for (const { p, d } of places) {
    let where = "";
    if (d !== null && pos) {
      const passed =
        heading !== null && Math.abs(relativeAngle(heading, bearingDeg(pos, p))) > LIVE_GUIDE.inFrontHalfAngleDeg;
      where = `, ${formatDistance(d)} away${passed ? ", already passed" : ""}`;
    }
    lines.push(describePlace(p, where));
  }
  return lines.join("\n");
}

function describePlace(p: Place, where: string): string {
  const kind = p.kind === "restaurant" ? "restaurant" : "landmark";
  const detail = [p.category, p.tagline, p.description, ...(p.facts ?? [])].filter(Boolean).join(" ");
  return `- ${p.name} (${kind}${where})${detail ? `: ${detail}` : ""}`;
}

/** Route places split into reached and still ahead, as the app reports them. */
function placesByProgress(s: TourSession, passed: Set<string>, pos: LatLng | null, lines: string[]) {
  const reached = s.places.filter((p) => passed.has(p.id));
  const ahead = s.places
    .filter((p) => !passed.has(p.id))
    .map((p) => ({ p, d: pos ? distanceMeters(pos, p) : null }))
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0));

  lines.push("", "Places the car has already reached:");
  if (!reached.length) lines.push("- none yet");
  for (const p of reached.slice(-CONTEXT_PLACES)) lines.push(describePlace(p, ""));

  lines.push("", "Places NOT reached yet (still ahead, nearest first):");
  if (!ahead.length) lines.push("- none, that was the whole route");
  for (const { p, d } of ahead.slice(0, CONTEXT_PLACES)) {
    lines.push(describePlace(p, d === null ? "" : `, ${formatDistance(d)} away`));
  }
}

/**
 * Which route place the exchange is about: session places whose name appears
 * in the question or the reply; the nearest to the car wins.
 */
export function matchPlaceId(
  s: TourSession,
  message: string,
  reply: string,
  pos: LatLng | null = s.position,
): string | null {
  const haystack = ` ${normalizeForMatch(`${message} ${reply}`)} `;
  const matches = s.places.filter((p) => {
    const name = normalizeForMatch(p.name);
    return name.length > 0 && haystack.includes(` ${name} `);
  });
  if (!matches.length) return null;
  if (!pos) return matches[0].id;
  return matches.reduce((a, b) => (distanceMeters(pos, b) < distanceMeters(pos, a) ? b : a)).id;
}

function mockReply(s: TourSession): string {
  const pos = s.position;
  const nearest = pos
    ? [...s.places].sort((a, b) => distanceMeters(pos, a) - distanceMeters(pos, b))[0]
    : s.places[0];
  return nearest
    ? `I'm in offline mode right now, so I can't look that up. The closest stop on our route is ${nearest.name}.`
    : "I'm in offline mode right now, so I can't look that up.";
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export interface AnswerOptions {
  llm?: ChatLlm;
  timeoutMs?: number;
  now?: () => number;
  ride?: RideContext;
}

/** Never rejects: failures and timeouts become CHAT_FALLBACK with no sources. */
export async function answer(
  s: TourSession,
  message: string,
  { llm = llmChat, timeoutMs = LIVE_GUIDE.chatTimeoutMs, now = Date.now, ride }: AnswerOptions = {},
): Promise<ChatReply> {
  const started = performance.now();
  const grounding = LIVE_GUIDE.chatGrounding;
  let reply: string;
  let sources: Source[] = [];
  let outcome: string;

  if (!isLlmAvailable()) {
    reply = mockReply(s);
    outcome = "mock";
  } else {
    const messages: ChatMessage[] = [];
    for (const turn of s.chat) {
      messages.push({ role: "user", text: turn.user }, { role: "assistant", text: turn.reply });
    }
    messages.push({
      role: "user",
      text: `Ride context:\n${buildContext(s, ride)}\n\nPassenger's question: ${message}`,
    });
    const deadline = performance.now() + timeoutMs;
    const call = (grounded: boolean) => {
      const remaining = Math.max(1, Math.round(deadline - performance.now()));
      return withTimeout(
        llm(chatSystemPrompt(grounded), messages, { grounding: grounded, timeoutMs: remaining }),
        remaining,
      );
    };
    try {
      let out;
      try {
        out = await call(grounding);
      } catch (err) {
        // Web search has its own quota and model support; when it's unavailable
        // (including a 429 or insufficient_quota), don't retry the search call:
        // answer ungrounded right away, within the same time budget.
        if (!grounding || !isSearchUnavailable(err)) throw err;
        const status = (err as { status?: number }).status;
        console.warn(`[chat] web search unavailable (${status}), retrying without it`);
        out = await call(false);
      }
      reply = cleanScript(sanitizeChatReply(out.text), MAX_REPLY_WORDS);
      if (!reply) throw new Error("empty reply");
      sources = out.sources;
      outcome = `ok, ${sources.length} sources`;
    } catch (err) {
      reply = CHAT_FALLBACK;
      outcome = `fallback: ${(err as Error).message}`;
    }
  }

  if (reply !== CHAT_FALLBACK) {
    s.chat.push({ user: message, reply, at: now() });
    s.chat.splice(0, Math.max(0, s.chat.length - LIVE_GUIDE.chatHistoryTurns));
  }
  console.log(`[chat] ${Math.round(performance.now() - started)} ms (${outcome})`);
  return { reply, placeId: matchPlaceId(s, message, reply, ride?.position ?? s.position), sources };
}
