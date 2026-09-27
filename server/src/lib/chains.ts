import type { Poi } from "./places";

// Brands and generic stops, not local spots: however well rated, they shouldn't
// crowd out a local restaurant. backend/src/live/importance.ts keeps the same
// list for choosing which place the live guide narrates.
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

const GENERIC_TYPES = new Set([
  "fast_food_restaurant",
  "gas_station",
  "convenience_store",
  "pharmacy",
  "drugstore",
  "supermarket",
  "grocery_store",
]);

const normalize = (text: string) =>
  ` ${text.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;

/** A national chain or a generic stop (fast food, gas, convenience), judged from the name and primary type. */
export function isGenericChain(poi: Pick<Poi, "name" | "primaryType">): boolean {
  const name = normalize(poi.name);
  return CHAIN_NAMES.some((chain) => name.includes(` ${chain} `)) || GENERIC_TYPES.has(poi.primaryType ?? "");
}
