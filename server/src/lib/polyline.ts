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
