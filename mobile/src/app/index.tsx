import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/map/RouteMap';
import { HomeSheet } from '@/components/sheets/HomeSheet';
import { PlanTripSheet } from '@/components/sheets/PlanTripSheet';
import { RoutePreviewSheet } from '@/components/sheets/RoutePreviewSheet';
import { ErrorSheet, LoadingSheet } from '@/components/sheets/StatusSheets';
import { TourSheet } from '@/components/sheets/TourSheet';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { usePosition } from '@/features/tour/usePosition';
import { useTourGuide } from '@/features/tour/useTourGuide';
import { shortPlaceName } from '@/lib/format';
import { useSettings } from '@/state/SettingsContext';
import { useTrip } from '@/state/TripContext';
import { useActiveRoute } from '@/state/useActiveRoute';
import { spacing } from '@/theme';

import type { LatLng, TripPoi } from '@/api/types';

// Stable empty values so hooks don't see a "new" array every render.
const NO_COORDS: LatLng[] = [];
const NO_POIS: TripPoi[] = [];

/**
 * The whole trip happens on this screen: a full-screen map with a bottom sheet
 * whose content follows the trip phase (see src/state/tripReducer.ts).
 */
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { state, actions } = useTrip();
  const { settings, updateSettings } = useSettings();
  const active = useActiveRoute();
  const [sheetHeight, setSheetHeight] = useState(0);

  const touring = state.phase === 'touring';
  const narrationMuted = !settings.narrateLandmarks && !settings.narrateFood;
  const { position, error: locationError } = usePosition({
    enabled: touring,
    simulate: settings.simulateDrive,
    path: active?.coordinates ?? NO_COORDS,
    simulatedSpeedMps: settings.simulatedSpeedMps,
  });
  const guide = useTourGuide({
    active: touring,
    pois: active?.allPois ?? NO_POIS,
    narrations: state.narrations,
    position,
    settings,
  });

  const renderSheet = () => {
    switch (state.phase) {
      case 'idle':
        return <HomeSheet onWhereTo={actions.openPlanner} />;
      case 'planning':
        return (
          <PlanTripSheet
            initialStart={state.start}
            initialEnd={state.end}
            onSubmit={actions.findRoute}
            onCancel={actions.reset}
          />
        );
      case 'loading':
        return <LoadingSheet destination={shortPlaceName(state.end)} onCancel={actions.editTrip} />;
      case 'error':
        return (
          <ErrorSheet
            message={state.error ?? 'Something went wrong.'}
            onRetry={() => actions.retry()}
            onEdit={actions.editTrip}
            onUseDemoData={
              settings.useMockData
                ? undefined
                : () => {
                    updateSettings({ useMockData: true });
                    actions.retry({ useMockData: true });
                  }
            }
          />
        );
      case 'preview':
        return active && state.route ? (
          <RoutePreviewSheet
            destination={state.end}
            active={active}
            mode={state.mode}
            extraTimeSeconds={state.route.extraTimeSeconds}
            filter={state.filter}
            onChangeMode={actions.setMode}
            onChangeFilter={actions.setFilter}
            onSelectPoi={actions.selectPoi}
            onStartTour={actions.startTour}
            onClose={actions.reset}
          />
        ) : null;
      case 'touring':
        return (
          <TourSheet
            guide={guide}
            narrationsReady={state.narrationsReady}
            locationError={locationError}
            narrateLandmarks={settings.narrateLandmarks}
            narrateFood={settings.narrateFood}
            onToggleLandmarks={() => updateSettings({ narrateLandmarks: !settings.narrateLandmarks })}
            onToggleFood={() => updateSettings({ narrateFood: !settings.narrateFood })}
            onEnd={actions.endTour}
          />
        );
    }
  };

  return (
    <View style={styles.screen}>
      <RouteMap
        route={active?.coordinates ?? null}
        alternateRoute={touring ? null : active?.alternateCoordinates}
        pois={active?.visiblePois ?? NO_POIS}
        selectedPoiId={state.selectedPoiId}
        onSelectPoi={touring ? () => {} : actions.selectPoi}
        userLocation={position?.coords ?? null}
        followUser={touring && !!position}
        bottomInset={sheetHeight}
      />

      {!touring && (
        <View style={[styles.topBar, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
          <IconButton
            icon="settings"
            variant="floating"
            accessibilityLabel="Developer settings"
            onPress={() => router.push('/settings')}
          />
        </View>
      )}

      {touring && (
        <View style={[styles.topBarRight, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
          <IconButton
            icon={narrationMuted ? 'volumeOff' : 'volumeOn'}
            variant="floating"
            accessibilityLabel={narrationMuted ? 'Unmute tour guide' : 'Mute tour guide'}
            onPress={() =>
              updateSettings(
                narrationMuted
                  ? { narrateLandmarks: true, narrateFood: true }
                  : { narrateLandmarks: false, narrateFood: false },
              )
            }
          />
        </View>
      )}

      <KeyboardAvoidingView behavior="padding" style={styles.sheetArea} pointerEvents="box-none">
        <Sheet onHeightChange={setSheetHeight}>{renderSheet()}</Sheet>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { position: 'absolute', left: spacing.lg, flexDirection: 'row', gap: spacing.sm },
  topBarRight: { position: 'absolute', right: spacing.lg, flexDirection: 'row', gap: spacing.sm },
  sheetArea: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' },
});
