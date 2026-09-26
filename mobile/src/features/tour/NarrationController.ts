import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

import type { Narration, TripPoi } from '@/api/types';

export interface NarrationItem {
  poi: TripPoi;
  narration: Narration;
  enqueuedAt: number;
}

export interface NarrationSnapshot {
  current: NarrationItem | null;
  queueLength: number;
  paused: boolean;
}

interface NarrationControllerOptions {
  /** Drop queued clips that waited longer than this: the place is already behind you. */
  maxQueueWaitMs: number;
  /** Extra time past `durationHintS` before a stuck clip is given up on. */
  playbackGraceMs: number;
  /** Turns a server-relative `audioUrl` into a full URL. */
  resolveAudioUrl: (path: string) => string;
  /** When there is no audio: true = read aloud with expo-speech, false = caption only. */
  useDeviceVoice: () => boolean;
}

/**
 * Plays narration one clip at a time, never overlapping, following the rules in
 * docs/narration-api.md. Plain class (not a hook) so the future dialog agent can
 * call `pause()` / `resume()` from anywhere.
 *
 * Playback order per clip: server MP3 -> device TTS -> on-screen caption only.
 * The caption (`current.narration.text`) is exposed for every mode.
 */
export class NarrationController {
  private queue: NarrationItem[] = [];
  private current: NarrationItem | null = null;
  private paused = false;
  private player: AudioPlayer | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(snapshot: NarrationSnapshot) => void>();

  constructor(private readonly options: NarrationControllerOptions) {}

  subscribe(listener: (snapshot: NarrationSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  enqueue(poi: TripPoi, narration: Narration) {
    this.queue.push({ poi, narration, enqueuedAt: Date.now() });
    this.emit();
    this.playNext();
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.clearWatchdog();
    if (this.player) {
      this.player.pause();
    } else if (this.current) {
      // Speech/caption can't be paused mid-line; replay the line on resume.
      Speech.stop();
      this.queue.unshift({ ...this.current, enqueuedAt: Date.now() });
      this.current = null;
    }
    this.emit();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.player && this.current) {
      this.player.play();
      this.armWatchdog(this.current);
    } else {
      this.playNext();
    }
    this.emit();
  }

  /** Stops playback and clears the queue. Call when the tour ends. */
  stop() {
    this.queue = [];
    this.current = null;
    this.paused = false;
    this.releasePlayer();
    this.clearWatchdog();
    Speech.stop();
    this.emit();
  }

  private playNext() {
    if (this.current || this.paused) return;
    let item: NarrationItem | undefined;
    while ((item = this.queue.shift()) && Date.now() - item.enqueuedAt > this.options.maxQueueWaitMs) {
      // stale: the place is already behind us
    }
    if (!item) {
      this.emit();
      return;
    }
    this.current = item;
    this.emit();
    this.play(item);
  }

  private play(item: NarrationItem) {
    const done = () => this.finish(item);
    this.armWatchdog(item);

    const { audioUrl, text } = item.narration;
    if (audioUrl) {
      try {
        const player = createAudioPlayer(this.options.resolveAudioUrl(audioUrl));
        player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) done();
        });
        this.player = player;
        player.play();
        return;
      } catch (error) {
        console.warn('Audio playback failed; falling back.', error);
        this.releasePlayer();
      }
    }

    if (this.options.useDeviceVoice()) {
      Speech.speak(text, { onDone: done, onError: done });
    }
    // Caption-only: the watchdog finishes the item after its duration hint.
  }

  private finish(item: NarrationItem) {
    if (this.current !== item) return;
    this.releasePlayer();
    this.clearWatchdog();
    this.current = null;
    this.playNext();
  }

  private armWatchdog(item: NarrationItem) {
    this.clearWatchdog();
    const isCaptionOnly = !item.narration.audioUrl && !this.options.useDeviceVoice();
    const ms = item.narration.durationHintS * 1000 + (isCaptionOnly ? 0 : this.options.playbackGraceMs);
    this.watchdog = setTimeout(() => this.finish(item), ms);
  }

  private clearWatchdog() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  private releasePlayer() {
    this.player?.remove();
    this.player = null;
  }

  private snapshot(): NarrationSnapshot {
    return { current: this.current, queueLength: this.queue.length, paused: this.paused };
  }

  private emit() {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
