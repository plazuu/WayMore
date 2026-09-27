import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { poiPhotoUri } from '@/lib/photos';

import { getPoiCategory } from './poiCategory';
import { PoiIcon } from './PoiIcon';

import type { TripPoi } from '@/api/types';

interface PoiPhotoProps {
  poi: TripPoi;
  style?: StyleProp<ViewStyle>;
}

/**
 * POI photo from the server's /photo proxy, or a tinted placeholder when there
 * is none. The placeholder also stands in while the image loads, so a card
 * never shows an empty grey box (photos are usually already cached: see
 * `prefetchPoiPhotos`, run as soon as a route arrives).
 */
export function PoiPhoto({ poi, style }: PoiPhotoProps) {
  // Tracked by URI, not as booleans: this component is reused when the details
  // switch to another POI, and a stale "failed" would hide the new photo.
  const [failedUri, setFailedUri] = useState<string>();
  const [loadedUri, setLoadedUri] = useState<string>();
  const category = getPoiCategory(poi);
  const uri = poiPhotoUri(poi);

  if (!uri || uri === failedUri) {
    return <Placeholder category={category} style={style} />;
  }

  return (
    <View style={[styles.frame, style]}>
      {uri !== loadedUri && <Placeholder category={category} style={StyleSheet.absoluteFill} />}
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoad={() => setLoadedUri(uri)}
        onError={() => setFailedUri(uri)}
      />
    </View>
  );
}

function Placeholder({
  category,
  style,
}: {
  category: ReturnType<typeof getPoiCategory>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.placeholder, { backgroundColor: category.softColor }, style]}>
      <PoiIcon name={category.icon} size={32} color={category.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#E9ECEF' },
  placeholder: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
