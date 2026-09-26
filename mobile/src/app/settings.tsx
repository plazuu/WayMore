import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { getHealth } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { useSettings } from '@/state/SettingsContext';
import { colors, radii, spacing, typography } from '@/theme';

/**
 * Developer settings (TODO.md M2 "Dev setting"): server URL, demo data, route
 * sampling density, and tour simulation. Not a user-facing screen.
 */
export default function SettingsScreen() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [health, setHealth] = useState<{ state: 'idle' | 'checking' | 'ok' | 'error'; message?: string }>({
    state: 'idle',
  });

  const checkServer = async () => {
    setHealth({ state: 'checking' });
    try {
      await getHealth();
      setHealth({ state: 'ok', message: 'Server is reachable.' });
    } catch (error) {
      setHealth({ state: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Section title="Server">
        <Field label="API base URL">
          <TextInput
            value={settings.apiBaseUrl}
            onChangeText={(apiBaseUrl) => updateSettings({ apiBaseUrl })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
        </Field>
        <Button label="Test connection" variant="secondary" onPress={checkServer} loading={health.state === 'checking'} />
        {health.message && (
          <Text style={[typography.caption, { color: health.state === 'ok' ? colors.accent : colors.danger }]}>
            {health.message}
          </Text>
        )}
        <Toggle
          label="Use demo data"
          hint="Skip the server and use built-in Miami routes."
          value={settings.useMockData}
          onChange={(useMockData) => updateSettings({ useMockData })}
        />
      </Section>

      <Section title="Route search">
        <NumberField
          label="Sample interval (m)"
          hint="Distance between POI searches along the route. Lower finds more, costs more."
          value={settings.sampleIntervalMeters}
          onChange={(sampleIntervalMeters) => updateSettings({ sampleIntervalMeters })}
        />
        <NumberField
          label="Search radius (m)"
          hint="Places search radius at each sample point."
          value={settings.searchRadiusMeters}
          onChange={(searchRadiusMeters) => updateSettings({ searchRadiusMeters })}
        />
        <NumberField
          label="Max extra time (min)"
          hint="How much longer the scenic route may take than the fastest. Higher reaches waterfront and beach detours."
          value={settings.maxExtraMinutes}
          onChange={(maxExtraMinutes) => updateSettings({ maxExtraMinutes })}
        />
      </Section>

      <Section title="Tour guide">
        <Toggle
          label="Simulate drive"
          hint="Move along the route automatically instead of using GPS."
          value={settings.simulateDrive}
          onChange={(simulateDrive) => updateSettings({ simulateDrive })}
        />
        <NumberField
          label="Simulated speed (m/s)"
          value={settings.simulatedSpeedMps}
          onChange={(simulatedSpeedMps) => updateSettings({ simulatedSpeedMps })}
        />
        <NumberField
          label="Trigger radius (m)"
          hint="How close a place must be before it's narrated."
          value={settings.triggerRadiusMeters}
          onChange={(triggerRadiusMeters) => updateSettings({ triggerRadiusMeters })}
        />
        <Toggle
          label="Device voice fallback"
          hint="Read lines aloud when the server has no audio. Off shows captions only."
          value={settings.useDeviceVoice}
          onChange={(useDeviceVoice) => updateSettings({ useDeviceVoice })}
        />
      </Section>

      <Button label="Reset to defaults" variant="ghost" onPress={resetSettings} />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={typography.label}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={typography.heading}>{label}</Text>
      {hint && <Text style={typography.caption}>{hint}</Text>}
      {children}
    </View>
  );
}

function Toggle(props: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={typography.heading}>{props.label}</Text>
        {props.hint && <Text style={typography.caption}>{props.hint}</Text>}
      </View>
      <Switch value={props.value} onValueChange={props.onChange} trackColor={{ true: colors.accent }} />
    </View>
  );
}

function NumberField(props: { label: string; hint?: string; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(props.value));
  return (
    <Field label={props.label} hint={props.hint}>
      <TextInput
        value={text}
        onChangeText={(next) => {
          setText(next);
          const n = Number(next);
          if (next.trim() !== '' && Number.isFinite(n) && n > 0) props.onChange(n);
        }}
        keyboardType="number-pad"
        style={styles.input}
      />
    </Field>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl, backgroundColor: colors.background },
  section: { gap: spacing.sm },
  sectionBody: { gap: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface },
  field: { gap: spacing.xs },
  input: {
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
    color: colors.text,
    marginTop: spacing.xs,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});
