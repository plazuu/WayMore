import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';

import { planRoute, prepareNarrations } from '@/services/tripService';

import { useSettings, type AppSettings } from './SettingsContext';
import { getTripPois } from './selectors';
import { initialTripState, tripReducer, type PoiFilter, type TripState } from './tripReducer';

import type { RouteMode } from '@/api/types';

interface TripActions {
  openPlanner: () => void;
  editTrip: () => void;
  findRoute: (start: string, end: string, overrides?: Partial<AppSettings>) => Promise<void>;
  /** Re-runs the last search. `overrides` apply to this request only (settings state updates on the next render). */
  retry: (overrides?: Partial<AppSettings>) => void;
  setMode: (mode: RouteMode) => void;
  setFilter: (filter: PoiFilter) => void;
  selectPoi: (id: string | null) => void;
  startTour: () => void;
  endTour: () => void;
  reset: () => void;
}

const TripContext = createContext<{ state: TripState; actions: TripActions } | null>(null);

export function TripProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(tripReducer, initialTripState);
  const { settings } = useSettings();

  // Refs so async callbacks always see the latest values without re-creating actions.
  const stateRef = useRef(state);
  stateRef.current = state;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Incremented per request so a slow, superseded response is ignored.
  const requestIdRef = useRef(0);

  const findRoute = useCallback(async (start: string, end: string, overrides?: Partial<AppSettings>) => {
    const requestId = ++requestIdRef.current;
    dispatch({ type: 'request', start, end });
    try {
      const route = await planRoute(start, end, { ...settingsRef.current, ...overrides });
      if (requestId === requestIdRef.current) dispatch({ type: 'success', route });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      dispatch({ type: 'failure', error: error instanceof Error ? error.message : 'Something went wrong.' });
    }
  }, []);

  const startTour = useCallback(() => {
    const { route, mode } = stateRef.current;
    if (!route) return;
    dispatch({ type: 'startTour' });
    prepareNarrations(getTripPois(route[mode], 'all'), settingsRef.current).then((narrations) => {
      if (stateRef.current.phase === 'touring') dispatch({ type: 'narrationsLoaded', narrations });
    });
  }, []);

  const actions = useMemo<TripActions>(
    () => ({
      openPlanner: () => dispatch({ type: 'openPlanner' }),
      editTrip: () => {
        requestIdRef.current++;
        dispatch({ type: 'editTrip' });
      },
      findRoute,
      retry: (overrides) => findRoute(stateRef.current.start, stateRef.current.end, overrides),
      setMode: (mode) => dispatch({ type: 'setMode', mode }),
      setFilter: (filter) => dispatch({ type: 'setFilter', filter }),
      selectPoi: (id) => dispatch({ type: 'selectPoi', id }),
      startTour,
      endTour: () => dispatch({ type: 'endTour' }),
      reset: () => {
        requestIdRef.current++;
        dispatch({ type: 'reset' });
      },
    }),
    [findRoute, startTour],
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used inside TripProvider');
  return ctx;
}
