import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';

import { resolveServerUrl } from '@/api/client';
import { createGLRenderer } from '@/features/preview/glRenderer';
import { createRouteScene } from '@/features/preview/routeScene';
import { formatRating } from '@/lib/format';
import { colors, radii, spacing } from '@/theme';

import { getPoiCategory } from '../poi/poiCategory';
import { PoiPhoto } from '../poi/PoiPhoto';
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
/** The popup stays this long after the comet moves on, so it can be read. */
const POPUP_HOLD_MS = 1400;
const POPUP_PHOTO_WIDTH_PX = 400;

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

  // Warm the cache so each photo is ready by the time the comet reaches its landmark.
  useEffect(() => {
    for (const poi of pois) {
      if (poi.topRank && poi.photoUrl) {
        Image.prefetch(`${resolveServerUrl(poi.photoUrl)}&maxWidthPx=${POPUP_PHOTO_WIDTH_PX}`).catch(() => {});
      }
    }
  }, [pois]);

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

      <LandmarkPopup passing={passing} top={barHeight + spacing.sm} width={width * 0.44} />

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

/**
 * Photo card for the landmark the animation is highlighting. It springs in when
 * the comet reaches the landmark and lingers briefly after it passes.
 */
function LandmarkPopup({ passing, top, width }: { passing: TripPoi | null; top: number; width: number }) {
  // The last highlighted landmark stays as the content while the card animates out.
  const [shown, setShown] = useState<TripPoi | null>(null);
  const [open, setOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (passing) {
      setShown(passing);
      setOpen(true);
      return;
    }
    const timer = setTimeout(() => setOpen(false), POPUP_HOLD_MS);
    return () => clearTimeout(timer);
  }, [passing]);

  useEffect(() => {
    Animated.spring(progress, { toValue: open ? 1 : 0, useNativeDriver: true, speed: 14, bounciness: open ? 6 : 0 }).start();
  }, [open, progress]);

  if (!shown?.topRank) return null;
  const category = getPoiCategory(shown);
  const medal = TOP_LANDMARK_COLOR[shown.topRank];
  const rating = formatRating(shown.rating);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.popup,
        {
          top,
          width,
          borderColor: medal,
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
        },
      ]}
    >
      {/* Keyed so a new landmark's photo doesn't briefly show the previous one. */}
      <PoiPhoto key={shown.id} poi={shown} style={{ height: width * 0.6 }} maxWidthPx={POPUP_PHOTO_WIDTH_PX} />
      <View style={styles.popupBody}>
        <View style={styles.popupTitleRow}>
          <View style={[styles.medal, styles.popupMedal, { backgroundColor: medal }]}>
            <Text style={styles.medalText}>{shown.topRank}</Text>
          </View>
          <Text style={styles.popupName} numberOfLines={2}>
            {shown.name}
          </Text>
        </View>
        <Text style={styles.popupMeta} numberOfLines={1}>
          {[category.label, rating].filter(Boolean).join('  ')}
        </Text>
      </View>
    </Animated.View>
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
  popup: {
    position: 'absolute',
    left: spacing.md,
    borderRadius: radii.md,
    borderWidth: 2,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  popupBody: { padding: spacing.sm, gap: 2 },
  popupTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  popupMedal: { width: 18, height: 18, borderRadius: 9, marginTop: 1 },
  popupName: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  popupMeta: { fontSize: 11, color: colors.textMuted },
});
