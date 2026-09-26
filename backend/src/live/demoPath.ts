import { Router } from "express";
import demoPlaces from "../../data/demo-places.json";
import { bearingDeg, distanceMeters, type LatLng } from "./geo";

export interface PathPoint {
  lat: number;
  lng: number;
  heading: number;
  speedMps: number;
}

export const DEMO_INTERVAL_MS = 3000;
const DEMO_SPEED_MPS = 8; // ~18 mph, downtown traffic

// Northbound on Biscayne Blvd, downtown Miami: Bayside Marketplace and
// Kaseya Center on the right, Freedom Tower on the left (data/demo-places.json).
const WAYPOINTS: LatLng[] = [
  { lat: 25.7752, lng: -80.18817 },
  { lat: 25.78, lng: -80.1884 },
  { lat: 25.7838, lng: -80.18813 },
];

/** Points spaced one tick apart at a steady speed along the waypoints. */
export function demoPath(speedMps = DEMO_SPEED_MPS, intervalMs = DEMO_INTERVAL_MS): PathPoint[] {
  const step = (speedMps * intervalMs) / 1000;
  const points: PathPoint[] = [];
  let carry = 0; // distance already travelled into the current segment
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const a = WAYPOINTS[i];
    const b = WAYPOINTS[i + 1];
    const length = distanceMeters(a, b);
    const heading = Math.round(bearingDeg(a, b) * 10) / 10;
    let d = carry;
    for (; d < length; d += step) {
      const f = d / length;
      points.push({
        lat: Math.round((a.lat + (b.lat - a.lat) * f) * 1e6) / 1e6,
        lng: Math.round((a.lng + (b.lng - a.lng) * f) * 1e6) / 1e6,
        heading,
        speedMps,
      });
    }
    carry = d - length;
  }
  return points;
}

// GET /dev/demo-path, mounted only when NODE_ENV !== "production" (see app.ts).
// `places` are the demo places the path passes. The simulated drive should
// /tour/start with exactly these so narration hits the disk cache that
// `npm run replay:drive -- --real` filled.
export const devRouter = Router();

devRouter.get("/dev/demo-path", (_req, res) => {
  res.json({ points: demoPath(), intervalMs: DEMO_INTERVAL_MS, places: demoPlaces });
});
