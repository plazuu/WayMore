import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { colors } from '@/theme';

import { getPoiCategory } from '../poi/poiCategory';
import { PoiIcon } from '../poi/PoiIcon';
import { TOP_LANDMARK_COLOR } from '../poi/poiStyle';

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
  const category = getPoiCategory(poi);
  const top = poi.topRank;
  const tracksViewChanges = useTrackChanges(selected, top);
  const size = selected ? 40 : top ? 34 : 28;
  // Like Apple Maps: a filled circle in the category color with a white glyph.
  // Top landmarks swap the fill for their medal color and wear a rank badge.
  const fill = top ? TOP_LANDMARK_COLOR[top] : category.color;

  return (
    <Marker
      identifier={poi.id}
      coordinate={{ latitude: poi.lat, longitude: poi.lng }}
      onPress={() => onPress(poi.id)}
      tracksViewChanges={tracksViewChanges}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={selected ? 10 : top ? TOP_RANK_Z_INDEX[top] : 1}
      accessibilityLabel={top ? `${poi.name}, ${category.label}, top landmark number ${top}` : `${poi.name}, ${category.label}`}
    >
      {/* Padding leaves room for the rank badge inside the snapshotted bounds. */}
      <View style={styles.pinFrame}>
        <View
          style={[
            styles.pin,
            { width: size, height: size, backgroundColor: fill, borderWidth: selected ? 3 : 2 },
          ]}
        >
          <PoiIcon name={category.icon} size={size * 0.55} color={colors.textInverse} />
        </View>
        {top && (
          <View style={[styles.rankBadge, { borderColor: fill }]}>
            <Text style={[styles.rankText, { color: fill }]}>{top}</Text>
          </View>
        )}
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
  pinFrame: { padding: 6 },
  // No shadow: Android snapshots marker views at their exact size and would clip it.
  pin: {
    borderRadius: 999,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 10, fontWeight: '800' },
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
