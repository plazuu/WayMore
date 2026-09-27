import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, shadows, spacing } from '@/theme';

import { Icon, type IconName } from '../ui/Icon';

interface AskGuideButtonProps {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  /** Defaults are the tour's Ask Guide chat; the "Where to?" guide passes its own. */
  label?: string;
  icon?: IconName;
  accessibilityLabel?: string;
}

/** Floating pill over the map that opens a guide chat. */
export function AskGuideButton({
  onPress,
  style,
  label = 'Ask Guide',
  icon = 'chat',
  accessibilityLabel = 'Ask the guide a question',
}: AskGuideButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.pill, shadows.floating, pressed && { opacity: 0.85 }, style]}
    >
      <Icon name={icon} size={16} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
  },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
});
