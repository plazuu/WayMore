import { generate, isLlmAvailable } from "../services/openai";
import type { Place } from "../types";
import { buildUserPrompt, directionPhrase, SYSTEM_PROMPT } from "./prompts";

const MAX_WORDS = 40;
const MIN_WORDS = 6;
// Normal speech is ~2.6 words/s; the voice runs at ~1.10x.
const WORDS_PER_SECOND = 2.86;

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function durationHint(text: string): number {
  return Math.round((countWords(text) / WORDS_PER_SECOND) * 10) / 10;
}

/** Strips markdown/quotes/emoji, collapses whitespace, and caps length at a sentence boundary. */
export function cleanScript(raw: string, maxWords = MAX_WORDS): string {
  let text = raw
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/^\s{0,3}#{1,6}\s.*$/gm, "") // heading lines
    .replace(/^\s{0,3}([-*+]\s+|\d+[.)]\s+|>\s*)/gm, "") // list markers, blockquotes
    .replace(/(\*\*|__|\*|_|`|~~)/g, "")
    .replace(/\s*\([^)]*\)/g, "") // parentheticals
    .replace(/[“”„"]/g, "")
    .replace(/\p{Extended_Pictographic}|️/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim();

  // Keep only the first exclamation point.
  let seenBang = false;
  text = text.replace(/!/g, () => (seenBang ? "." : ((seenBang = true), "!")));

  const words = text.split(" ").filter(Boolean);
  if (words.length > maxWords) {
    const truncated = words.slice(0, maxWords).join(" ");
    const lastEnd = Math.max(
      truncated.lastIndexOf("."),
      truncated.lastIndexOf("!"),
      truncated.lastIndexOf("?"),
    );
    text = lastEnd > 0 ? truncated.slice(0, lastEnd + 1) : `${truncated.replace(/[,;:\s]+$/, "")}.`;
  }
  return text;
}

// Spelled-out words -> the abbreviation Places uses, so "Collins Avenue" in a
// line still matches a place named "Collins Ave" (the prompt asks for the long form).
const STREET_WORDS: Record<string, string> = {
  street: "st",
  saint: "st",
  avenue: "ave",
  boulevard: "blvd",
  drive: "dr",
  road: "rd",
  highway: "hwy",
  parkway: "pkwy",
  lane: "ln",
  court: "ct",
  place: "pl",
};

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => STREET_WORDS[w] ?? w)
    .join(" ");
}

export function passesGuardrails(text: string, place: Place): boolean {
  if (countWords(text) < MIN_WORDS) return false;
  if (text.trim().endsWith("?")) return false;
  if (!sideIsConsistent(text, place.side)) return false;
  return normalizeForMatch(text).includes(normalizeForMatch(place.name));
}

// "your left", "on the right", "to your left", "look left", "left-hand side"... but not
// "just the right spot". The passenger side is the right and the driver's side the left
// (US cars), so "passenger window" counts as right and "driver's side" as left.
const SIDE_MENTION =
  /\b(?:(?:on|to)\s+(?:your|the)|your|look)\s+(left|right)\b|\b(left|right)(?:-hand)?\s+side\b|\b(passenger|driver)(?:['’]?s)?[\s-]+(?:side|window|seat)\b/gi;
const SIDE_WORD: Record<string, "left" | "right"> = { left: "left", right: "right", passenger: "right", driver: "left" };

/**
 * The side comes from the car's heading (live/geo.ts), so the LLM may only repeat
 * it: a line for a place on the right must never say "left", and a line without a
 * known left/right ("ahead" or no side) must not name one at all.
 */
export function sideIsConsistent(text: string, side: Place["side"]): boolean {
  for (const match of text.matchAll(SIDE_MENTION)) {
    const said = SIDE_WORD[(match[1] ?? match[2] ?? match[3]).toLowerCase()];
    if (said !== side) return false;
  }
  return true;
}

function lowerFirst(s: string): string {
  // Keep acronyms / proper nouns intact ("NBA arena", "Miami's ...").
  if (s.length > 1 && s[1] === s[1].toLowerCase() && /^[A-Z][a-z]/.test(s)) {
    return s[0].toLowerCase() + s.slice(1);
  }
  return s;
}

/** Deterministic fallback, e.g. "On your right is Kaseya Center, home of the Miami Heat." */
export function templateLine(place: Place): string {
  const opener = directionPhrase(place.side);
  const tagline = place.tagline?.trim().replace(/[.!?]+$/, "");
  const detail = tagline ? `, ${lowerFirst(tagline)}` : "";
  if (place.kind === "restaurant") {
    return `${opener} is ${place.name}${detail}, a great food stop if you're hungry.`;
  }
  return `${opener} is ${place.name}${detail}.`;
}

export interface Script {
  text: string;
  source: "llm" | "template";
}

export async function writeScript(place: Place): Promise<Script> {
  if (!isLlmAvailable()) return { text: templateLine(place), source: "template" };
  try {
    const raw = await generate(SYSTEM_PROMPT, buildUserPrompt(place), {
      temperature: 0.8,
      maxTokens: 150,
    });
    const text = cleanScript(raw);
    if (passesGuardrails(text, place)) return { text, source: "llm" };
    console.warn(`[narration] guardrails rejected output for ${place.id}: ${JSON.stringify(raw)}`);
  } catch (err) {
    console.warn(`[narration] LLM failed for ${place.id}:`, (err as Error).message);
  }
  return { text: templateLine(place), source: "template" };
}
