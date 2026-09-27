import { LANDMARK_ONLY_TYPES, NATURE_TYPES, type Poi } from "../lib/places";
import { distanceToPathMeters, type LatLng } from "../lib/polyline";
import { isNature, preferenceWeight } from "../lib/scoring";
import {
  MAX_LANDMARK_DISTANCE_FROM_ROUTE_METERS,
  MAX_NATURE_DISTANCE_FROM_ROUTE_METERS,
  MIN_LANDMARK_RATING,
  MIN_LANDMARK_REVIEWS,
  MAX_LANDMARKS_PER_ROUTE,
  MIN_FOOD_RATING,
  MIN_FOOD_REVIEWS,
  MAX_FOOD_STOPS_PER_ROUTE,
  LAST_MILE_RADIUS_METERS,
  FOOD_VISIBLE_FROM_ROUTE_METERS,
  FOOD_VISIBLE_WEIGHT,
  FOOD_FAR_SCORE_FACTOR,
  type ScenicPreference,
  FOOD_CHAIN_WEIGHT,
} from "../config";
import { isGenericChain } from "../lib/chains";

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

function passesQuality(poi: Poi, minRating: number, minReviews: number): boolean {
  return (
    !poi.types.some((t) => EXCLUDED_TYPES.has(t)) &&
    (poi.rating ?? 0) >= minRating &&
    (poi.userRatingCount ?? 0) >= minReviews
  );
}

function filterPois(
  pois: Poi[],
  minRating: number,
  minReviews: number,
  maxCount: number,
  weight: (poi: Poi) => number = () => 1,
): Poi[] {
  return pois
    .filter((poi) => passesQuality(poi, minRating, minReviews))
    .sort((a, b) => qualityScore(b) * weight(b) - qualityScore(a) * weight(a))
    .slice(0, maxCount);
}

// `route` is the decoded polyline: a landmark must be close enough to the road
// to be seen from the car (nature gets a wider allowance).
export function filterLandmarks(pois: Poi[], route: LatLng[], preference?: ScenicPreference): Poi[] {
  const visible = pois
    .filter((poi) => !isFoodOrDrink(poi) && !isInteriorOnly(poi) && hasOutdoorAppeal(poi))
    .map((poi) => ({ ...poi, distanceFromRouteMeters: Math.round(distanceToPathMeters(poi, route)) }))
    .filter(
      (poi) =>
        poi.distanceFromRouteMeters <=
        (isNature(poi) ? MAX_NATURE_DISTANCE_FROM_ROUTE_METERS : MAX_LANDMARK_DISTANCE_FROM_ROUTE_METERS),
    );
  // Ranked by the user's preference before the cap, so a nature lover's top 8
  // are mostly nature and a city lover's mostly landmarks.
  return filterPois(visible, MIN_LANDMARK_RATING, MIN_LANDMARK_REVIEWS, MAX_LANDMARKS_PER_ROUTE, (poi) =>
    preferenceWeight(poi, preference),
  );
}

// Restaurants only matter on the final approach. `finalStretch` is the last
// part of this route's path, `destination` where the trip ends. A place close to
// that stretch is visible from the car and scores higher; closeness to the
// destination also counts (the walk from the drop-off).
export function filterFoodStops(pois: Poi[], finalStretch: LatLng[], destination: LatLng): Poi[] {
  return pois
    .filter((poi) => passesQuality(poi, MIN_FOOD_RATING, MIN_FOOD_REVIEWS))
    .map((poi) => {
      const fromRoute = Math.round(distanceToPathMeters(poi, finalStretch));
      const fromDestination = Math.round(distanceToPathMeters(poi, [destination]));
      const visibleFromRoute = fromRoute <= FOOD_VISIBLE_FROM_ROUTE_METERS;
      const closeness = 1 - (1 - FOOD_FAR_SCORE_FACTOR) * Math.min(1, fromDestination / LAST_MILE_RADIUS_METERS);
      const chainWeight = isGenericChain(poi) ? FOOD_CHAIN_WEIGHT : 1;
      const score = qualityScore(poi) * (visibleFromRoute ? FOOD_VISIBLE_WEIGHT : 1) * closeness * chainWeight;
      return { poi: { ...poi, distanceFromRouteMeters: fromRoute, distanceFromDestinationMeters: fromDestination, visibleFromRoute }, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FOOD_STOPS_PER_ROUTE)
    .map(({ poi }) => poi);
}
