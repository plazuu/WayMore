import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatRating } from '@/lib/format';
import { colors, radii, spacing, typography } from '@/theme';

import { PoiPhoto } from './PoiPhoto';
import { POI_KIND_STYLE } from './poiStyle';

import type { TripPoi } from '@/api/types';

interface PoiCardProps {
  poi: TripPoi;
  onPress: () => void;
}

export const POI_CARD_WIDTH = 168;

/** Compact card for the horizontal "along this route" list. */
export function PoiCard({ poi, onPress }: PoiCardProps) {
  const kind = POI_KIND_STYLE[poi.kind];
  const meta = poi.kind === 'food' ? [poi.cuisine, poi.priceLevel].filter(Boolean).join(' · ') : kind.label;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${poi.name}, ${kind.label}`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
    >
      <PoiPhoto poi={poi} style={styles.photo} maxWidthPx={400} />
      <View style={[styles.kindBar, { backgroundColor: kind.color }]} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {poi.name}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {[formatRating(poi.rating), meta].filter(Boolean).join('  ')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: POI_CARD_WIDTH,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  photo: { height: 88 },
  kindBar: { height: 3 },
  body: { padding: spacing.sm, gap: 2 },
  name: { ...typography.heading, fontSize: 14 },
});
