// What the "Where to?" guide offers: intents, categories (mapped to Google
// place types), chips and the fixed reply templates. The server builds every
// chip from here, so they're always valid.

export type Intent = "food" | "attraction";
export type Stage = "intent" | "category" | "results" | "confirmed";

export interface Chip {
  id: string;
  label: string;
}

export interface Category {
  id: string;
  intent: Intent;
  label: string;
  /** Google place types for Nearby Search (verified against Places API (New)). */
  types: string[];
  /** Text Search fallback if a type is ever rejected. */
  query: string;
  /** "Here are the closest great <noun>:" */
  noun: string;
  /** Words that pick this category from free text (whole words or phrases). */
  keywords: string[];
}

export const CATEGORIES: Category[] = [
  { id: "cuban", intent: "food", label: "Cuban", types: ["cuban_restaurant"], query: "cuban restaurant", noun: "Cuban spots", keywords: ["cuban", "cafecito", "cortadito", "croquetas"] },
  { id: "chinese", intent: "food", label: "Chinese", types: ["chinese_restaurant"], query: "chinese restaurant", noun: "Chinese spots", keywords: ["chinese", "dim sum", "dumpling", "dumplings"] },
  { id: "mexican", intent: "food", label: "Mexican", types: ["mexican_restaurant"], query: "mexican restaurant", noun: "Mexican spots", keywords: ["mexican", "taco", "tacos", "burrito", "burritos"] },
  { id: "italian", intent: "food", label: "Italian", types: ["italian_restaurant"], query: "italian restaurant", noun: "Italian spots", keywords: ["italian", "pasta"] },
  { id: "any-food", intent: "food", label: "Anything", types: ["restaurant"], query: "restaurant", noun: "places to eat", keywords: [] },
  { id: "museums", intent: "attraction", label: "Museums", types: ["museum", "art_gallery"], query: "museum", noun: "museums", keywords: ["museum", "museums", "gallery", "galleries", "art"] },
  { id: "parks", intent: "attraction", label: "Parks", types: ["park"], query: "park", noun: "parks", keywords: ["park", "parks", "nature", "garden", "gardens"] },
  { id: "beaches", intent: "attraction", label: "Beaches", types: ["beach"], query: "beach", noun: "beaches", keywords: ["beach", "beaches", "ocean", "sand"] },
  { id: "landmarks", intent: "attraction", label: "Landmarks", types: ["tourist_attraction", "historical_landmark"], query: "landmark", noun: "landmarks", keywords: ["landmark", "landmarks", "monument", "historic", "history", "sights", "sightseeing"] },
  { id: "nightlife", intent: "attraction", label: "Nightlife", types: ["night_club", "bar"], query: "nightlife", noun: "nightlife spots", keywords: ["nightlife", "club", "clubs", "bar", "bars", "drinks", "party", "dancing"] },
  { id: "any-attraction", intent: "attraction", label: "Anything", types: ["tourist_attraction"], query: "things to do", noun: "things to see", keywords: [] },
];

/** "Surprise me": top-rated open places, food or sights. */
export const SURPRISE_TYPES = ["restaurant", "tourist_attraction", "museum", "park"];

export function categoryById(id: string | null | undefined): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function categoriesFor(intent: Intent): Category[] {
  return CATEGORIES.filter((c) => c.intent === intent);
}

export const CHIP = {
  food: { id: "intent:food", label: "Hungry" },
  attraction: { id: "intent:attraction", label: "Something to see" },
  surprise: { id: "intent:surprise", label: "Surprise me" },
  widen: { id: "widen", label: "Search farther" },
  back: { id: "back", label: "Something else" },
  otherPlace: { id: "back", label: "Pick a different one" },
  restart: { id: "restart", label: "Start over" },
} satisfies Record<string, Chip>;

export const categoryChip = (c: Category): Chip => ({ id: `category:${c.id}`, label: c.label });

export const REPLY = {
  greeting: "Hey! Are you hungry, or looking for something to see?",
  askCategory: {
    food: "Nice! What are you in the mood for?",
    attraction: "Love it! What kind of place are you up for?",
  } satisfies Record<Intent, string>,
  results: (noun: string) => `Here are the closest great ${noun}:`,
  textResults: (text: string) => `Here's what I found for "${text}":`,
  surprise: (n: number) => `Feeling adventurous? Here ${n === 1 ? "is a top-rated spot" : `are ${n} top-rated spots`} open right now:`,
  noResults: (noun: string) => `I couldn't find any great ${noun} nearby. Want me to search farther, or try something else?`,
  placesDown: "I can't reach the map right now — try a chip.",
  confirm: (name: string) => `Great choice, setting your destination to ${name}.`,
  notCaught: "Sorry, I didn't catch that.",
  pickFromResults: {
    food: "Tap a place, or tell me what else you're craving.",
    attraction: "Tap a place, or tell me what else you'd like to see.",
    any: "Tap a place, or tell me what else you'd like.",
  },
  outOfRange: (n: number) => `I've only got ${n} option${n === 1 ? "" : "s"} here — tap one, or tell me what else you'd like.`,
  staleCard: "That one isn't in my list anymore — here's what I've got:",
  confirmedAlready: "You're all set! Want to pick a different one, or start over?",
};
