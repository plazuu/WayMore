import { encodePolyline } from '@/lib/polyline';
import { pathLengthMeters } from '@/lib/geo';

import type { LatLng, Poi, RouteOption, RouteResponse } from '../types';

// Offline demo data in the exact `POST /route` response shape, so every screen
// can be built and demoed without the server or a Google key. Enable it with
// "Use demo data" in Settings. Coordinates are real (Brickell -> Wynwood, Miami);
// ratings and descriptions are illustrative.

const path = (points: [number, number][]): LatLng[] =>
  points.map(([latitude, longitude]) => ({ latitude, longitude }));

const NORMAL_PATH = path([
  [25.767, -80.1936],
  [25.7715, -80.1938],
  [25.774, -80.1937],
  [25.7775, -80.1944],
  [25.78, -80.195],
  [25.7835, -80.1955],
  [25.787, -80.196],
  [25.7905, -80.1967],
  [25.794, -80.1975],
  [25.7975, -80.1985],
  [25.801, -80.1994],
]);

const SCENIC_PATH = path([
  [25.767, -80.1936],
  [25.7685, -80.1912],
  [25.77, -80.189],
  [25.7722, -80.1878],
  [25.7745, -80.187],
  [25.777, -80.1866],
  [25.779, -80.1868],
  [25.7815, -80.188],
  [25.7838, -80.1885],
  [25.786, -80.189],
  [25.789, -80.1895],
  [25.792, -80.19],
  [25.7948, -80.1902],
  [25.7975, -80.1905],
  [25.7992, -80.1928],
  [25.8, -80.195],
  [25.8006, -80.1972],
  [25.801, -80.1994],
]);

const LANDMARKS: Record<string, Poi> = {
  bayfront: {
    id: 'demo-bayfront-park',
    name: 'Bayfront Park',
    lat: 25.7751,
    lng: -80.186,
    types: ['park', 'tourist_attraction'],
    rating: 4.6,
    userRatingCount: 21873,
    description: '32-acre waterfront park on Biscayne Bay with an amphitheater and sculpture gardens.',
  },
  bayside: {
    id: 'demo-bayside-marketplace',
    name: 'Bayside Marketplace',
    lat: 25.7784,
    lng: -80.1868,
    types: ['tourist_attraction', 'shopping_mall'],
    rating: 4.5,
    userRatingCount: 64210,
    description: 'Open-air marina marketplace with shops, live music, and boat tours of the bay.',
  },
  freedomTower: {
    id: 'demo-freedom-tower',
    name: 'Freedom Tower',
    lat: 25.7797,
    lng: -80.1897,
    types: ['historical_landmark', 'museum'],
    rating: 4.7,
    userRatingCount: 1934,
  },
  kaseya: {
    id: 'demo-kaseya-center',
    name: 'Kaseya Center',
    lat: 25.7814,
    lng: -80.187,
    types: ['stadium', 'tourist_attraction'],
    rating: 4.6,
    userRatingCount: 38120,
    description: 'Waterfront arena on Biscayne Bay and home of the Miami Heat.',
  },
  pamm: {
    id: 'demo-perez-art-museum',
    name: 'Pérez Art Museum Miami',
    lat: 25.7859,
    lng: -80.1867,
    types: ['museum', 'tourist_attraction'],
    rating: 4.6,
    userRatingCount: 9420,
    description: 'Modern and contemporary art museum with hanging gardens overlooking the bay.',
  },
  courthouse: {
    id: 'demo-dade-courthouse',
    name: 'Dade County Courthouse',
    lat: 25.7753,
    lng: -80.1954,
    types: ['historical_landmark'],
    rating: 4.3,
    userRatingCount: 612,
  },
  wynwood: {
    id: 'demo-wynwood-walls',
    name: 'Wynwood Walls',
    lat: 25.801,
    lng: -80.1994,
    types: ['tourist_attraction', 'art_gallery'],
    rating: 4.6,
    userRatingCount: 30215,
    description: 'Outdoor museum of large-scale street art murals by artists from around the world.',
  },
};

const FOOD: Record<string, Poi> = {
  versailles: {
    id: 'demo-cafe-bayside',
    name: 'Bayside Cafecito',
    lat: 25.7772,
    lng: -80.1874,
    types: ['cafe', 'restaurant'],
    rating: 4.5,
    userRatingCount: 842,
    priceLevel: '$',
    cuisine: 'Cuban',
    description: 'Walk-up window for cortaditos and pastelitos near the marina.',
  },
  seafood: {
    id: 'demo-bay-seafood',
    name: 'Biscayne Seafood House',
    lat: 25.7872,
    lng: -80.1884,
    types: ['seafood_restaurant', 'restaurant'],
    rating: 4.4,
    userRatingCount: 1320,
    priceLevel: '$$$',
    cuisine: 'Seafood',
  },
  bakery: {
    id: 'demo-wynwood-bakery',
    name: 'Wynwood Bakehouse',
    lat: 25.8004,
    lng: -80.1981,
    types: ['bakery', 'cafe'],
    rating: 4.7,
    userRatingCount: 2210,
    priceLevel: '$$',
    cuisine: 'Bakery',
    description: 'Neighborhood bakery known for sourdough and babka.',
  },
  diner: {
    id: 'demo-miami-ave-diner',
    name: 'Miami Avenue Diner',
    lat: 25.7842,
    lng: -80.1962,
    types: ['diner', 'restaurant'],
    rating: 4.2,
    userRatingCount: 530,
    priceLevel: '$',
    cuisine: 'American',
  },
};

function option(points: LatLng[], durationSeconds: number, landmarks: Poi[], foodStops: Poi[]): RouteOption {
  return {
    distanceMeters: Math.round(pathLengthMeters(points)),
    durationSeconds,
    polyline: encodePolyline(points),
    samplePointCount: Math.ceil(pathLengthMeters(points) / 1200),
    score: landmarks.reduce((sum, p) => sum + (p.rating ?? 0), 0),
    landmarks,
    foodStops,
  };
}

export function buildMockRoute(start: string, end: string): RouteResponse {
  const normal = option(NORMAL_PATH, 11 * 60, [LANDMARKS.courthouse, LANDMARKS.wynwood], [FOOD.diner, FOOD.bakery]);
  const scenic = option(
    SCENIC_PATH,
    15 * 60,
    [
      LANDMARKS.bayfront,
      LANDMARKS.bayside,
      LANDMARKS.freedomTower,
      LANDMARKS.kaseya,
      LANDMARKS.pamm,
      LANDMARKS.wynwood,
    ],
    [FOOD.versailles, FOOD.seafood, FOOD.bakery],
  );

  return {
    start: { lat: 25.767, lng: -80.1936, formattedAddress: start },
    end: { lat: 25.801, lng: -80.1994, formattedAddress: end },
    normal,
    scenic,
    extraTimeSeconds: scenic.durationSeconds - normal.durationSeconds,
  };
}
