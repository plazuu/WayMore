import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { colors } from '@/theme';

import { Icon } from '../ui/Icon';
import { POI_KIND_STYLE, TOP_LANDMARK_COLOR } from '../poi/poiStyle';

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

/** Top landmarks sit above other POIs (1) but below endpoints (5) and the selected pin (10). */
const TOP_RANK_Z_INDEX = { 1: 4, 2: 3, 3: 2 } as const;

export function PoiMarker({ poi, selected, onPress }: PoiMarkerProps) {
  const kind = POI_KIND_STYLE[poi.kind];
  const top = poi.topRank;
  const tracksViewChanges = useTrackChanges(selected, top);
  const size = selected ? 40 : top ? 36 : 30;
  // Top landmarks are always filled in their medal color; others fill only when selected.
  const color = top ? TOP_LANDMARK_COLOR[top] : kind.color;
  const filled = selected || top !== undefined;

  return (
    <Marker
      identifier={poi.id}
      coordinate={{ latitude: poi.lat, longitude: poi.lng }}
      onPress={() => onPress(poi.id)}
      tracksViewChanges={tracksViewChanges}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={selected ? 10 : top ? TOP_RANK_Z_INDEX[top] : 1}
      accessibilityLabel={top ? `${poi.name}, top landmark number ${top}` : poi.name}
    >
      <View
        style={[
          styles.pin,
          {
            width: size,
            height: size,
            backgroundColor: filled ? color : colors.background,
            borderColor: top && !selected ? colors.background : color,
          },
          top && styles.topPin,
        ]}
      >
        <Icon name={kind.icon} size={size * 0.45} color={filled ? colors.textInverse : color} />
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
  // No shadow: Android snapshots marker views at their exact size and would clip it.
  topPin: { borderWidth: 3 },
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
