import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/api/client';
import { postTourChat, postTourEnd, postTourStart } from '@/api/endpoints';
import { CHAT } from '@/config';
import { toNarrationPlace } from '@/features/tour/narrationText';

import type { ChatRide, ChatSource, TripPoi } from '@/api/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'guide';
  text: string;
  sources?: ChatSource[];
  /** Name of the route place the reply is about, when the server matched one. */
  placeName?: string;
  /** Local error line (server unreachable), styled differently from a real reply. */
  error?: boolean;
}

interface UseGuideChatOptions {
  /** True while touring. Turning it off ends the session and clears the conversation. */
  active: boolean;
  pois: TripPoi[];
  /** Optional: the tour's own live-guide session, if the app ever runs one. */
  sessionId?: string | null;
  /**
   * Current ride state, read when a question is sent. Without it the guide
   * doesn't know where the car is and may guess what has been passed.
   */
  getRide?: () => ChatRide;
}

const welcomeMessage = (): ChatMessage => ({ id: 'welcome', role: 'guide', text: CHAT.welcome });

let nextId = 0;
const newId = () => `m${++nextId}`;

/**
 * Passenger chat with the guide (POST /tour/chat). Separate from the narration
 * loop: the tour plays pregenerated lines and never opens a live-guide session,
 * so this hook starts its own (POST /tour/start with the route's places) on the
 * first question. It sends no ticks, so the backend generates no narration for it;
 * instead each question carries the ride state (position, places reached, recent lines).
 */
export function useGuideChat({ active, pois, sessionId: externalSessionId, getRide }: UseGuideChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeMessage()]);
  const [sending, setSending] = useState(false);

  const poisRef = useRef(pois);
  poisRef.current = pois;
  const getRideRef = useRef(getRide);
  getRideRef.current = getRide;
  const sessionRef = useRef<string | null>(null);
  // Bumped when the tour ends so late replies from the old trip are dropped.
  const generationRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    return () => {
      generationRef.current++;
      const id = sessionRef.current;
      sessionRef.current = null;
      if (id) postTourEnd(id).catch(() => {});
      setMessages([welcomeMessage()]);
      setSending(false);
    };
  }, [active]);

  const startSession = useCallback(async () => {
    const places = poisRef.current.slice(0, CHAT.maxSessionPlaces).map(toNarrationPlace);
    const { sessionId } = await postTourStart(places);
    sessionRef.current = sessionId;
    return sessionId;
  }, []);

  const ask = useCallback(
    async (message: string) => {
      let sessionId = externalSessionId ?? sessionRef.current ?? (await startSession());
      const ride = getRideRef.current?.();
      try {
        return await postTourChat(sessionId, message, ride);
      } catch (error) {
        // Server restarted or session idled out: start over once with the same places.
        if (!(error instanceof ApiError && error.status === 404)) throw error;
        sessionId = await startSession();
        return postTourChat(sessionId, message, ride);
      }
    },
    [externalSessionId, startSession],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, CHAT.maxMessageChars);
      if (!text || sending || !active) return;
      const generation = generationRef.current;
      setMessages((prev) => [...prev, { id: newId(), role: 'user', text }]);
      setSending(true);

      let reply: ChatMessage;
      try {
        const res = await ask(text);
        const place = res.placeId ? poisRef.current.find((p) => p.id === res.placeId) : undefined;
        reply = { id: newId(), role: 'guide', text: res.reply, sources: res.sources, placeName: place?.name };
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Something went wrong.';
        reply = { id: newId(), role: 'guide', text: `I couldn't reach the guide. ${detail}`, error: true };
      }
      if (generation !== generationRef.current) return;
      setMessages((prev) => [...prev, reply]);
      setSending(false);
    },
    [active, ask, sending],
  );

  return { messages, sending, send };
}

export type GuideChat = ReturnType<typeof useGuideChat>;
