import * as Location from 'expo-location';

import { CURRENT_LOCATION_LABEL } from '@/config';

import type { LatLng } from '@/api/types';

/** True when a start/end field holds the "Current location" placeholder rather than an address. */
export function isCurrentLocationLabel(text: string | undefined): boolean {
  return (text ?? '').trim().toLowerCase() === CURRENT_LOCATION_LABEL.toLowerCase();
}

/**
 * True only when the user has already said no to location access. Doesn't prompt,
 * so it's safe to call before deciding whether to offer "Current location".
 */
export async function isLocationDenied(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === Location.PermissionStatus.DENIED;
  } catch {
    return false;
  }
}

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
