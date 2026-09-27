import { setAudioModeAsync } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';

import { resolveServerUrl } from '@/api/client';
import { TOUR } from '@/config';
import { fetchNarrations, receivedNarration } from '@/services/tripService';
import type { AppSettings } from '@/state/SettingsContext';

import { NarrationController, type NarrationSnapshot } from './NarrationController';
import { localNarration } from './narrationText';
import { findNextPoi, findPrefetchPois, findTriggeredPois, relativeSide, type Position } from './proximity';

import type { TripPoi } from '@/api/types';

interface UseTourGuideOptions {
  active: boolean;
  pois: TripPoi[];
  position: Position | null;
  settings: AppSettings;
}

const isMuted = (poi: TripPoi, settings: AppSettings) => (poi.kind === 'food' ? !settings.narrateFood : !settings.narrateLandmarks);

/**
 * Ties position -> proximity -> narration queue together for the live tour.
 * Each POI triggers once; muted kinds are still marked visited so they don't
 * fire later when unmuted.
 *
 * Server narration (line + voice) is fetched as POIs come within
 * TOUR.prefetchRadiusMeters, a small batch at a time, nearest first. Asking for
 * the whole route at once took minutes on long routes (the voice is generated
 * one clip at a time), so places reached before it finished played the device
 * voice. A POI reached before its clip arrives plays a local line.
 */
export function useTourGuide({ active, pois, position, settings }: UseTourGuideOptions) {
  const controllerRef = useRef<NarrationController | null>(null);
  const visitedRef = useRef(new Set<string>());
  // Last few lines sent to the speaker, for the chat's ride context.
  const recentRef = useRef<{ placeId: string; text: string }[]>([]);
  const [visitedCount, setVisitedCount] = useState(0);
  const [snapshot, setSnapshot] = useState<NarrationSnapshot>({ current: null, queueLength: 0, paused: false });
  // POIs asked for this tour (or in flight). Arrived ones are in receivedNarration.
  const requestedRef = useRef(new Set<string>());
  // Set while a tour is active; asks for the next batch if none is in flight.
  const prefetchRef = useRef<(() => void) | null>(null);
  const [fetchingNarration, setFetchingNarration] = useState(false);

  // Latest values for callbacks, read through refs so the tour effects do not restart on every change.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const positionRef = useRef(position);
  positionRef.current = position;
  const poisRef = useRef(pois);
  poisRef.current = pois;

  useEffect(() => {
    if (!active) return;
    // Otherwise iOS mutes the narration MP3s while the ring/silent switch is on.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    const controller = new NarrationController({
      maxQueueWaitMs: TOUR.maxQueueWaitMs,
      playbackGraceMs: TOUR.playbackGraceMs,
      resolveAudioUrl: resolveServerUrl,
      useDeviceVoice: () => settingsRef.current.useDeviceVoice,
    });
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(setSnapshot);

    let cancelled = false;
    let fetching = false;
    let retryAt = 0;
    const prefetch = () => {
      const current = positionRef.current;
      if (cancelled || fetching || !current || Date.now() < retryAt) return;
      const batch = findPrefetchPois(
        current,
        poisRef.current,
        (poi) =>
          requestedRef.current.has(poi.id) ||
          // Reached POIs still waiting in the queue can get their voice in time.
          (visitedRef.current.has(poi.id) && !controller.isQueued(poi.id)) ||
          receivedNarration(poi.id) !== undefined ||
          isMuted(poi, settingsRef.current),
        TOUR.prefetchRadiusMeters,
      ).slice(0, TOUR.prefetchBatchSize);
      if (batch.length === 0) return;

      for (const poi of batch) requestedRef.current.add(poi.id);
      fetching = true;
      setFetchingNarration(true);
      fetchNarrations(batch)
        .then((narrations) => {
          if (cancelled) return;
          // POIs reached before their clip arrived may still be waiting in the queue.
          for (const n of narrations) if (n.audioUrl) controller.upgrade(n.placeId, n);
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn('Narration fetch failed; using local lines for now.', error);
          for (const poi of batch) requestedRef.current.delete(poi.id);
          retryAt = Date.now() + TOUR.prefetchRetryMs;
        })
        .finally(() => {
          if (cancelled) return;
          fetching = false;
          setFetchingNarration(false);
          prefetch();
        });
    };
    prefetchRef.current = prefetch;

    return () => {
      cancelled = true;
      prefetchRef.current = null;
      unsubscribe();
      controller.stop();
      controllerRef.current = null;
      visitedRef.current = new Set();
      recentRef.current = [];
      requestedRef.current = new Set();
      setVisitedCount(0);
      setFetchingNarration(false);
    };
  }, [active]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!active || !position || !controller) return;
    prefetchRef.current?.();

    const triggered = findTriggeredPois(position, pois, visitedRef.current, settingsRef.current.triggerRadiusMeters);
    if (triggered.length === 0) return;
    for (const poi of triggered) {
      visitedRef.current.add(poi.id);
      if (isMuted(poi, settingsRef.current)) continue;
      // Server lines are generated without a side, so fresh local lines can say left/right.
      const narration = receivedNarration(poi.id) ?? localNarration(poi, relativeSide(position, poi));
      controller.enqueue(poi, narration);
      recentRef.current = [...recentRef.current, { placeId: poi.id, text: narration.text }].slice(-3);
    }
    setVisitedCount(visitedRef.current.size);
  }, [active, position, pois]);

  const next = useMemo(
    () => (position ? findNextPoi(position, pois, visitedRef.current) : null),
    // visitedCount is a proxy for visitedRef changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position, pois, visitedCount],
  );

  return {
    current: snapshot.current,
    queueLength: snapshot.queueLength,
    paused: snapshot.paused,
    next,
    visitedCount,
    total: pois.length,
    /** A batch of server narration is being generated. */
    fetchingNarration,
    pause: () => controllerRef.current?.pause(),
    resume: () => controllerRef.current?.resume(),
    /** Places the car has reached so far (narrated or muted). */
    passedPlaceIds: () => [...visitedRef.current],
    recentNarrations: () => recentRef.current,
  };
}

export type TourGuide = ReturnType<typeof useTourGuide>;
