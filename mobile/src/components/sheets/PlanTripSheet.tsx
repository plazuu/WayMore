import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { DEMO_TRIP } from '@/config';
import { useSettings } from '@/state/SettingsContext';
import { colors, spacing, typography } from '@/theme';

import { AddressAutocompleteField } from '../ui/AddressAutocompleteField';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { IconButton } from '../ui/IconButton';
import { SegmentedControl } from '../ui/SegmentedControl';

/** Extra drive time the scenic route may cost. 0 = Auto (the server picks 5 min + 20% of the trip). */
const EXTRA_TIME_MINUTES = [0, 10, 20, 30];

interface PlanTripSheetProps {
  initialStart: string;
  initialEnd: string;
  onSubmit: (start: string, end: string) => void;
  onCancel: () => void;
}

/** Start/end entry, with Places Autocomplete suggestions as you type (server's `/autocomplete` proxy). */
export function PlanTripSheet({ initialStart, initialEnd, onSubmit, onCancel }: PlanTripSheetProps) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const { settings, updateSettings } = useSettings();
  const endRef = useRef<TextInput>(null);
  const canSubmit = start.trim().length > 0 && end.trim().length > 0;

  const submit = () => canSubmit && onSubmit(start.trim(), end.trim());

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={typography.title}>Plan your trip</Text>
        <IconButton icon="close" onPress={onCancel} accessibilityLabel="Cancel" size={36} />
      </View>

      <View style={styles.fields}>
        <View style={styles.rail}>
          <View style={styles.startDot} />
          <View style={styles.railLine} />
          <View style={styles.endSquare} />
        </View>
        <View style={styles.inputs}>
          <AddressAutocompleteField
            value={start}
            onChangeText={setStart}
            placeholder="Starting point"
            autoFocus={!initialStart}
            returnKeyType="next"
            onSubmitEditing={() => endRef.current?.focus()}
          />
          <AddressAutocompleteField
            ref={endRef}
            value={end}
            onChangeText={setEnd}
            placeholder="Where to?"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </View>
        <IconButton
          icon="swap"
          accessibilityLabel="Swap start and destination"
          size={36}
          onPress={() => {
            setStart(end);
            setEnd(start);
          }}
        />
      </View>

      <View style={styles.suggestions}>
        <Chip
          label="Demo: Brickell → Wynwood"
          onPress={() => {
            setStart(DEMO_TRIP.start);
            setEnd(DEMO_TRIP.end);
          }}
        />
      </View>

      <View style={styles.preference}>
        <Text style={typography.bodyMuted}>What do you want to see?</Text>
        <SegmentedControl
          value={settings.scenicPreference}
          onChange={(scenicPreference) => updateSettings({ scenicPreference })}
          segments={[
            { value: 'city', label: 'City' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'nature', label: 'Nature' },
          ]}
        />
      </View>

      <View style={styles.preference}>
        <Text style={typography.bodyMuted}>How much extra time is okay?</Text>
        <SegmentedControl
          value={String(settings.maxExtraMinutes)}
          onChange={(minutes) => updateSettings({ maxExtraMinutes: Number(minutes) })}
          segments={EXTRA_TIME_MINUTES.map((minutes) => ({
            value: String(minutes),
            label: minutes === 0 ? 'Auto' : `+${minutes} min`,
          }))}
        />
      </View>

      <Button label="Find scenic route" icon="navigate" onPress={submit} disabled={!canSubmit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fields: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rail: { alignItems: 'center', paddingVertical: spacing.lg },
  startDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.routeStart },
  railLine: { width: 2, height: 36, backgroundColor: colors.border, marginVertical: 4 },
  endSquare: { width: 10, height: 10, backgroundColor: colors.routeEnd },
  inputs: { flex: 1, gap: spacing.sm },
  preference: { gap: spacing.sm },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
