import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { setApiBaseUrl } from '@/api/client';
import { defaultApiBaseUrl, TOUR } from '@/config';

export interface AppSettings {
  /** Base URL of the Express server in `server/`. */
  apiBaseUrl: string;
  /** Skip the server and use src/api/mock data. */
  useMockData: boolean;
  /** Passed to POST /route. Lower means more POIs but more Places API calls. */
  sampleIntervalMeters: number;
  searchRadiusMeters: number;
  /** Passed to POST /route. Extra minutes the scenic route may cost over the fastest one. 0 = automatic (5 min + 20% of the trip). */
  maxExtraMinutes: number;
  /** Drive a fake position along the route instead of using GPS. */
  simulateDrive: boolean;
  simulatedSpeedMps: number;
  triggerRadiusMeters: number;
  /** Mute toggles, separate for landmarks and food stops. */
  narrateLandmarks: boolean;
  narrateFood: boolean;
  /** Read lines aloud with expo-speech when there is no server audio. Off = caption only. */
  useDeviceVoice: boolean;
}

// In-memory only: settings reset on app reload. Swap in AsyncStorage/SecureStore
// here if they should persist.
export const DEFAULT_SETTINGS: AppSettings = {
  apiBaseUrl: defaultApiBaseUrl(),
  useMockData: false,
  sampleIntervalMeters: 1200,
  searchRadiusMeters: 500,
  maxExtraMinutes: 0,
  simulateDrive: true,
  simulatedSpeedMps: 20,
  triggerRadiusMeters: TOUR.triggerRadiusMeters,
  narrateLandmarks: true,
  narrateFood: true,
  useDeviceVoice: true,
};

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    if (patch.apiBaseUrl !== undefined) setApiBaseUrl(patch.apiBaseUrl);
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setApiBaseUrl(DEFAULT_SETTINGS.apiBaseUrl);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings }),
    [settings, updateSettings, resetSettings],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
