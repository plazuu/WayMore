import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';

import { createGLRenderer } from '@/features/preview/glRenderer';
import { createRouteScene } from '@/features/preview/routeScene';
import { colors, radii, spacing } from '@/theme';

import { TOP_LANDMARK_COLOR } from '../poi/poiStyle';
import { Icon } from '../ui/Icon';

import type { LatLng, TripPoi } from '@/api/types';

interface RoutePreview3DProps {
  visible: boolean;
  onClose: () => void;
  coordinates: LatLng[];
  pois: TripPoi[];
  /** e.g. "Scenic route" */
  title: string;
  /** e.g. "24 min · 5.5 km to Wynwood Walls" */
  subtitle: string;
}

const CARD_ASPECT = 4 / 3;
/** Letterbox bars, as a share of the card height each, for the widescreen look. */
const BAR_SHARE = 0.11;

/** Small cinematic fly-through of the route in three.js, shown over the map. */
export function RoutePreview3D({ visible, onClose, ...content }: RoutePreview3DProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close 3D preview">
        {/* Swallow taps on the card so only the backdrop closes it. */}
        <Pressable onPress={() => {}}>
          <PreviewCard onClose={onClose} {...content} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PreviewCard({ onClose, coordinates, pois, title, subtitle }: Omit<RoutePreview3DProps, 'visible'>) {
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(screenWidth - spacing.lg * 2, 560);
  const height = width / CARD_ASPECT;
  const [passing, setPassing] = useState<TripPoi | null>(null);
  const frame = useRef<number | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      cleanup.current?.();
    },
    [],
  );

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    if (coordinates.length < 2) return;
    const renderer = createGLRenderer(gl);
    const scene = createRouteScene(coordinates, pois, gl.drawingBufferWidth / gl.drawingBufferHeight);
    cleanup.current = () => {
      scene.dispose();
      renderer.dispose();
    };

    const startedAt = performance.now();
    let last = startedAt;
    let lastPassingId: string | null = null;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = scene.update((now - startedAt) / 1000, dt);
      // Only touch React state when the caption actually changes, not every frame.
      if ((current?.id ?? null) !== lastPassingId) {
        lastPassingId = current?.id ?? null;
        setPassing(current);
      }
      scene.render(renderer);
      gl.endFrameEXP();
      frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
  };

  const barHeight = height * BAR_SHARE;

  return (
    <View style={[styles.card, { width, height }]}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />

      <View style={[styles.bar, styles.barTop, { height: barHeight }]}>
        <Text style={styles.title}>{title.toUpperCase()}</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close 3D preview">
          <Icon name="close" size={16} color={colors.textInverse} />
        </Pressable>
      </View>

      <View style={[styles.bar, styles.barBottom, { height: barHeight }]}>
        {passing?.topRank ? (
          <View style={styles.passing}>
            <View style={[styles.medal, { backgroundColor: TOP_LANDMARK_COLOR[passing.topRank] }]}>
              <Text style={styles.medalText}>{passing.topRank}</Text>
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {passing.name}
            </Text>
          </View>
        ) : (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#000',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  barTop: { top: 0, justifyContent: 'space-between' },
  barBottom: { bottom: 0 },
  title: { color: colors.textInverse, fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 14, flexShrink: 1 },
  passing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  medal: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  medalText: { color: colors.textInverse, fontSize: 12, fontWeight: '700' },
});
