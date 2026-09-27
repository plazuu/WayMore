import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AskGuideButton } from '@/components/chat/AskGuideButton';
import { GuideChatModal } from '@/components/chat/GuideChatModal';
import { RouteMap } from '@/components/map/RouteMap';
import { HomeSheet } from '@/components/sheets/HomeSheet';
import { PlanTripSheet } from '@/components/sheets/PlanTripSheet';
import { RoutePreviewSheet } from '@/components/sheets/RoutePreviewSheet';
import { ErrorSheet, LoadingSheet } from '@/components/sheets/StatusSheets';
import { TourSheet } from '@/components/sheets/TourSheet';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { useGuideChat } from '@/features/chat/useGuideChat';
import { usePosition } from '@/features/tour/usePosition';
import { useTourGuide } from '@/features/tour/useTourGuide';
import { shortPlaceName } from '@/lib/format';
import { useSettings } from '@/state/SettingsContext';
import { useTrip } from '@/state/TripContext';
import { useActiveRoute } from '@/state/useActiveRoute';
import { colors, spacing } from '@/theme';

import type { LatLng, TripPoi } from '@/api/types';

// Stable empty values so hooks don't see a "new" array every render.
const NO_COORDS: LatLng[] = [];
const NO_POIS: TripPoi[] = [];

/**
 * Bottom padding that tracks the keyboard's real height and animation, driven
 * directly by `keyboardWillShow`/`keyboardWillHide` (iOS only — these fire
 * before the keyboard moves, unlike the `did` variants). `KeyboardAvoidingView`
 * derives its shift from the view's layout frame, which under-reports here and
 * leaves a gap of map visible above the keyboard; this bypasses that by using
 * the keyboard's own reported height instead.
 */
function useKeyboardPadding() {
  const padding = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const animateTo = (height: number, duration: number) =>
      Animated.timing(padding, { toValue: height, duration, useNativeDriver: false }).start();

    const showSub = Keyboard.addListener('keyboardWillShow', (e) =>
      animateTo(e.endCoordinates.height, e.duration || 250),
    );
    const hideSub = Keyboard.addListener('keyboardWillHide', (e) => animateTo(0, e.duration || 250));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [padding]);

  return padding;
}

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
  const keyboardPadding = useKeyboardPadding();

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
  const chat = useGuideChat({
    active: touring,
    pois: active?.allPois ?? NO_POIS,
    getRide: () => ({
      lat: position?.coords.latitude,
      lng: position?.coords.longitude,
      heading: position?.heading ?? null,
      passedPlaceIds: guide.passedPlaceIds(),
      recent: guide.recentNarrations(),
    }),
  });
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!touring) setChatOpen(false);
  }, [touring]);

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
        <AskGuideButton
          onPress={() => setChatOpen(true)}
          style={[styles.askGuide, { bottom: sheetHeight + spacing.md }]}
        />
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

      <Animated.View style={[styles.sheetArea, { paddingBottom: keyboardPadding }]} pointerEvents="box-none">
        <Sheet onHeightChange={setSheetHeight}>{renderSheet()}</Sheet>
      </Animated.View>

      {/*
        Opaque filler for the space the keyboard occupies. iOS keyboards are
        translucent and their rounded top corners leave the map showing
        through. It uses the sheet's own background colour and renders *after*
        the sheet so it also covers the sheet's drop shadow — otherwise the
        shadow darkens the top of the filler and gives away the seam.
      */}
      <Animated.View style={[styles.keyboardBackdrop, { height: keyboardPadding }]} pointerEvents="none" />

      <GuideChatModal visible={touring && chatOpen} chat={chat} onClose={() => setChatOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { position: 'absolute', left: spacing.lg, flexDirection: 'row', gap: spacing.sm },
  topBarRight: { position: 'absolute', right: spacing.lg, flexDirection: 'row', gap: spacing.sm },
  askGuide: { position: 'absolute', right: spacing.lg },
  sheetArea: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' },
  keyboardBackdrop: { position: 'absolute', right: 0, bottom: 0, left: 0, backgroundColor: colors.background },
});
