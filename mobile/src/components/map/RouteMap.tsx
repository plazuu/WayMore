import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Polyline, type MapPressEvent } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_MAP_REGION } from '@/config';
import { colors } from '@/theme';

import { EndpointMarker, PoiMarker, UserMarker } from './MapMarkers';

import type { LatLng, TripPoi } from '@/api/types';

interface RouteMapProps {
  /** Active route line. Null before a route is loaded. */
  route: LatLng[] | null;
  /** The other route option, drawn muted underneath. */
  alternateRoute?: LatLng[] | null;
  pois: TripPoi[];
  selectedPoiId: string | null;
  onSelectPoi: (id: string | null) => void;
  userLocation?: LatLng | null;
  /** Keep the camera on the user (tour mode). */
  followUser?: boolean;
  /** Height covered by the bottom sheet, so fitted content stays visible above it. */
  bottomInset: number;
}

const FIT_PADDING = 48;

export function RouteMap({
  route,
  alternateRoute,
  pois,
  selectedPoiId,
  onSelectPoi,
  userLocation,
  followUser = false,
  bottomInset,
}: RouteMapProps) {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();

  // Frame the whole route whenever it changes or the sheet resizes.
  useEffect(() => {
    if (!route || route.length < 2 || followUser) return;
    mapRef.current?.fitToCoordinates(route, {
      edgePadding: { top: FIT_PADDING, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING },
      animated: true,
    });
  }, [route, bottomInset, followUser]);

  useEffect(() => {
    if (!followUser || !userLocation) return;
    mapRef.current?.animateCamera({ center: userLocation, zoom: 16 }, { duration: 800 });
  }, [followUser, userLocation]);

  const handleMapPress = (e: MapPressEvent) => {
    if (e.nativeEvent.action !== 'marker-press') onSelectPoi(null);
  };

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={DEFAULT_MAP_REGION}
      // Keeps Google's logo and fitted content out from under the sheet and status bar.
      mapPadding={{ top: insets.top, right: 0, bottom: bottomInset, left: 0 }}
      onPress={handleMapPress}
      showsPointsOfInterests={false}
      showsCompass={false}
      toolbarEnabled={false}
    >
      {alternateRoute && (
        <Polyline coordinates={alternateRoute} strokeColor={colors.routeInactive} strokeWidth={4} lineDashPattern={[8, 8]} zIndex={1} />
      )}
      {route && (
        <>
          <Polyline coordinates={route} strokeColor={colors.routeActive} strokeWidth={6} zIndex={2} />
          <EndpointMarker coordinate={route[0]} type="start" />
          <EndpointMarker coordinate={route[route.length - 1]} type="end" />
        </>
      )}
      {pois.map((poi) => (
        <PoiMarker key={poi.id} poi={poi} selected={poi.id === selectedPoiId} onPress={onSelectPoi} />
      ))}
      {userLocation && <UserMarker coordinate={userLocation} />}
    </MapView>
  );
}
