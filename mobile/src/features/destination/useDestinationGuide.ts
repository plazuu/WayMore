import { useCallback, useEffect, useRef, useState } from 'react';

import { postGuideDestination } from '@/api/endpoints';
import { DEFAULT_MAP_REGION } from '@/config';
import { getCurrentLocation } from '@/features/location/currentLocation';

import type { GuideChip, GuideDestination, GuidePlaceCard, GuideRequest, LatLng } from '@/api/types';

export interface DestinationGuideMessage {
  id: string;
  role: 'user' | 'guide';
  text: string;
  error?: boolean;
}

interface UseDestinationGuideOptions {
  /** A conversation starts when this turns true and is thrown away when it turns false. */
  active: boolean;
  /** Called once the guide has set a destination. */
  onDestination: (destination: GuideDestination) => void;
}

const nextId = (() => {
  let n = 0;
  return () => `g${++n}`;
})();

/**
 * The "Where to?" guide's conversation (POST /guide/destination). The server
 * owns the flow; this keeps the transcript and the latest chips and place
 * cards, and sends taps and typed text. See docs/destination-guide-api.md.
 */
export function useDestinationGuide({ active, onDestination }: UseDestinationGuideOptions) {
  const [messages, setMessages] = useState<DestinationGuideMessage[]>([]);
  const [chips, setChips] = useState<GuideChip[]>([]);
  const [places, setPlaces] = useState<GuidePlaceCard[]>([]);
  const [sending, setSending] = useState(false);

  const conversationIdRef = useRef<string | undefined>(undefined);
  const locationRef = useRef<LatLng | null>(null);
  const sendingRef = useRef(false);
  // Bumped per conversation so a reply that lands after closing is ignored.
  const generationRef = useRef(0);
  const onDestinationRef = useRef(onDestination);
  onDestinationRef.current = onDestination;

  const exchange = useCallback(async (userText: string | null, body: Omit<GuideRequest, 'lat' | 'lng'>) => {
    if (sendingRef.current) return;
    const generation = generationRef.current;
    sendingRef.current = true;
    setSending(true);
    if (userText) setMessages((m) => [...m, { id: nextId(), role: 'user', text: userText }]);
    // Old chips and cards must not stay tappable while the next answer is on its way.
    setChips([]);
    setPlaces([]);

    try {
      // Located once per conversation; the map's default center if there's no permission or fix.
      locationRef.current ??= (await getCurrentLocation()) ?? {
        latitude: DEFAULT_MAP_REGION.latitude,
        longitude: DEFAULT_MAP_REGION.longitude,
      };
      const { latitude: lat, longitude: lng } = locationRef.current;
      const res = await postGuideDestination({ conversationId: conversationIdRef.current, ...body, lat, lng });
      if (generation !== generationRef.current) return;
      conversationIdRef.current = res.conversationId;
      setMessages((m) => [...m, { id: nextId(), role: 'guide', text: res.reply }]);
      setChips(res.chips);
      setPlaces(res.places);
      if (res.destination) onDestinationRef.current(res.destination);
    } catch {
      if (generation !== generationRef.current) return;
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'guide', text: "I can't reach the guide right now. Try again in a moment.", error: true },
      ]);
      // Starting over is always safe: the server greets unknown conversations.
      setChips([{ id: 'restart', label: 'Try again' }]);
    } finally {
      if (generation === generationRef.current) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    exchange(null, {});
    return () => {
      generationRef.current++;
      conversationIdRef.current = undefined;
      locationRef.current = null;
      sendingRef.current = false;
      setMessages([]);
      setChips([]);
      setPlaces([]);
      setSending(false);
    };
  }, [active, exchange]);

  return {
    messages,
    chips,
    places,
    sending,
    send: (text: string) => {
      const trimmed = text.trim();
      if (trimmed) exchange(trimmed, { message: trimmed });
    },
    tapChip: (chip: GuideChip) => exchange(chip.label, { choice: { chipId: chip.id } }),
    tapPlace: (place: GuidePlaceCard) => exchange(place.name, { choice: { placeId: place.placeId } }),
  };
}

export type DestinationGuide = ReturnType<typeof useDestinationGuide>;
