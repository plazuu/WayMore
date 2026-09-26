import { LANDMARK_ONLY_TYPES, NATURE_TYPES, type Poi } from "../lib/places";
import { distanceToPathMeters, type LatLng } from "../lib/polyline";
import { isNature } from "../lib/scoring";
import {
  MAX_LANDMARK_DISTANCE_FROM_ROUTE_METERS,
  MAX_NATURE_DISTANCE_FROM_ROUTE_METERS,
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
  "fitness_center",
  "swimming_pool",
  "comedy_club",
  "transportation_service",
  "pharmacy",
  "drugstore",
  "tour_agency",
  "travel_agency",
  "sports_club",
  "sports_complex",
  "golf_course",
]);

// Places whose appeal is mostly inside. Dropped unless Google also tags them
// with an outdoor/street-visible type (a museum in a notable building, say).
const INTERIOR_TYPES = new Set([
  "museum",
  "art_gallery",
  "aquarium",
  "movie_theater",
  "library",
  "performing_arts_theater",
  "amusement_center",
  "casino",
  "night_club",
  "spa",
  "gym",
  "shopping_mall",
  "store",
  "travel_agency",
  "tour_agency",
  "golf_course",
  "sports_club",
  "sports_complex",
]);
const EXTERIOR_TYPES = new Set([...LANDMARK_ONLY_TYPES.filter((t) => t !== "tourist_attraction"), ...NATURE_TYPES]);

// Google often tags a bar or restaurant with "park"/"garden" (beer_garden,
// dog_park, food_court). Those are food stops, never landmarks.
const FOOD_AND_DRINK_TYPES = new Set(["restaurant", "cafe", "bar", "pub", "food_court", "beer_garden", "dog_cafe", "bakery", "coffee_shop", "meal_takeaway", "fast_food_restaurant"]);

function isFoodOrDrink(poi: Poi): boolean {
  return poi.types.some((t) => FOOD_AND_DRINK_TYPES.has(t) || t.endsWith("_restaurant"));
}

function isInteriorOnly(poi: Poi): boolean {
  return poi.types.some((t) => INTERIOR_TYPES.has(t)) && !poi.types.some((t) => EXTERIOR_TYPES.has(t));
}

// Google puts "tourist_attraction" on comedy clubs and pharmacies too, so a
// place needs a genuinely outdoor type. Bare tourist_attraction is accepted only
// when it is very well known (streets and signs like "Welcome to Miami Beach").
const BARE_ATTRACTION_MIN_REVIEWS = 1000;

function hasOutdoorAppeal(poi: Poi): boolean {
  if (poi.types.some((t) => EXTERIOR_TYPES.has(t))) return true;
  return poi.types.includes("tourist_attraction") && (poi.userRatingCount ?? 0) >= BARE_ATTRACTION_MIN_REVIEWS;
}

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

// `route` is the decoded polyline: a landmark must be close enough to the road
// to be seen from the car (nature gets a wider allowance).
export function filterLandmarks(pois: Poi[], route: LatLng[]): Poi[] {
  const visible = pois
    .filter((poi) => !isFoodOrDrink(poi) && !isInteriorOnly(poi) && hasOutdoorAppeal(poi))
    .map((poi) => ({ ...poi, distanceFromRouteMeters: Math.round(distanceToPathMeters(poi, route)) }))
    .filter(
      (poi) =>
        poi.distanceFromRouteMeters <=
        (isNature(poi) ? MAX_NATURE_DISTANCE_FROM_ROUTE_METERS : MAX_LANDMARK_DISTANCE_FROM_ROUTE_METERS),
    );
  return filterPois(visible, MIN_LANDMARK_RATING, MIN_LANDMARK_REVIEWS, MAX_LANDMARKS_PER_ROUTE);
}

export function filterFoodStops(pois: Poi[]): Poi[] {
  return filterPois(pois, MIN_FOOD_RATING, MIN_FOOD_REVIEWS, MAX_FOOD_STOPS_PER_ROUTE);
}
