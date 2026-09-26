import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Design tokens. Every component reads from here, so a restyle means editing
 * this file, not hunting through components.
 */
export const colors = {
  background: '#FFFFFF',
  surface: '#F3F4F6',
  surfacePressed: '#E6E8EB',
  text: '#111418',
  textMuted: '#5F6670',
  textInverse: '#FFFFFF',
  border: '#E3E5E8',

  primary: '#111418',
  onPrimary: '#FFFFFF',

  accent: '#0B7A75',
  accentSoft: '#E1F2F0',

  landmark: '#0B7A75',
  landmarkSoft: '#E1F2F0',
  food: '#D9620B',
  foodSoft: '#FCEBDD',

  routeActive: '#0B7A75',
  routeInactive: '#9AA3AF',
  routeStart: '#111418',
  routeEnd: '#111418',
  userPuck: '#1A73E8',

  danger: '#C62828',
  dangerSoft: '#FDECEA',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 26, fontWeight: '700', color: colors.text },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  heading: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  bodyMuted: { fontSize: 15, color: colors.textMuted },
  caption: { fontSize: 13, color: colors.textMuted },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
} satisfies Record<string, TextStyle>;

export const shadows = {
  sheet: Platform.select<ViewStyle>({
    ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 } },
    default: { elevation: 16 },
  }),
  floating: Platform.select<ViewStyle>({
    ios: { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    default: { elevation: 6 },
  }),
};
