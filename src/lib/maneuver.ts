import type { Language, Maneuver } from '@dk/shared';
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CircleDot,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Split,
  MapPin,
  Merge,
  OctagonAlert,
  ShieldAlert,
  Undo2,
} from 'lucide-react';

import { formatDistance } from './format';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

const ICONS: Record<string, typeof ArrowUp> = {
  depart: MapPin,
  turn_right: CornerUpRight,
  turn_left: CornerUpLeft,
  continue: ArrowUp,
  roundabout: CircleDot,
  roundabout_exit: CircleDot,
  ramp_right: ArrowUpRight,
  ramp_left: ArrowUpLeft,
  keep_right: ArrowUpRight,
  keep_left: ArrowUpLeft,
  fork_right: Split,
  fork_left: Split,
  merge: Merge,
  uturn: Undo2,
  arrive: Flag,
  zone_enter: OctagonAlert,
  zone_exit: ShieldAlert,
  zone_origin: OctagonAlert,
  zone_destination: OctagonAlert,
};

export function maneuverIcon(action: string) {
  return ICONS[action] ?? ArrowUp;
}

export function isZoneManeuver(action: string): boolean {
  return action.startsWith('zone_');
}

// HERE prose ends with a "continue for N metres" sentence that duplicates the distance the
// banner already shows large. Drop that trailing clause; keep the turn and the street.
// A whitespace requirement stands in for a word boundary, since JS \b does not fire between
// Hebrew letters and spaces.
const TRAILING_DISTANCE =
  /\s*[.,]?\s*(?:התקדם|המשך למשך|נסע עוד|נסע|Continue|Go|Drive|Proceed|Head)\s+[^.]*?\d[^.]*?['’]?\.?\s*$/u;

export function cleanInstruction(text: string): string {
  const trimmed = text.trim();
  const stripped = trimmed.replace(TRAILING_DISTANCE, '').trim();
  return stripped.length >= 3 ? stripped : trimmed;
}

/**
 * The on-screen text. The provider's localised `instruction` is preferred, since it carries
 * the street name and covers every action type; the structured action is the fallback.
 */
export function maneuverText(maneuver: Maneuver, t: Translate, language: Language): string {
  if (isZoneManeuver(maneuver.action)) {
    const zoneName = maneuver.zone
      ? language === 'he'
        ? maneuver.zone.nameHe
        : maneuver.zone.name
      : '';
    return t(`maneuver.${maneuver.action}`, { zone: zoneName });
  }
  if (maneuver.instruction && maneuver.instruction.trim()) {
    return cleanInstruction(maneuver.instruction);
  }
  const action = t(`maneuver.${maneuver.action}`);
  return maneuver.street ? `${action} ${t('maneuver.onStreet', { street: maneuver.street })}` : action;
}

export function maneuverDistanceText(meters: number, language: Language): string {
  return formatDistance(meters, language);
}
