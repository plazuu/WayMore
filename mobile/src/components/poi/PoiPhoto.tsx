import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { resolveServerUrl } from '@/api/client';

import { getPoiCategory } from './poiCategory';
import { PoiIcon } from './PoiIcon';

import type { TripPoi } from '@/api/types';

interface PoiPhotoProps {
  poi: TripPoi;
  style?: StyleProp<ViewStyle>;
  /** Pixel width to request from GET /photo (100-1600). */
  maxWidthPx?: number;
}

/** POI photo from the server's /photo proxy, or a tinted placeholder when there is none. */
export function PoiPhoto({ poi, style, maxWidthPx = 800 }: PoiPhotoProps) {
  const [failed, setFailed] = useState(false);
  const category = getPoiCategory(poi);

  if (!poi.photoUrl || failed) {
    return (
      <View style={[styles.placeholder, { backgroundColor: category.softColor }, style]}>
        <PoiIcon name={category.icon} size={32} color={category.color} />
      </View>
    );
  }

  const uri = `${resolveServerUrl(poi.photoUrl)}&maxWidthPx=${maxWidthPx}`;
  return (
    <View style={[styles.frame, style]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#E9ECEF' },
  placeholder: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
