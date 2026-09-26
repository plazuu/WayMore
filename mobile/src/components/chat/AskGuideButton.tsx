import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, shadows, spacing } from '@/theme';

import { Icon } from '../ui/Icon';

interface AskGuideButtonProps {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Floating pill over the map during a tour; opens the guide chat. */
export function AskGuideButton({ onPress, style }: AskGuideButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Ask the guide a question"
      style={({ pressed }) => [styles.pill, shadows.floating, pressed && { opacity: 0.85 }, style]}
    >
      <Icon name="chat" size={16} />
      <Text style={styles.label}>Ask Guide</Text>
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
