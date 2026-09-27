import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type { PoiGlyph } from './poiCategory';

interface PoiIconProps {
  name: PoiGlyph;
  size?: number;
  color: string;
}

/** Category glyph for a place (museum columns, coffee cup, tree...). The font is preloaded in the root layout. */
export function PoiIcon({ name, size = 18, color }: PoiIconProps) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
