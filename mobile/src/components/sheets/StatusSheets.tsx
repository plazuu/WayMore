import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/theme';

import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

export function LoadingSheet({ destination, onCancel }: { destination: string; onCancel: () => void }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[typography.title, styles.center]}>Finding the most scenic route</Text>
      <Text style={[typography.bodyMuted, styles.center]}>
        Scoring routes to {destination} by the landmarks they pass. This can take a few seconds.
      </Text>
      <Button label="Cancel" variant="secondary" onPress={onCancel} style={styles.fullWidth} />
    </View>
  );
}

interface ErrorSheetProps {
  message: string;
  onRetry: () => void;
  onEdit: () => void;
  /** Shown only when demo data isn't already on. */
  onUseDemoData?: () => void;
}

export function ErrorSheet({ message, onRetry, onEdit, onUseDemoData }: ErrorSheetProps) {
  return (
    <View style={styles.container}>
      <View style={styles.errorIcon}>
        <Icon name="alert" size={24} color={colors.danger} />
      </View>
      <Text style={[typography.title, styles.center]}>Couldn't find a route</Text>
      <Text style={[typography.bodyMuted, styles.center]}>{message}</Text>
      <View style={styles.actions}>
        <Button label="Try again" onPress={onRetry} />
        {onUseDemoData && <Button label="Use demo data instead" variant="secondary" onPress={onUseDemoData} />}
        <Button label="Edit trip" variant="ghost" onPress={onEdit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  center: { textAlign: 'center' },
  fullWidth: { alignSelf: 'stretch', marginTop: spacing.sm },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  errorIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
