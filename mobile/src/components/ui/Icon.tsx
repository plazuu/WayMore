import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { colors } from '@/theme';

/**
 * Minimal glyph icon set so the app has no icon-font dependency.
 * To switch to a real icon library (e.g. @expo/vector-icons or expo-symbols),
 * replace the body of this component; call sites only use `name`, `size`, `color`.
 */
const GLYPHS = {
  back: '‹',
  close: '✕',
  search: '⌕',
  settings: '⚙',
  swap: '⇅',
  landmark: '★',
  food: '🍴',
  time: '◷',
  distance: '↔',
  play: '▶',
  pause: '❚❚',
  volumeOn: '🔊',
  volumeOff: '🔇',
  alert: '!',
  chevronRight: '›',
  navigate: '➤',
  image: '▦',
  cube: '◈',
  chat: '💬',
  send: '↑',
  link: '↗',
} as const;

export type IconName = keyof typeof GLYPHS;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 18, color = colors.text, style }: IconProps) {
  return (
    <Text
      style={[styles.icon, { fontSize: size, lineHeight: size * 1.15, color }, style]}
      allowFontScaling={false}
      accessible={false}
    >
      {GLYPHS[name]}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: { textAlign: 'center', includeFontPadding: false },
});
