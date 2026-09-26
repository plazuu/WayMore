import { apiRequest } from './client';
import type { AddressSuggestion, Narration, NarrationPlace, RouteResponse, RouteTuning } from './types';

// One function per server endpoint. No app logic here; see src/services for that.

export function getHealth() {
  return apiRequest<{ status: string }>('/health', { timeoutMs: 5_000 });
}

/** Address-autocomplete suggestions as the user types. Pass the same `sessionToken` for
 * every keystroke of one search (Google bills per session when it's reused consistently). */
export function getAutocomplete(input: string, sessionToken?: string) {
  return apiRequest<{ suggestions: AddressSuggestion[] }>('/autocomplete', {
    query: { input, sessionToken },
    timeoutMs: 10_000,
  });
}

/** Both the fastest and most scenic route in one call. Can take a while: it runs many Places searches. */
export function postRoute(start: string, end: string, tuning: RouteTuning = {}) {
  return apiRequest<RouteResponse>('/route', {
    method: 'POST',
    body: { start, end },
    query: { ...tuning },
    timeoutMs: 90_000,
  });
}

/** Returns one Narration per place, in the same order. Max 100 places per call. */
export function postNarrationPregenerate(places: NarrationPlace[]) {
  return apiRequest<Narration[]>('/narration/pregenerate', {
    method: 'POST',
    body: { places },
    timeoutMs: 120_000,
  });
}

export function postNarration(place: NarrationPlace) {
  return apiRequest<Narration>('/narration', { method: 'POST', body: place, timeoutMs: 30_000 });
}
