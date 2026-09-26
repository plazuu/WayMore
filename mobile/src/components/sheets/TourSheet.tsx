import { StyleSheet, Text, View } from 'react-native';

import type { TourGuide } from '@/features/tour/useTourGuide';
import { formatDistance } from '@/lib/format';
import { colors, radii, spacing, typography } from '@/theme';

import { POI_KIND_STYLE } from '../poi/poiStyle';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';

interface TourSheetProps {
  guide: TourGuide;
  narrationsReady: boolean;
  locationError: string | null;
  narrateLandmarks: boolean;
  narrateFood: boolean;
  onToggleLandmarks: () => void;
  onToggleFood: () => void;
  onEnd: () => void;
}

/** "Now touring" view: what's being narrated, what's next, mute controls. */
export function TourSheet({
  guide,
  narrationsReady,
  locationError,
  narrateLandmarks,
  narrateFood,
  onToggleLandmarks,
  onToggleFood,
  onEnd,
}: TourSheetProps) {
  const { current, next, paused, visitedCount, total } = guide;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={typography.label}>Touring</Text>
        <Text style={typography.caption}>
          {visitedCount} of {total} places passed
          {!narrationsReady ? ' · preparing narration…' : ''}
        </Text>
      </View>

      {locationError ? (
        <View style={[styles.nowCard, { backgroundColor: colors.dangerSoft }]}>
          <Text style={[typography.body, { color: colors.danger }]}>{locationError}</Text>
        </View>
      ) : current ? (
        <View style={[styles.nowCard, { backgroundColor: POI_KIND_STYLE[current.poi.kind].softColor }]}>
          <View style={styles.nowHeader}>
            <Icon name={POI_KIND_STYLE[current.poi.kind].icon} color={POI_KIND_STYLE[current.poi.kind].color} />
            <Text style={typography.heading} numberOfLines={1}>
              {current.poi.name}
            </Text>
          </View>
          <Text style={[typography.body, styles.caption]}>{current.narration.text}</Text>
        </View>
      ) : (
        <View style={[styles.nowCard, { backgroundColor: colors.surface }]}>
          <Text style={typography.bodyMuted}>
            {paused ? 'Narration paused.' : "Enjoy the drive. We'll tell you when something's coming up."}
          </Text>
        </View>
      )}

      {next && (
        <View style={styles.nextRow}>
          <Text style={typography.label}>Up next</Text>
          <Text style={[typography.body, styles.nextName]} numberOfLines={1}>
            {next.poi.name}
          </Text>
          <Text style={typography.caption}>{formatDistance(next.distanceMeters)}</Text>
        </View>
      )}

      <View style={styles.mutes}>
        <Chip
          label="Landmarks"
          icon={narrateLandmarks ? 'volumeOn' : 'volumeOff'}
          selected={narrateLandmarks}
          color={POI_KIND_STYLE.landmark.color}
          onPress={onToggleLandmarks}
        />
        <Chip
          label="Food"
          icon={narrateFood ? 'volumeOn' : 'volumeOff'}
          selected={narrateFood}
          color={POI_KIND_STYLE.food.color}
          onPress={onToggleFood}
        />
      </View>

      <View style={styles.actions}>
        <Button
          label={paused ? 'Resume' : 'Pause'}
          icon={paused ? 'play' : 'pause'}
          variant="secondary"
          onPress={paused ? guide.resume : guide.pause}
          style={styles.flex}
        />
        <Button label="End tour" variant="danger" onPress={onEnd} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nowCard: { borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
  nowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  caption: { lineHeight: 22 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nextName: { flex: 1, fontWeight: '600' },
  mutes: { flexDirection: 'row', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
