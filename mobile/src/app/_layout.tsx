import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SettingsProvider } from '@/state/SettingsContext';
import { TripProvider } from '@/state/TripContext';
import { colors } from '@/theme';

export default function RootLayout() {
  // Map pins are snapshotted on Android, so the POI glyph font must be ready before any pin renders.
  const [fontsLoaded, fontError] = useFonts(MaterialCommunityIcons.font);
  if (!fontsLoaded && !fontError) return null;

  return (
    <SettingsProvider>
      <TripProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" />
          <Stack.Screen
            name="settings"
            options={{ presentation: 'modal', headerShown: true, title: 'Developer settings' }}
          />
        </Stack>
      </TripProvider>
    </SettingsProvider>
  );
}
