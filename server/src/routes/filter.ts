import type { Poi } from "../lib/places";
import {
  MIN_LANDMARK_RATING,
  MIN_LANDMARK_REVIEWS,
  MAX_LANDMARKS_PER_ROUTE,
  MIN_FOOD_RATING,
  MIN_FOOD_REVIEWS,
  MAX_FOOD_STOPS_PER_ROUTE,
} from "../config";

// Google tags many places with several types (a school can also be
// "tourist_attraction" or "park"), so a place is dropped if ANY of its
// types is in this list.
export const EXCLUDED_TYPES = new Set([
  "school",
  "primary_school",
  "secondary_school",
  "university",
  "preschool",
  "cemetery",
  "funeral_home",
  "hospital",
  "doctor",
  "dentist",
  "church",
  "place_of_worship",
  "gas_station",
  "parking",
  "storage",
  "lodging",
  "car_dealer",
  "car_repair",
  "government_office",
  "courthouse",
  "police",
  "fire_station",
]);

// Favors well-rated places, but a 4.7 from 12 people shouldn't beat a 4.6
// from 3,000: log-scale the review count so it breaks ties without dominating.
export function qualityScore(poi: Poi): number {
  return (poi.rating ?? 0) * Math.log10((poi.userRatingCount ?? 0) + 1);
}

function filterPois(
  pois: Poi[],
  minRating: number,
  minReviews: number,
  maxCount: number,
): Poi[] {
  return pois
    .filter((poi) => !poi.types.some((t) => EXCLUDED_TYPES.has(t)))
    .filter((poi) => (poi.rating ?? 0) >= minRating)
    .filter((poi) => (poi.userRatingCount ?? 0) >= minReviews)
    .sort((a, b) => qualityScore(b) - qualityScore(a))
    .slice(0, maxCount);
}

export function filterLandmarks(pois: Poi[]): Poi[] {
  return filterPois(pois, MIN_LANDMARK_RATING, MIN_LANDMARK_REVIEWS, MAX_LANDMARKS_PER_ROUTE);
}

export function filterFoodStops(pois: Poi[]): Poi[] {
  return filterPois(pois, MIN_FOOD_RATING, MIN_FOOD_REVIEWS, MAX_FOOD_STOPS_PER_ROUTE);
}
