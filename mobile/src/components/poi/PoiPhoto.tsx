import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { resolveServerUrl } from '@/api/client';

import { Icon } from '../ui/Icon';
import { POI_KIND_STYLE } from './poiStyle';

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
  const kind = POI_KIND_STYLE[poi.kind];

  if (!poi.photoUrl || failed) {
    return (
      <View style={[styles.placeholder, { backgroundColor: kind.softColor }, style]}>
        <Icon name={kind.icon} size={28} color={kind.color} />
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
