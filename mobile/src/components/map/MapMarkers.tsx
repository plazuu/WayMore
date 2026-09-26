import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { colors } from '@/theme';

import { Icon } from '../ui/Icon';
import { POI_KIND_STYLE } from '../poi/poiStyle';

import type { LatLng, TripPoi } from '@/api/types';

/**
 * Android snapshots custom marker views, so they need `tracksViewChanges` on
 * briefly after any visual change, then off for performance.
 */
function useTrackChanges(...deps: unknown[]) {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const id = setTimeout(() => setTracking(false), 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return tracking;
}

interface PoiMarkerProps {
  poi: TripPoi;
  selected: boolean;
  onPress: (id: string) => void;
}

export function PoiMarker({ poi, selected, onPress }: PoiMarkerProps) {
  const kind = POI_KIND_STYLE[poi.kind];
  const tracksViewChanges = useTrackChanges(selected);
  const size = selected ? 40 : 30;

  return (
    <Marker
      identifier={poi.id}
      coordinate={{ latitude: poi.lat, longitude: poi.lng }}
      onPress={() => onPress(poi.id)}
      tracksViewChanges={tracksViewChanges}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={selected ? 10 : 1}
      accessibilityLabel={poi.name}
    >
      <View
        style={[
          styles.pin,
          { width: size, height: size, backgroundColor: selected ? kind.color : colors.background, borderColor: kind.color },
        ]}
      >
        <Icon name={kind.icon} size={size * 0.45} color={selected ? colors.textInverse : kind.color} />
      </View>
    </Marker>
  );
}

export function EndpointMarker({ coordinate, type }: { coordinate: LatLng; type: 'start' | 'end' }) {
  const tracksViewChanges = useTrackChanges(type);
  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracksViewChanges} zIndex={5}>
      <View style={type === 'start' ? styles.start : styles.end}>
        <View style={type === 'start' ? styles.startDot : styles.endDot} />
      </View>
    </Marker>
  );
}

export function UserMarker({ coordinate }: { coordinate: LatLng }) {
  const tracksViewChanges = useTrackChanges();
  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracksViewChanges} zIndex={20} flat>
      <View style={styles.userHalo}>
        <View style={styles.userDot} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  pin: {
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  start: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.routeStart,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.background },
  end: {
    width: 20,
    height: 20,
    borderRadius: 3,
    backgroundColor: colors.routeEnd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endDot: { width: 8, height: 8, backgroundColor: colors.background },
  userHalo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(26,115,232,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.userPuck,
    borderWidth: 3,
    borderColor: colors.background,
  },
});
