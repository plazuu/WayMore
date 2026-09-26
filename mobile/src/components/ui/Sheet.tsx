import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing } from '@/theme';

interface SheetProps {
  children: ReactNode;
  /** Reports the sheet's height so the map can keep the route visible above it. */
  onHeightChange?: (height: number) => void;
}

/**
 * Bottom panel over the map (place it at the bottom of its container). Sized by its content (capped at ~75% of the
 * screen). If you want drag-to-expand later, swap this for a gesture-driven
 * sheet (e.g. @gorhom/bottom-sheet); the sheets inside don't depend on it.
 */
export function Sheet({ children, onHeightChange }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.sheet, shadows.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
    >
      <View style={styles.handle} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '75%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
});
