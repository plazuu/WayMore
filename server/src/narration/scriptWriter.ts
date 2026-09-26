import { generate, isGeminiAvailable } from "../services/gemini";
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

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function passesGuardrails(text: string, place: Place): boolean {
  if (countWords(text) < MIN_WORDS) return false;
  if (text.trim().endsWith("?")) return false;
  return normalizeForMatch(text).includes(normalizeForMatch(place.name));
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
  if (!isGeminiAvailable()) return { text: templateLine(place), source: "template" };
  try {
    const raw = await generate(SYSTEM_PROMPT, buildUserPrompt(place), {
      temperature: 0.8,
      maxTokens: 150,
    });
    const text = cleanScript(raw);
    if (passesGuardrails(text, place)) return { text, source: "llm" };
    console.warn(`[narration] guardrails rejected output for ${place.id}: ${JSON.stringify(raw)}`);
  } catch (err) {
    console.warn(`[narration] Gemini failed for ${place.id}:`, (err as Error).message);
  }
  return { text: templateLine(place), source: "template" };
}
