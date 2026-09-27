import { colors } from '@/theme';

import type { IconName } from '../ui/Icon';
import type { PoiKind, TopRank } from '@/api/types';

/** Single source for how each POI kind looks: pins, chips, badges, cards. */
export const POI_KIND_STYLE: Record<PoiKind, { label: string; color: string; softColor: string; icon: IconName }> = {
  landmark: { label: 'Landmark', color: colors.landmark, softColor: colors.landmarkSoft, icon: 'landmark' },
  food: { label: 'Food stop', color: colors.food, softColor: colors.foodSoft, icon: 'food' },
};

/** Gold, silver, bronze for the route's top three landmarks. */
export const TOP_LANDMARK_COLOR: Record<TopRank, string> = {
  1: colors.topLandmark1,
  2: colors.topLandmark2,
  3: colors.topLandmark3,
};
