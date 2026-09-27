import { IMPORTANCE, LIVE_GUIDE } from "../config";
import type { Place } from "../types";

export type Tier = keyof typeof IMPORTANCE.weights;

// Matched against the place's category (a Google type like "Historical landmark",
// or the app's cuisine) and name, lowercased with punctuation removed.
const HERITAGE_WORDS = [
  "historic", "historical", "heritage", "landmark", "monument", "memorial", "museum",
  "national park", "state park", "park", "garden", "preserve", "everglades", "beach",
  "bay", "marina", "waterfront", "lighthouse", "bridge", "tower", "castle", "fort",
  "cathedral", "church", "temple", "mosque", "synagogue", "arena", "stadium",
  "art gallery", "gallery", "theater", "theatre", "opera", "concert hall", "cultural",
  "culture", "library", "plaza", "square", "zoo", "aquarium",
];

const CHAIN_WORDS = [
  "fast food", "gas station", "convenience", "pharmacy", "drugstore", "supermarket",
  "grocery", "department store", "car wash", "atm", "bank",
];

// Brands, not local spots: however well rated, they're never the story of the drive.
// server/src/lib/chains.ts keeps the same list for food-stop ranking.
const CHAIN_NAMES = [
  "taco bell", "mcdonalds", "burger king", "wendys", "subway", "kfc", "popeyes",
  "chick fil a", "starbucks", "dunkin", "dominos", "pizza hut", "papa johns",
  "little caesars", "chipotle", "arbys", "sonic drive in", "jack in the box",
  "dairy queen", "five guys", "panda express", "carls jr", "hardees", "wingstop",
  "checkers", "del taco", "whataburger", "white castle", "dennys", "ihop",
  "applebees", "olive garden", "7 eleven", "circle k", "wawa", "cvs", "walgreens",
  "walmart", "target", "dollar general", "family dollar", "shell", "chevron",
  "exxon", "mobil", "sunoco", "citgo",
];

const normalize = (text: string) =>
  ` ${text.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;

const hasWord = (haystack: string, words: string[]) => words.some((w) => haystack.includes(` ${w} `));

/** How culturally significant a place is: heritage sights, local spots, or generic chains. */
export function tierOf(place: Pick<Place, "name" | "category">): Tier {
  const name = normalize(place.name);
  const category = normalize(place.category ?? "");
  // A chain name wins over everything: "Taco Bell Cantina" isn't a landmark.
  if (hasWord(name, CHAIN_NAMES) || hasWord(category, CHAIN_WORDS)) return "chain";
  if (hasWord(category, HERITAGE_WORDS) || hasWord(name, HERITAGE_WORDS)) return "heritage";
  return "local";
}

/** Higher wins the trigger slot when several places qualify on the same tick. */
export function importanceScore(place: Place, distanceM: number): number {
  const rating = typeof place.rating === "number" && Number.isFinite(place.rating) ? place.rating : IMPORTANCE.defaultRating;
  const distance = Math.min(Math.max(0, distanceM), LIVE_GUIDE.triggerDistanceM);
  return (
    IMPORTANCE.weights[tierOf(place)] * IMPORTANCE.weightFactor +
    Math.min(Math.max(rating, 0), 5) * IMPORTANCE.ratingFactor -
    distance * IMPORTANCE.distancePenaltyPerM
  );
}
