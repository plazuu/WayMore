import type { Narration, RouteMode, RouteResponse } from '@/api/types';

/**
 * The home screen is one map with a bottom sheet whose content depends on the
 * phase, like a ride-hailing app:
 *
 *   idle ──openPlanner──▶ planning ──request──▶ loading ──success──▶ preview ──startTour──▶ touring
 *                           ▲                      │                   │                     │
 *                           └──── editTrip ◀── failure (error) ◀───────┘                     │
 *   idle ◀──────────────────────────────── reset / endTrip ◀─────────────────────────────────┘
 */
export type TripPhase = 'idle' | 'planning' | 'loading' | 'error' | 'preview' | 'touring';

export type PoiFilter = 'all' | 'landmarks' | 'food';

export interface TripState {
  phase: TripPhase;
  start: string;
  end: string;
  route: RouteResponse | null;
  mode: RouteMode;
  filter: PoiFilter;
  selectedPoiId: string | null;
  error: string | null;
  /** Narration per POI id, filled once the tour starts. */
  narrations: Record<string, Narration>;
  narrationsReady: boolean;
}

export const initialTripState: TripState = {
  phase: 'idle',
  start: '',
  end: '',
  route: null,
  mode: 'scenic',
  filter: 'all',
  selectedPoiId: null,
  error: null,
  narrations: {},
  narrationsReady: false,
};

export type TripAction =
  | { type: 'openPlanner' }
  | { type: 'editTrip' }
  | { type: 'request'; start: string; end: string }
  | { type: 'success'; route: RouteResponse }
  | { type: 'failure'; error: string }
  | { type: 'setMode'; mode: RouteMode }
  | { type: 'setFilter'; filter: PoiFilter }
  | { type: 'selectPoi'; id: string | null }
  | { type: 'startTour' }
  | { type: 'narrationsLoaded'; narrations: Record<string, Narration> }
  | { type: 'endTour' }
  | { type: 'reset' };

export function tripReducer(state: TripState, action: TripAction): TripState {
  switch (action.type) {
    case 'openPlanner':
      return { ...state, phase: 'planning', error: null };
    case 'editTrip':
      return { ...state, phase: 'planning', route: null, selectedPoiId: null, error: null };
    case 'request':
      return { ...state, phase: 'loading', start: action.start, end: action.end, error: null, route: null };
    case 'success':
      return { ...state, phase: 'preview', route: action.route, mode: 'scenic', filter: 'all', selectedPoiId: null };
    case 'failure':
      return { ...state, phase: 'error', error: action.error };
    case 'setMode':
      return { ...state, mode: action.mode, selectedPoiId: null };
    case 'setFilter':
      return { ...state, filter: action.filter, selectedPoiId: null };
    case 'selectPoi':
      return { ...state, selectedPoiId: action.id };
    case 'startTour':
      return { ...state, phase: 'touring', selectedPoiId: null, narrations: {}, narrationsReady: false };
    case 'narrationsLoaded':
      return { ...state, narrations: action.narrations, narrationsReady: true };
    case 'endTour':
      return { ...state, phase: 'preview', narrations: {}, narrationsReady: false };
    case 'reset':
      return initialTripState;
  }
}
