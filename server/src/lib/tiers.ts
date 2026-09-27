import { DETOUR_PENALTY_PER_METER, ICONIC_FOOD_MIN_RATING, ICONIC_FOOD_MIN_REVIEWS, TIER_WEIGHTS } from "../config";
import { isGenericChain } from "./chains";
import type { Poi } from "./places";

/**
 * 1: parks, historic sites, museums, monuments, arenas, gardens, viewpoints, the waterfront.
 * 2: other local attractions (plazas, sculptures, city parks) and iconic local restaurants.
 * 3: standard local restaurants, cafes and shops.
 * 4: chains and generic stops (fast food, gas, convenience, pharmacies).
 */
export type Tier = 1 | 2 | 3 | 4;

const TIER_1_TYPES = new Set([
  "national_park", "state_park", "historical_landmark", "historical_place", "monument",
  "cultural_landmark", "stadium", "arena", "botanical_garden", "observation_deck",
  "scenic_spot", "beach", "marina", "bridge", "tourist_attraction",
]);

const TIER_2_TYPES = new Set([
  "plaza", "sculpture", "fountain", "park", "city_park", "garden", "art_gallery",
  "performing_arts_theater", "cultural_center",
]);

const FOOD_TYPES = new Set(["restaurant", "cafe", "bar", "bakery", "coffee_shop", "meal_takeaway"]);

const isFood = (poi: Poi) => poi.types.some((t) => FOOD_TYPES.has(t) || t.endsWith("_restaurant"));

export function tierOf(poi: Poi): Tier {
  if (poi.curated) return 1;
  // Checked first: a chain tagged "tourist_attraction" is still a chain.
  if (isGenericChain(poi)) return 4;
  if (isFood(poi)) {
    const iconic = (poi.rating ?? 0) >= ICONIC_FOOD_MIN_RATING && (poi.userRatingCount ?? 0) >= ICONIC_FOOD_MIN_REVIEWS;
    return iconic ? 2 : 3;
  }
  if (poi.types.some((t) => TIER_1_TYPES.has(t) || t.endsWith("museum"))) return 1;
  if (poi.types.some((t) => TIER_2_TYPES.has(t))) return 2;
  return 3;
}

/**
 * rank = tier weight * 10 + rating * 2 - detour penalty. The tier gaps (400+) dwarf
 * the rating range (0-10) and the penalty (a few points at the distances landmarks
 * are kept), so a 4.2 landmark always outranks a 5.0 chain.
 */
export function tierRank(poi: Poi): number {
  const detourPenalty = (poi.distanceFromRouteMeters ?? 0) * DETOUR_PENALTY_PER_METER;
  return TIER_WEIGHTS[tierOf(poi)] * 10 + (poi.rating ?? 0) * 2 - detourPenalty;
}

/** Tags each POI with its tier and sorts best first; ties keep their incoming order. */
export function byTierRank(pois: Poi[]): Poi[] {
  return pois
    .map((poi, index) => ({ poi: { ...poi, tier: tierOf(poi) }, rank: tierRank(poi), index }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map(({ poi }) => poi);
}
