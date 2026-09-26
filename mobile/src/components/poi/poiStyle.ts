import { colors } from '@/theme';

import type { IconName } from '../ui/Icon';
import type { PoiKind } from '@/api/types';

/** Single source for how each POI kind looks: pins, chips, badges, cards. */
export const POI_KIND_STYLE: Record<PoiKind, { label: string; color: string; softColor: string; icon: IconName }> = {
  landmark: { label: 'Landmark', color: colors.landmark, softColor: colors.landmarkSoft, icon: 'landmark' },
  food: { label: 'Food stop', color: colors.food, softColor: colors.foodSoft, icon: 'food' },
};
