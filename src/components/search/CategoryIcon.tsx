import type { PlaceCategory } from '@dk/shared';
import {
  Briefcase,
  Building2,
  Clock,
  Crosshair,
  Home,
  MapPin,
  Landmark,
  Star,
} from 'lucide-react';

import type { SuggestionSection } from './useSuggestions';

const BY_CATEGORY: Record<PlaceCategory, typeof MapPin> = {
  address: MapPin,
  city: Building2,
  poi: Landmark,
  synagogue: Star,
  coordinates: Crosshair,
  home: Home,
  work: Briefcase,
  other: MapPin,
};

export function CategoryIcon({
  category,
  section,
  size = 20,
}: {
  category: PlaceCategory;
  section: SuggestionSection;
  size?: number;
}) {
  const Icon = section === 'recent' ? Clock : BY_CATEGORY[category];
  return <Icon size={size} aria-hidden />;
}
