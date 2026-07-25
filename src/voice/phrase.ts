import type { Language, Maneuver } from '@dk/shared';
import { DISTANCE_LADDER_METERS } from '@dk/shared';

import { cleanInstruction, type Translate } from '@/lib/maneuver';

/**
 * A spoken instruction is built from parts, never read off the screen. Each phrase carries an
 * ordered clip list for the audio path and the same content as plain utterances for the
 * speech fallback. `pause.short` is a silence marker, not a real clip.
 */
export interface AssembledPhrase {
  clipKeys: string[];
  /** Spoken in order with a gap between entries, which is where the natural pause lands. */
  utterances: string[];
  /** Full sentence, for the text fallback and for logging. */
  text: string;
}

const PAUSE = 'pause.short';

/** Rounds a live distance to the nearest rung of the closed announcement ladder. */
export function snapToLadder(meters: number): number {
  let closest = 0;
  let best = Number.POSITIVE_INFINITY;
  for (const rung of DISTANCE_LADDER_METERS) {
    const gap = Math.abs(rung - meters);
    if (gap < best) {
      best = gap;
      closest = rung;
    }
  }
  return closest;
}

function distanceClause(rung: number, t: Translate): { text: string; keys: string[] } {
  if (rung >= 1000) {
    const value = rung / 1000;
    return {
      text: `${t('voice.prefix')} ${t('voice.distanceKm', { value })}`,
      keys: ['prefix.in', `dist.${value}km`],
    };
  }
  return {
    text: `${t('voice.prefix')} ${t('voice.distanceMeters', { value: rung })}`,
    keys: ['prefix.in', `dist.${rung}m`],
  };
}

const SELF_CONTAINED = ['roundabout', 'roundabout_exit', 'arrive', 'depart', 'merge', 'uturn'];

function actionClause(
  maneuver: Maneuver,
  language: Language,
  t: Translate,
): { text: string; keys: string[] } {
  const zone = maneuver.zone ? (language === 'he' ? maneuver.zone.nameHe : maneuver.zone.name) : '';
  const key = `voice.action.${maneuver.action}`;
  const translated = t(key, { zone });
  const keys = [`action.${maneuver.action}`];

  // Unknown action key: i18next echoes the key back. Speak the provider's localised prose
  // instead of a raw key, and let the missing clip fall through to the speech engine.
  if (translated === key) {
    const prose = maneuver.instruction ? cleanInstruction(maneuver.instruction) : t('voice.action.continue');
    return { text: prose, keys };
  }

  const takesStreet = maneuver.street && !SELF_CONTAINED.includes(maneuver.action);
  if (takesStreet) {
    return {
      text: `${translated} ${t('voice.toStreet', { street: maneuver.street })}`,
      keys: [...keys, `street.${maneuver.street}`],
    };
  }
  return { text: translated, keys };
}

/**
 * Builds the spoken phrase from the manoeuvre's structured fields and the live distance. The
 * banner is rendered separately from the same manoeuvre, so neither derives from the other.
 */
export function assembleManeuverPhrase(
  maneuver: Maneuver,
  liveDistanceMeters: number,
  language: Language,
  t: Translate,
): { phrase: AssembledPhrase; rung: number } {
  const rung = snapToLadder(liveDistanceMeters);
  const action = actionClause(maneuver, language, t);

  // At the point itself, drop the distance and say the action plus "now".
  if (rung === 0 || maneuver.action === 'arrive' || maneuver.action === 'depart') {
    const now = maneuver.action === 'arrive' || maneuver.action === 'depart';
    const text = now ? action.text : `${action.text} ${t('voice.now')}`;
    return {
      phrase: {
        clipKeys: now ? action.keys : [...action.keys, 'dist.now'],
        utterances: [text],
        text,
      },
      rung,
    };
  }

  const distance = distanceClause(rung, t);
  return {
    phrase: {
      clipKeys: [...distance.keys, PAUSE, ...action.keys],
      utterances: [distance.text, action.text],
      text: `${distance.text}, ${action.text}`,
    },
    rung,
  };
}

/**
 * Spoken when the vehicle has left the route and a new one is being computed. There is no
 * dedicated clip, so the (missing) key falls through to the speech engine and the plain text.
 */
export function assembleReroutePhrase(t: Translate): AssembledPhrase {
  const text = t('navigation.recalculating');
  return {
    clipKeys: ['misc.recalculating'],
    utterances: [text],
    text,
  };
}

export function assembleZonePhrase(
  zoneName: string,
  approaching: boolean,
  t: Translate,
): AssembledPhrase {
  const key = approaching ? 'voice.action.zone_ahead' : 'voice.action.zone_enter';
  const text = t(key, { zone: zoneName });
  return {
    clipKeys: [approaching ? 'zone.ahead' : 'zone.enter'],
    utterances: [text],
    text,
  };
}
