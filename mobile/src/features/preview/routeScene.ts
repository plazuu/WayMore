import * as THREE from 'three';

import { getPoiCategory } from '@/components/poi/poiCategory';
import { TOP_LANDMARK_COLOR } from '@/components/poi/poiStyle';
import { colors } from '@/theme';

import type { LatLng, TripPoi } from '@/api/types';

/**
 * The cinematic 3D route preview, as plain three.js. `RoutePreview3D` owns the
 * GL context and calls `update()` every frame.
 *
 * Timeline (seconds, loops): establishing orbit → fly-through behind a comet
 * that "draws" the route → pull up over the destination → fade and repeat.
 */
const ORBIT_END = 3;
const FLY_END = 13;
const LOOP_SECONDS = 16;
const FADE_SECONDS = 0.8;

/** The whole route is scaled to fit this many scene units, whatever its real length. */
const ROUTE_EXTENT = 100;
/** Routes shorter than this still get a sensible scale instead of filling the frame with one block. */
const MIN_EXTENT_METERS = 400;
const ROUTE_SAMPLES = 220;
const TUBE_SEGMENTS = 600;
const TUBE_RADIAL = 8;

const SKY = '#0B1220';
/** The comet highlights a top landmark within this many scene units. */
const HIGHLIGHT_RADIUS = 18;
const TOP_CAP_SCALE = 0.7;
const GROUND = '#0F1A2B';

interface Projected {
  points: THREE.Vector3[];
  toScene: (p: { lat: number; lng: number }) => THREE.Vector3;
}

/** Flat local projection around the route's center, scaled so the route spans ROUTE_EXTENT units. */
function project(coords: LatLng[]): Projected {
  const lats = coords.map((c) => c.latitude);
  const lngs = coords.map((c) => c.longitude);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng0 = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const mPerLat = 110_540;
  const mPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const extentMeters = Math.max(
    MIN_EXTENT_METERS,
    (Math.max(...lats) - Math.min(...lats)) * mPerLat,
    (Math.max(...lngs) - Math.min(...lngs)) * mPerLng,
  );
  const scale = ROUTE_EXTENT / extentMeters;
  const toScene = (p: { lat: number; lng: number }) =>
    new THREE.Vector3((p.lng - lng0) * mPerLng * scale, 0, -(p.lat - lat0) * mPerLat * scale);
  return { points: coords.map((c) => toScene({ lat: c.latitude, lng: c.longitude })), toScene };
}

/**
 * Evenly spaced, lightly smoothed copy of the route. Raw polylines have
 * clustered vertices and right-angle city turns that make a spline overshoot.
 */
function resample(points: THREE.Vector3[], count: number): THREE.Vector3[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = cumulative[cumulative.length - 1];
  const even: THREE.Vector3[] = [];
  let j = 1;
  for (let i = 0; i < count; i++) {
    const d = (total * i) / (count - 1);
    while (j < points.length - 1 && cumulative[j] < d) j++;
    const span = cumulative[j] - cumulative[j - 1] || 1;
    even.push(points[j - 1].clone().lerp(points[j], (d - cumulative[j - 1]) / span));
  }
  return even.map((p, i) => {
    if (i === 0 || i === even.length - 1) return p;
    return p.clone().add(even[i - 1]).add(even[i + 1]).divideScalar(3);
  });
}

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export interface RouteScene {
  /** Advance to `elapsed` seconds. Returns the top landmark being passed, if any. */
  update: (elapsed: number, dt: number) => TripPoi | null;
  render: (renderer: THREE.WebGLRenderer) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export function createRouteScene(coords: LatLng[], pois: TripPoi[], aspect: number): RouteScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 70, 260);

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  scene.add(new THREE.HemisphereLight('#9fc3ff', '#0a0f18', 0.9));
  const sun = new THREE.DirectionalLight('#ffffff', 1.2);
  sun.position.set(40, 80, 20);
  scene.add(sun);

  const ground = new THREE.Mesh(
    track(new THREE.PlaneGeometry(1200, 1200)),
    track(new THREE.MeshStandardMaterial({ color: GROUND, roughness: 1 })),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new THREE.GridHelper(1200, 240, '#1E3A5F', '#15253B');
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.55;
  grid.position.y = 0.01;
  track(grid.geometry);
  track(grid.material as THREE.Material);
  scene.add(grid);

  // Route: a dim full-length tube, a bright tube drawn up to the comet, and a soft glow under both.
  const { points, toScene } = project(coords);
  const lifted = resample(points, ROUTE_SAMPLES).map((p) => p.setY(0.4));
  const curve = new THREE.CatmullRomCurve3(lifted, false, 'centripetal');
  const routeColor = new THREE.Color(colors.routeActive);

  const dimTube = new THREE.Mesh(
    track(new THREE.TubeGeometry(curve, TUBE_SEGMENTS, 0.3, TUBE_RADIAL, false)),
    track(new THREE.MeshStandardMaterial({ color: routeColor, emissive: routeColor, emissiveIntensity: 0.25, transparent: true, opacity: 0.55 })),
  );
  scene.add(dimTube);

  const litGeometry = track(new THREE.TubeGeometry(curve, TUBE_SEGMENTS, 0.42, TUBE_RADIAL, false));
  const litIndexCount = litGeometry.index?.count ?? 0;
  const litTube = new THREE.Mesh(
    litGeometry,
    track(new THREE.MeshStandardMaterial({ color: '#7FF5E8', emissive: routeColor, emissiveIntensity: 1.1 })),
  );
  scene.add(litTube);

  const glow = new THREE.Mesh(
    track(new THREE.TubeGeometry(curve, TUBE_SEGMENTS, 1.4, TUBE_RADIAL, false)),
    track(new THREE.MeshBasicMaterial({ color: routeColor, transparent: true, opacity: 0.12, depthWrite: false })),
  );
  scene.add(glow);

  const comet = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.8, 20, 16)),
    track(new THREE.MeshBasicMaterial({ color: '#E9FFFC' })),
  );
  const cometLight = new THREE.PointLight('#5FF2E0', 60, 30, 1.6);
  comet.add(cometLight);
  scene.add(comet);

  // Beacons: a thin light pillar with a glowing cap. Top landmarks stand taller in their medal color.
  const pillarGeometry = track(new THREE.CylinderGeometry(0.1, 0.1, 1, 8));
  const capGeometry = track(new THREE.SphereGeometry(1, 16, 12));
  const ringGeometry = track(new THREE.RingGeometry(1.4, 1.8, 40));
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const materialFor = (color: string) => {
    if (!materials.has(color)) {
      const c = new THREE.Color(color);
      materials.set(color, track(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7 })));
    }
    return materials.get(color)!;
  };
  /** Top landmarks, with the parts that react when the comet highlights them. */
  const topPois: { poi: TripPoi; at: THREE.Vector3; cap: THREE.Mesh; ring: THREE.Mesh; glow: number }[] = [];

  const addBeacon = (at: THREE.Vector3, color: string, height: number, cap: number) => {
    const material = materialFor(color);
    const pillar = new THREE.Mesh(pillarGeometry, material);
    pillar.scale.y = height;
    pillar.position.set(at.x, height / 2, at.z);
    const top = new THREE.Mesh(capGeometry, material);
    top.scale.setScalar(cap);
    top.position.set(at.x, height, at.z);
    scene.add(pillar, top);
    return top;
  };

  for (const poi of pois) {
    const at = toScene(poi);
    if (poi.topRank) {
      const color = TOP_LANDMARK_COLOR[poi.topRank];
      const cap = addBeacon(at, color, 9 - poi.topRank, TOP_CAP_SCALE);
      const ring = new THREE.Mesh(
        ringGeometry,
        track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(at.x, 0.05, at.z);
      scene.add(ring);
      topPois.push({ poi, at, cap, ring, glow: 0 });
    } else {
      addBeacon(at, getPoiCategory(poi).color, poi.kind === 'food' ? 1.4 : 2.2, 0.32);
    }
  }

  const start = lifted[0];
  const end = lifted[lifted.length - 1];
  addBeacon(start, '#FFFFFF', 3, 0.6);
  addBeacon(end, '#FFFFFF', 11, 1.1);

  // Camera, with a black plane in front of it for the loop's fade.
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
  const fade = new THREE.Mesh(
    track(new THREE.PlaneGeometry(10, 10)),
    track(new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 1, depthTest: false, fog: false })),
  );
  fade.position.z = -0.5;
  fade.renderOrder = 999;
  camera.add(fade);
  scene.add(camera);

  const box = new THREE.Box3().setFromPoints(lifted);
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(40, box.getSize(new THREE.Vector3()).length() / 2);
  const orbitAngle0 = Math.atan2(start.z - center.z, start.x - center.x) + Math.PI * 0.75;

  const orbitShot = (t: number) => {
    const angle = orbitAngle0 + t * 0.35;
    return {
      position: new THREE.Vector3(center.x + Math.cos(angle) * radius * 1.7, radius * 1.5, center.z + Math.sin(angle) * radius * 1.7),
      target: center.clone(),
    };
  };
  const followShot = (p: number) => {
    const here = curve.getPointAt(clamp01(p));
    const behind = curve.getPointAt(clamp01(p - 0.05));
    const ahead = curve.getPointAt(clamp01(p + 0.08));
    const back = behind.clone().sub(here).setY(0).normalize().multiplyScalar(18);
    return { position: here.clone().add(back).setY(16), target: ahead.setY(0) };
  };
  const finaleShot = (t: number) => {
    const away = end.clone().sub(center).setY(0).normalize();
    return {
      position: end.clone().add(away.multiplyScalar(25 + t * 20)).setY(20 + t * 45),
      target: end.clone().lerp(center, 0.4 * t),
    };
  };

  const camPos = orbitShot(0).position;
  const camTarget = center.clone();
  camera.position.copy(camPos);
  let lastLoop = -1;

  const update = (elapsed: number, dt: number): TripPoi | null => {
    const loop = Math.floor(elapsed / LOOP_SECONDS);
    const t = elapsed % LOOP_SECONDS;

    let shot;
    let progress;
    if (t < ORBIT_END) {
      shot = orbitShot(t);
      progress = 0;
    } else if (t < FLY_END) {
      progress = ease((t - ORBIT_END) / (FLY_END - ORBIT_END));
      shot = followShot(progress);
    } else {
      progress = 1;
      shot = finaleShot(ease((t - FLY_END) / (LOOP_SECONDS - FLY_END)));
    }

    // Snap on a new loop (hidden by the fade); otherwise ease toward the shot for smooth, weighty moves.
    if (loop !== lastLoop) {
      camPos.copy(shot.position);
      camTarget.copy(shot.target);
      lastLoop = loop;
    } else {
      const k = 1 - Math.exp(-dt * 2.5);
      camPos.lerp(shot.position, k);
      camTarget.lerp(shot.target, k);
    }
    camera.position.copy(camPos);
    camera.lookAt(camTarget);

    comet.position.copy(curve.getPointAt(progress));
    comet.visible = t >= ORBIT_END - 0.5;
    // Tube indices run along the curve, so a draw range "draws" the route up to the comet.
    litGeometry.setDrawRange(0, Math.floor((progress * litIndexCount) / (TUBE_RADIAL * 6)) * TUBE_RADIAL * 6);


    const fadeIn = clamp01(t / FADE_SECONDS);
    const fadeOut = clamp01((LOOP_SECONDS - t) / FADE_SECONDS);
    (fade.material as THREE.MeshBasicMaterial).opacity = 1 - Math.min(fadeIn, fadeOut);

    // The top landmark nearest the comet (while flying) is "highlighted": the app shows its
    // photo, and here its cap swells and its ring brightens and spreads.
    let passing: (typeof topPois)[number] | null = null;
    if (t >= ORBIT_END && t < FLY_END) {
      let nearest = HIGHLIGHT_RADIUS;
      for (const top of topPois) {
        const d = top.at.distanceTo(comet.position);
        if (d < nearest) {
          nearest = d;
          passing = top;
        }
      }
    }
    const pulse = 1 + 0.25 * Math.sin(elapsed * 3);
    const k = 1 - Math.exp(-dt * 6);
    for (const top of topPois) {
      top.glow += ((top === passing ? 1 : 0) - top.glow) * k;
      top.cap.scale.setScalar(TOP_CAP_SCALE * (1 + 0.7 * top.glow));
      top.ring.scale.setScalar(pulse * (1 + 1.2 * top.glow));
      (top.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.4 * top.glow;
    }
    return passing?.poi ?? null;
  };

  return {
    update,
    render: (renderer) => renderer.render(scene, camera),
    resize: (width, height) => {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
