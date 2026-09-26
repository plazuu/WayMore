import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { TOUR } from '@/config';
import { pathLengthMeters, pointAlongPath } from '@/lib/geo';

import type { Position } from './proximity';
import type { LatLng } from '@/api/types';

interface UsePositionOptions {
  enabled: boolean;
  /** Fake a drive along `path` instead of using GPS (for emulators and demos). */
  simulate: boolean;
  path: LatLng[];
  simulatedSpeedMps: number;
}

/** The user's position during a tour, from GPS or a simulated drive. */
export function usePosition({ enabled, simulate, path, simulatedSpeedMps }: UsePositionOptions) {
  const device = useDevicePosition(enabled && !simulate);
  const simulated = useSimulatedPosition(enabled && simulate, path, simulatedSpeedMps);
  return simulate ? simulated : device;
}

interface PositionResult {
  position: Position | null;
  error: string | null;
}

function useDevicePosition(enabled: boolean): PositionResult {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | undefined;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setError('Location permission is needed to narrate places as you pass them.');
        return;
      }
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 10, timeInterval: 2000 },
        (location) => {
          const { latitude, longitude, heading } = location.coords;
          setPosition({
            coords: { latitude, longitude },
            heading: heading != null && heading >= 0 ? heading : null,
            timestamp: location.timestamp,
          });
        },
      );
      if (cancelled) subscription.remove();
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));

    return () => {
      cancelled = true;
      subscription?.remove();
      setPosition(null);
      setError(null);
    };
  }, [enabled]);

  return { position, error };
}

function useSimulatedPosition(enabled: boolean, path: LatLng[], speedMps: number): PositionResult {
  const [position, setPosition] = useState<Position | null>(null);

  useEffect(() => {
    if (!enabled || path.length < 2) return;
    const total = pathLengthMeters(path);
    let traveled = 0;

    const tick = () => {
      const { point, heading } = pointAlongPath(path, traveled);
      setPosition({ coords: point, heading, timestamp: Date.now() });
      traveled = Math.min(total, traveled + (speedMps * TOUR.simulatedTickMs) / 1000);
    };
    tick();
    const id = setInterval(tick, TOUR.simulatedTickMs);
    return () => {
      clearInterval(id);
      setPosition(null);
    };
  }, [enabled, path, speedMps]);

  return { position, error: null };
}
