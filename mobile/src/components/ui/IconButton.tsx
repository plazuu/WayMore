import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, shadows } from '@/theme';

import { Icon, type IconName } from './Icon';

interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  /** Floating = white circle with shadow, for use over the map. */
  variant?: 'floating' | 'plain';
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({ icon, onPress, accessibilityLabel, variant = 'plain', size = 40, style }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size },
        variant === 'floating' ? [styles.floating, shadows.floating] : styles.plain,
        pressed && { backgroundColor: colors.surfacePressed },
        style,
      ]}
    >
      <Icon name={icon} size={size * 0.45} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  floating: { backgroundColor: colors.background },
  plain: { backgroundColor: colors.surface },
});
