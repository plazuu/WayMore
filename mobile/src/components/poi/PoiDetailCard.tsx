import { StyleSheet, Text, View } from 'react-native';

import { formatRating, humanizeType } from '@/lib/format';
import { colors, radii, spacing, typography } from '@/theme';

import { IconButton } from '../ui/IconButton';
import { PoiPhoto } from './PoiPhoto';
import { getPoiCategory } from './poiCategory';
import { PoiIcon } from './PoiIcon';

import type { TripPoi } from '@/api/types';

interface PoiDetailCardProps {
  poi: TripPoi;
  onClose: () => void;
}

/** Landmark or restaurant details shown when a pin or card is tapped. */
export function PoiDetailCard({ poi, onClose }: PoiDetailCardProps) {
  const category = getPoiCategory(poi);
  const facts =
    poi.kind === 'food'
      ? [poi.cuisine, poi.priceLevel]
      : [humanizeType(poi.types.find((t) => t !== 'point_of_interest' && t !== 'establishment'))];

  return (
    <View>
      <View style={styles.photoWrap}>
        <PoiPhoto poi={poi} style={styles.photo} />
        <IconButton icon="close" onPress={onClose} accessibilityLabel="Close details" variant="floating" size={34} style={styles.close} />
      </View>

      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: category.softColor }]}>
          <PoiIcon name={category.icon} size={13} color={category.color} />
          <Text style={[styles.badgeText, { color: category.color }]}>{category.label}</Text>
        </View>
        {poi.rating != null && <Text style={styles.rating}>{formatRating(poi.rating, poi.userRatingCount)}</Text>}
      </View>

      <Text style={typography.title}>{poi.name}</Text>
      {facts.some(Boolean) && <Text style={[typography.caption, styles.facts]}>{facts.filter(Boolean).join(' · ')}</Text>}

      <Text style={[typography.body, styles.description, !poi.description && styles.missing]}>
        {poi.description ?? 'No description yet for this place.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photoWrap: { marginBottom: spacing.md },
  photo: { height: 160, borderRadius: radii.md },
  close: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  rating: { fontSize: 13, fontWeight: '600', color: colors.text },
  facts: { marginTop: 2 },
  description: { marginTop: spacing.sm, lineHeight: 21 },
  missing: { color: colors.textMuted, fontStyle: 'italic' },
});
