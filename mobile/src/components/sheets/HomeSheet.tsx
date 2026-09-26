import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/theme';

import { Icon } from '../ui/Icon';

interface HomeSheetProps {
  onWhereTo: () => void;
}

export function HomeSheet({ onWhereTo }: HomeSheetProps) {
  return (
    <View style={styles.container}>
      <Text style={typography.display}>Take the scenic way</Text>
      <Text style={[typography.bodyMuted, styles.subtitle]}>
        We'll find the route with the best landmarks and local food along it, and tell you about them as you go.
      </Text>

      <Pressable
        onPress={onWhereTo}
        accessibilityRole="search"
        accessibilityLabel="Where to?"
        style={({ pressed }) => [styles.search, pressed && { backgroundColor: colors.surfacePressed }]}
      >
        <Icon name="search" size={20} color={colors.textMuted} />
        <Text style={styles.searchText}>Where to?</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  subtitle: { marginBottom: spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  searchText: { fontSize: 18, fontWeight: '600', color: colors.text },
});
