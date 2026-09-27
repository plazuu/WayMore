import * as Location from 'expo-location';

import type { LatLng } from '@/api/types';

/**
 * The phone's position right now, for things that need it once (the "Where
 * to?" guide, "Current location" as a trip start). Null when permission is
 * denied or no fix arrives in time; callers fall back to something sensible.
 */
export async function getCurrentLocation(timeoutMs = 8_000): Promise<LatLng | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    // A recent cached fix is instant; a fresh one can take a few seconds indoors.
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 200 });
    const fix =
      recent ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]));
    return fix ? { latitude: fix.coords.latitude, longitude: fix.coords.longitude } : null;
  } catch {
    return null;
  }
}
