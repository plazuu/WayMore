import { CATEGORIES, type Category, type Intent, type Stage } from "./catalog";

/**
 * What the user's free text means. The deterministic interpreter below and the
 * LLM providers return the same shape; the flow (flow.ts) decides what happens.
 */
export interface Interpretation {
  intent: Intent | "surprise" | null;
  /** A category id from catalog.ts. */
  category: string | null;
  /** 1-based index into the current results. */
  selection: number | null;
  /** Free text to search Places for (a dish, a restaurant's name, ...). */
  searchText: string | null;
  restart: boolean;
  /** LLM providers only: the reply in the guide's voice. */
  reply?: string;
}

export interface InterpretContext {
  stage: Stage;
  intent: Intent | null;
  /** Names of the current results, in order. */
  placeNames: string[];
}

export const EMPTY: Interpretation = { intent: null, category: null, selection: null, searchText: null, restart: false };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .trim();
}

const hasPhrase = (text: string, phrase: string) => new RegExp(`(^| )${phrase}( |$)`).test(text);
const hasAny = (text: string, phrases: string[]) => phrases.some((p) => hasPhrase(text, p));

const RESTART = ["start over", "restart", "reset", "start again", "begin again", "from the top", "never mind", "nevermind"];
const SMALL_TALK = /^(hi|hello|hey|yo|thanks|thank you|ok|okay|cool|yes|yeah|yep|no|nope|help|what|hmm|um)$/;
const ANYTHING = ["anything", "whatever", "any", "dont care", "you pick", "you choose", "idk", "i dont know", "not sure"];
const INTENT_WORDS: Record<Intent | "surprise", string[]> = {
  food: ["hungry", "food", "eat", "eating", "restaurant", "restaurants", "lunch", "dinner", "breakfast", "brunch", "starving", "snack", "bite"],
  attraction: ["see", "sights", "visit", "explore", "attraction", "attractions", "tour", "fun", "something to see", "things to do", "sightsee"],
  surprise: ["surprise", "surprise me", "random", "dealers choice", "feeling lucky"],
};
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5,
  one: 1, two: 2, three: 3, four: 4, five: 5,
};

function parseSelection(text: string, count: number): number | null {
  if (hasPhrase(text, "last") && count > 0) return count;
  const digit = text.match(/(^| |#)(\d)( |$)/);
  if (digit) return Number(digit[2]);
  for (const [word, n] of Object.entries(ORDINALS)) {
    // "one"/"two" alone are too common ("that one"); only as "number two" / "option two".
    if (["one", "two", "three", "four", "five"].includes(word)) {
      if (hasAny(text, [`number ${word}`, `option ${word}`])) return n;
      continue;
    }
    if (hasPhrase(text, word)) return n;
  }
  return null;
}

/**
 * A place picked by its name or a distinctive word of it: "actually hutong"
 * for "Hutong Miami". A word in several names ("miami") doesn't count, and the
 * words must point at exactly one place.
 */
function matchPlaceName(text: string, names: string[]): number | null {
  const normalized = names.map(normalize);
  const whole = normalized.flatMap((name, i) => (name.length >= 4 && hasPhrase(text, name) ? [i] : []));
  if (whole.length === 1) return whole[0] + 1;
  const picked = new Set<number>();
  for (const word of text.split(" ")) {
    if (word.length < 4) continue;
    const hits = normalized.flatMap((name, i) => (name.split(" ").includes(word) ? [i] : []));
    if (hits.length === 1) picked.add(hits[0]);
  }
  return picked.size === 1 ? [...picked][0] + 1 : null;
}

function matchCategory(text: string, intent: Intent | null): Category | null {
  for (const c of CATEGORIES) {
    if (intent && c.intent !== intent) continue;
    if (hasAny(text, c.keywords) || hasPhrase(text, c.label.toLowerCase())) {
      if (c.id.startsWith("any-")) continue;
      return c;
    }
  }
  // A category from the other intent still counts: "actually, a museum" while picking food.
  if (intent) return matchCategory(text, null);
  return null;
}

/**
 * Keyword matching for when no LLM is configured or every LLM failed. Order:
 * start over > pick a result > category > intent > free-text search.
 */
export function interpretDeterministic(message: string, ctx: InterpretContext): Interpretation {
  const text = normalize(message);
  if (!text) return EMPTY;
  if (hasAny(text, RESTART)) return { ...EMPTY, restart: true };

  // After confirming, the results stay pickable ("actually, the third one").
  if ((ctx.stage === "results" || ctx.stage === "confirmed") && ctx.placeNames.length > 0) {
    const selection = parseSelection(text, ctx.placeNames.length) ?? matchPlaceName(text, ctx.placeNames);
    if (selection !== null) return { ...EMPTY, selection };
  }

  const category = matchCategory(text, ctx.intent);
  if (category) return { ...EMPTY, intent: category.intent, category: category.id };

  if (ctx.stage === "category" && ctx.intent && hasAny(text, ANYTHING)) {
    return { ...EMPTY, intent: ctx.intent, category: `any-${ctx.intent}` };
  }
  if (hasAny(text, INTENT_WORDS.surprise) || (ctx.stage === "intent" && hasAny(text, ANYTHING))) {
    return { ...EMPTY, intent: "surprise" };
  }
  for (const intent of ["food", "attraction"] as const) {
    if (hasAny(text, INTENT_WORDS[intent])) return { ...EMPTY, intent };
  }

  if (SMALL_TALK.test(text)) return EMPTY;
  return { ...EMPTY, searchText: message.trim().slice(0, 80) };
}
