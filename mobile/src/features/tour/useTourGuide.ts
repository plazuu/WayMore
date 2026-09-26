import { setAudioModeAsync } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';

import { resolveServerUrl } from '@/api/client';
import { TOUR } from '@/config';
import type { AppSettings } from '@/state/SettingsContext';

import { NarrationController, type NarrationSnapshot } from './NarrationController';
import { localNarration } from './narrationText';
import { findNextPoi, findTriggeredPois, relativeSide, type Position } from './proximity';

import type { Narration, TripPoi } from '@/api/types';

interface UseTourGuideOptions {
  active: boolean;
  pois: TripPoi[];
  narrations: Record<string, Narration>;
  position: Position | null;
  settings: AppSettings;
}

/**
 * Ties position -> proximity -> narration queue together for the live tour.
 * Each POI triggers once; muted kinds are still marked visited so they don't
 * fire later when unmuted.
 */
export function useTourGuide({ active, pois, narrations, position, settings }: UseTourGuideOptions) {
  const controllerRef = useRef<NarrationController | null>(null);
  const visitedRef = useRef(new Set<string>());
  // Last few lines sent to the speaker, for the chat's ride context.
  const recentRef = useRef<{ placeId: string; text: string }[]>([]);
  const [visitedCount, setVisitedCount] = useState(0);
  const [snapshot, setSnapshot] = useState<NarrationSnapshot>({ current: null, queueLength: 0, paused: false });

  // Latest values for callbacks, read through refs so the tour effects do not restart on every change.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const narrationsRef = useRef(narrations);
  narrationsRef.current = narrations;

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
    return () => {
      unsubscribe();
      controller.stop();
      controllerRef.current = null;
      visitedRef.current = new Set();
      recentRef.current = [];
      setVisitedCount(0);
    };
  }, [active]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!active || !position || !controller) return;
    const { triggerRadiusMeters, narrateLandmarks, narrateFood } = settingsRef.current;

    const triggered = findTriggeredPois(position, pois, visitedRef.current, triggerRadiusMeters);
    if (triggered.length === 0) return;
    for (const poi of triggered) {
      visitedRef.current.add(poi.id);
      const muted = poi.kind === 'food' ? !narrateFood : !narrateLandmarks;
      if (muted) continue;
      // Server lines are generated without a side, so fresh local lines can say left/right.
      const narration = narrationsRef.current[poi.id] ?? localNarration(poi, relativeSide(position, poi));
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
    pause: () => controllerRef.current?.pause(),
    resume: () => controllerRef.current?.resume(),
    /** Places the car has reached so far (narrated or muted). */
    passedPlaceIds: () => [...visitedRef.current],
    recentNarrations: () => recentRef.current,
  };
}

export type TourGuide = ReturnType<typeof useTourGuide>;
