import type { LatLng } from '@/api/types';

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Compass bearing from `a` to `b`, 0–360 with 0 = north. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Signed difference `to - from` in degrees, normalized to -180..180. Positive means clockwise (to the right). */
export function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function pathLengthMeters(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceMeters(path[i - 1], path[i]);
  return total;
}

/** The point `meters` along `path`, and the heading of the segment it lies on. */
export function pointAlongPath(path: LatLng[], meters: number): { point: LatLng; heading: number } {
  let remaining = meters;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const segment = distanceMeters(a, b);
    if (remaining <= segment || i === path.length - 1) {
      const t = segment === 0 ? 0 : Math.min(1, remaining / segment);
      return {
        point: {
          latitude: a.latitude + (b.latitude - a.latitude) * t,
          longitude: a.longitude + (b.longitude - a.longitude) * t,
        },
        heading: bearingDegrees(a, b),
      };
    }
    remaining -= segment;
  }
  return { point: path[0], heading: 0 };
}
