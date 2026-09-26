import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDistance, formatDuration, formatExtraTime, shortPlaceName } from '@/lib/format';
import type { ActiveRoute } from '@/state/useActiveRoute';
import type { PoiFilter } from '@/state/tripReducer';
import { colors, spacing, typography } from '@/theme';

import { PoiCard } from '../poi/PoiCard';
import { PoiDetailCard } from '../poi/PoiDetailCard';
import { POI_KIND_STYLE } from '../poi/poiStyle';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { IconButton } from '../ui/IconButton';
import { SegmentedControl } from '../ui/SegmentedControl';

import type { RouteMode } from '@/api/types';

interface RoutePreviewSheetProps {
  destination: string;
  active: ActiveRoute;
  mode: RouteMode;
  extraTimeSeconds: number;
  filter: PoiFilter;
  onChangeMode: (mode: RouteMode) => void;
  onChangeFilter: (filter: PoiFilter) => void;
  onSelectPoi: (id: string | null) => void;
  onStartTour: () => void;
  onClose: () => void;
}

const FILTERS: { value: PoiFilter; label: string }[] = [
  { value: 'all', label: 'Both' },
  { value: 'landmarks', label: 'Landmarks' },
  { value: 'food', label: 'Food' },
];

export function RoutePreviewSheet({
  destination,
  active,
  mode,
  extraTimeSeconds,
  filter,
  onChangeMode,
  onChangeFilter,
  onSelectPoi,
  onStartTour,
  onClose,
}: RoutePreviewSheetProps) {
  const { option, visiblePois, selectedPoi, sameRoute } = active;

  if (selectedPoi) {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <PoiDetailCard poi={selectedPoi} onClose={() => onSelectPoi(null)} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={typography.label}>Trip to</Text>
          <Text style={typography.title} numberOfLines={1}>
            {shortPlaceName(destination)}
          </Text>
        </View>
        <IconButton icon="close" onPress={onClose} accessibilityLabel="Cancel trip" size={36} />
      </View>

      <SegmentedControl
        value={mode}
        onChange={onChangeMode}
        segments={[
          { value: 'normal', label: 'Fastest' },
          { value: 'scenic', label: 'Scenic', badge: formatExtraTime(extraTimeSeconds) },
        ]}
      />

      <View style={styles.summary}>
        <Text style={styles.duration}>{formatDuration(option.durationSeconds)}</Text>
        <Text style={typography.bodyMuted}>{formatDistance(option.distanceMeters)}</Text>
        <Text style={[typography.bodyMuted, { color: POI_KIND_STYLE.landmark.color }]}>
          {option.landmarks.length} landmarks
        </Text>
        <Text style={[typography.bodyMuted, { color: POI_KIND_STYLE.food.color }]}>{option.foodStops.length} food</Text>
      </View>
      {sameRoute && <Text style={typography.caption}>The fastest route is also the most scenic one.</Text>}

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => onChangeFilter(f.value)} />
        ))}
      </View>

      {visiblePois.length > 0 ? (
        <FlatList
          // Remount on change so the scroll position resets; otherwise a shorter list can render off-screen.
          key={`${mode}-${filter}`}
          horizontal
          data={visiblePois}
          keyExtractor={(poi) => poi.id}
          renderItem={({ item }) => <PoiCard poi={item} onPress={() => onSelectPoi(item.id)} />}
          ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
          showsHorizontalScrollIndicator={false}
          style={styles.list}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={typography.bodyMuted}>
            {option.landmarks.length + option.foodStops.length === 0
              ? 'No landmarks or food stops found along this route.'
              : 'Nothing matches this filter.'}
          </Text>
        </View>
      )}

      <Button label="Start tour" icon="play" onPress={onStartTour} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing.md },
  duration: { fontSize: 22, fontWeight: '700', color: colors.text },
  filters: { flexDirection: 'row', gap: spacing.sm },
  list: { marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg, flexGrow: 0 },
  empty: { paddingVertical: spacing.lg, alignItems: 'center' },
});
