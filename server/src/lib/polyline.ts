export interface LatLng {
  lat: number;
  lng: number;
}

export function decodePolyline(encoded: string): LatLng[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: LatLng[] = [];

  while (index < encoded.length) {
    let byte: number;
    let shift = 0;
    let result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return coordinates;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Walks the decoded path and emits a point every `intervalMeters`,
// linearly interpolating between the surrounding polyline vertices.
export function sampleAlongPath(points: LatLng[], intervalMeters: number): LatLng[] {
  if (points.length === 0) return [];

  const samples: LatLng[] = [points[0]];
  let accumulated = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const segmentLength = haversineMeters(prev, curr);
    let coveredInSegment = 0;

    while (segmentLength > 0 && accumulated + (segmentLength - coveredInSegment) >= intervalMeters) {
      const distanceIntoSegment = coveredInSegment + (intervalMeters - accumulated);
      const t = distanceIntoSegment / segmentLength;
      samples.push({
        lat: prev.lat + (curr.lat - prev.lat) * t,
        lng: prev.lng + (curr.lng - prev.lng) * t,
      });
      coveredInSegment = distanceIntoSegment;
      accumulated = 0;
    }

    accumulated += segmentLength - coveredInSegment;
  }

  return samples;
}

// Shortest distance from `point` to the polyline `path`, measured to the
// segments (not just the vertices) so long straight stretches are handled.
// Uses a local flat projection, which is accurate at this scale.
export function distanceToPathMeters(point: LatLng, path: LatLng[]): number {
  if (path.length === 0) return Infinity;
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const cosLat = Math.cos(toRad(point.lat));
  const project = (p: LatLng) => ({
    x: toRad(p.lng - point.lng) * cosLat * R,
    y: toRad(p.lat - point.lat) * R,
  });

  let best = Infinity;
  let prev = project(path[0]);
  best = Math.min(best, Math.hypot(prev.x, prev.y));
  for (let i = 1; i < path.length; i++) {
    const curr = project(path[i]);
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(prev.x * dx + prev.y * dy) / lenSq));
    best = Math.min(best, Math.hypot(prev.x + t * dx, prev.y + t * dy));
    prev = curr;
  }
  return best;
}

// The last `meters` of the path, ending at its final point: what the car
// drives on its final approach.
export function lastStretch(path: LatLng[], meters: number): LatLng[] {
  if (path.length < 2) return path;
  const tail: LatLng[] = [path[path.length - 1]];
  let covered = 0;
  for (let i = path.length - 2; i >= 0 && covered < meters; i--) {
    covered += haversineMeters(path[i], tail[tail.length - 1]);
    tail.push(path[i]);
  }
  return tail.reverse();
}

const bearingDegrees = (a: LatLng, b: LatLng): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

const angleBetween = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// Meters of the route that double back over ground it already covered: driving
// into a parking lot or dead end and turning around, or an out-and-back spur to
// reach a waypoint. Samples the path every `stepMeters` and counts samples that
// lie within `toleranceMeters` of earlier ground while heading the opposite way.
export function retraceMeters(path: LatLng[], stepMeters = 20, toleranceMeters = 15): number {
  const samples = sampleAlongPath(path, stepMeters);
  if (samples.length < 8) return 0;
  const cell = (p: LatLng) => `${Math.round(p.lat / 0.0002)},${Math.round(p.lng / 0.0002)}`; // ~22 m cells
  const seen = new Map<string, number[]>();
  const headings = samples.map((p, i) => (i + 1 < samples.length ? bearingDegrees(p, samples[i + 1]) : bearingDegrees(samples[i - 1], p)));
  let retraced = 0;
  samples.forEach((p, i) => {
    const [cy, cx] = cell(p).split(",").map(Number);
    let doubled = false;
    for (let dy = -1; dy <= 1 && !doubled; dy++) {
      for (let dx = -1; dx <= 1 && !doubled; dx++) {
        for (const j of seen.get(`${cy + dy},${cx + dx}`) ?? []) {
          if (i - j < 4) continue; // adjacent samples aren't "earlier ground"
          if (haversineMeters(p, samples[j]) <= toleranceMeters && angleBetween(headings[i], headings[j]) > 120) {
            doubled = true;
            break;
          }
        }
      }
    }
    if (doubled) retraced += stepMeters;
    const key = cell(p);
    seen.set(key, [...(seen.get(key) ?? []), i]);
  });
  return retraced;
}
