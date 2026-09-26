import { useRef, useState, type ComponentProps, type Ref } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { DEMO_TRIP } from '@/config';
import { colors, radii, spacing, typography } from '@/theme';

import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { IconButton } from '../ui/IconButton';

interface PlanTripSheetProps {
  initialStart: string;
  initialEnd: string;
  onSubmit: (start: string, end: string) => void;
  onCancel: () => void;
}

/**
 * Start/end entry. Plain text for now: the server has no autocomplete proxy yet
 * (docs/api.md lists every endpoint). To add Places Autocomplete, replace
 * `AddressField` with a component that queries a new server endpoint.
 */
export function PlanTripSheet({ initialStart, initialEnd, onSubmit, onCancel }: PlanTripSheetProps) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
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
          <AddressField
            value={start}
            onChangeText={setStart}
            placeholder="Starting point"
            autoFocus={!initialStart}
            returnKeyType="next"
            onSubmitEditing={() => endRef.current?.focus()}
          />
          <AddressField
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

      <Button label="Find scenic route" icon="navigate" onPress={submit} disabled={!canSubmit} />
    </View>
  );
}

type AddressFieldProps = ComponentProps<typeof TextInput> & { ref?: Ref<TextInput> };

function AddressField(props: AddressFieldProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      autoCorrect={false}
      autoCapitalize="words"
      selectTextOnFocus
      style={styles.input}
      {...props}
    />
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
  input: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
  },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
