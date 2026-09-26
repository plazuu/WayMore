import { apiRequest } from './client';
<<<<<<< HEAD
import type { ChatReply, ChatRide, Narration, NarrationPlace, RouteResponse, RouteTuning } from './types';
=======
import type { AddressSuggestion, Narration, NarrationPlace, RouteResponse, RouteTuning } from './types';
>>>>>>> origin/main

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

/** Starts a live-guide session; the chat uses it for ride context. At most 200 places. */
export function postTourStart(places: NarrationPlace[]) {
  return apiRequest<{ sessionId: string }>('/tour/start', { method: 'POST', body: { places }, timeoutMs: 15_000 });
}

/** Passenger question. 404 `unknown_session` means the session expired: start a new one and retry. */
export function postTourChat(sessionId: string, message: string, ride?: ChatRide) {
  return apiRequest<ChatReply>('/tour/chat', { method: 'POST', body: { sessionId, message, ride }, timeoutMs: 25_000 });
}

export function postTourEnd(sessionId: string) {
  return apiRequest<{ ok: boolean }>('/tour/end', { method: 'POST', body: { sessionId }, timeoutMs: 5_000 });
}
