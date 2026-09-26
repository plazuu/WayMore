import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { Icon, type IconName } from './Icon';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** Tint used when selected. Defaults to the primary color. */
  color?: string;
}

export function Chip({ label, selected = false, onPress, icon, color = colors.primary }: ChipProps) {
  const fg = selected ? colors.textInverse : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected ? { backgroundColor: color, borderColor: color } : null,
        pressed && !selected && { backgroundColor: colors.surfacePressed },
      ]}
    >
      {icon && <Icon name={icon} size={13} color={fg} />}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  label: { fontSize: 14, fontWeight: '500' },
});
