import { LIVE_GUIDE } from "../config";
import { cleanScript, normalizeForMatch } from "../narration/scriptWriter";
import { chat as llmChat, isLlmAvailable, isSearchUnavailable, type ChatMessage, type Source } from "../services/openai";
import { bearingDeg, distanceMeters, relativeAngle } from "./geo";
import type { TourSession } from "./session";

export type ChatLlm = typeof llmChat;

export interface ChatReply {
  reply: string;
  placeId: string | null;
  sources: Source[];
}

export const CHAT_FALLBACK = "Sorry, I lost my signal for a sec, can you ask again?";
const MAX_REPLY_WORDS = 90;
const CONTEXT_PLACES = 8;

export function chatSystemPrompt(grounding: boolean): string {
  return `You are a young, upbeat local tour guide riding along in the car, showing your friends around the city. You narrate places out loud as the car passes them, and the passenger can also text you questions. You are answering one of those texts now.

Rules:
- Reply in 1 to 4 short sentences of plain text. No markdown, lists, headings, emojis, or links.
- Sound like a friend, not an encyclopedia.
- Use the ride context (where the car is, what you just narrated, the places along the route) to work out what "it", "that" or "there" refers to.
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
export function buildContext(s: TourSession): string {
  const lines: string[] = [];
  if (s.position) {
    const heading = s.heading === null ? "" : `, heading ${compass(s.heading)}`;
    lines.push(`Car position: ${s.position.lat.toFixed(5)}, ${s.position.lng.toFixed(5)}${heading}`);
  } else {
    lines.push("Car position: unknown (the trip just started)");
  }

  const recent = s.narrated.slice(-3);
  lines.push("", "What you narrated most recently (oldest first):");
  if (recent.length) {
    for (const n of recent) lines.push(`- ${n.name} (on the ${n.side}): ${n.text}`);
  } else {
    lines.push("- nothing yet");
  }

  lines.push("", "Places along this route:");
  const pos = s.position;
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
        s.heading !== null &&
        Math.abs(relativeAngle(s.heading, bearingDeg(pos, p))) > LIVE_GUIDE.inFrontHalfAngleDeg;
      where = `, ${formatDistance(d)} away${passed ? ", already passed" : ""}`;
    }
    const kind = p.kind === "restaurant" ? "restaurant" : "landmark";
    const detail = [p.category, p.tagline, p.description, ...(p.facts ?? [])].filter(Boolean).join(" ");
    lines.push(`- ${p.name} (${kind}${where})${detail ? `: ${detail}` : ""}`);
  }
  return lines.join("\n");
}

/**
 * Which route place the exchange is about: session places whose name appears
 * in the question or the reply; the nearest to the car wins.
 */
export function matchPlaceId(s: TourSession, message: string, reply: string): string | null {
  const haystack = ` ${normalizeForMatch(`${message} ${reply}`)} `;
  const matches = s.places.filter((p) => {
    const name = normalizeForMatch(p.name);
    return name.length > 0 && haystack.includes(` ${name} `);
  });
  if (!matches.length) return null;
  const pos = s.position;
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
}

/** Never rejects: failures and timeouts become CHAT_FALLBACK with no sources. */
export async function answer(
  s: TourSession,
  message: string,
  { llm = llmChat, timeoutMs = LIVE_GUIDE.chatTimeoutMs, now = Date.now }: AnswerOptions = {},
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
      text: `Ride context:\n${buildContext(s)}\n\nPassenger's question: ${message}`,
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
        // Web search has its own quota and model support; when it's unavailable,
        // answer ungrounded rather than not at all, within the same time budget.
        if (!grounding || !isSearchUnavailable(err)) throw err;
        const status = (err as { status?: number }).status;
        console.warn(`[chat] web search unavailable (${status}), retrying without it`);
        out = await call(false);
      }
      reply = cleanScript(out.text, MAX_REPLY_WORDS);
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
  return { reply, placeId: matchPlaceId(s, message, reply), sources };
}
