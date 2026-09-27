import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Small secondary text, e.g. "+3 min". */
  badge?: string;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ segments, value, onChange }: SegmentedControlProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.selected]}
          >
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {segment.label}
            </Text>
            {segment.badge ? (
              <Text style={[styles.badge, selected && styles.badgeSelected]} numberOfLines={1}>
                {segment.badge}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    // Label over badge, so three segments fit on a phone without the text overlapping.
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  selected: { backgroundColor: colors.background, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  label: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  labelSelected: { color: colors.text, fontWeight: '600' },
  badge: { fontSize: 12, marginTop: 1, fontWeight: '600', color: colors.textMuted },
  badgeSelected: { color: colors.accent },
});
