import { useRef, type MouseEvent } from 'react';
import type { Lane, LaneIndication, Language, Maneuver } from '@dk/shared';
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  MoveDownLeft,
  MoveDownRight,
  Undo2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { formatDistance } from '@/lib/format';
import { maneuverIcon, maneuverText } from '@/lib/maneuver';

import styles from './navigation.module.css';

/** Lanes are shown only this close to the manoeuvre, where the driver can act on them. */
export const LANES_SHOW_WITHIN_METERS = 1200;

const LANE_ICON: Record<LaneIndication, typeof ArrowUp> = {
  left: CornerUpLeft,
  slight_left: ArrowUpLeft,
  sharp_left: MoveDownLeft,
  through: ArrowUp,
  right: CornerUpRight,
  slight_right: ArrowUpRight,
  sharp_right: MoveDownRight,
  reverse: Undo2,
  merge_to_left: ArrowUpLeft,
  merge_to_right: ArrowUpRight,
  none: ArrowUp,
};

/**
 * One lane, drawn with every arrow its markings allow. A lane that serves the manoeuvre is
 * bright, the rest are dimmed, so the right lane reads at a glance.
 */
function LaneCell({ lane }: { lane: Lane }) {
  const indications: LaneIndication[] = lane.indications.length > 0 ? lane.indications : ['none'];
  return (
    <span className={styles.lane} data-valid={lane.valid}>
      {indications.map((indication) => {
        const Icon = LANE_ICON[indication] ?? ArrowUp;
        return <Icon key={indication} size={26} aria-hidden />;
      })}
    </span>
  );
}

/**
 * The lanes at the approach to the current manoeuvre. Lanes are listed left to right in the
 * driving direction, which is the physical road, so the row is always laid out LTR even in
 * the Hebrew (RTL) interface.
 */
export function LaneRow({ lanes }: { lanes: Lane[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.laneRow} dir="ltr" role="img" aria-label={t('navigation.lanes')}>
      {lanes.map((lane, index) => (
        <LaneCell key={index} lane={lane} />
      ))}
    </div>
  );
}

/**
 * The step after the current one, small, under the banner. Tapping it repeats the current
 * instruction aloud.
 */
export function SecondTurn({
  next,
  language,
  onRepeat,
}: {
  next: Maneuver;
  language: Language;
  onRepeat: () => void;
}) {
  const { t } = useTranslation();
  const Icon = maneuverIcon(next.action);
  return (
    <button
      type="button"
      className={styles.secondTurn}
      onClick={onRepeat}
      aria-label={t('navigation.repeatInstruction')}
    >
      <span className={styles.secondTurnLead}>{t('navigation.then')}</span>
      <Icon size={22} aria-hidden className={styles.secondTurnIcon} />
      <span className={styles.secondTurnDistance}>
        {formatDistance(next.distanceMeters, language)}
      </span>
      <span className={styles.secondTurnText}>{maneuverText(next, t, language)}</span>
    </button>
  );
}

/**
 * Font size steps by length, so a long street name shrinks instead of truncating (the same
 * thresholds DirGo uses: up to 16 characters, up to 24, and beyond).
 */
function pillSize(text: string): 'large' | 'medium' | 'small' {
  if (text.length <= 16) return 'large';
  if (text.length <= 24) return 'medium';
  return 'small';
}

/** The road the vehicle is on: "Road 4 • Herzl", or just the street name. */
export function StreetPill({ street, roadRef }: { street: string | null; roadRef: string | null }) {
  const { t } = useTranslation();
  const parts = [roadRef ? t('navigation.road', { ref: roadRef }) : null, street].filter(
    (part): part is string => Boolean(part),
  );
  if (parts.length === 0) return null;
  const text = parts.join(' • ');
  return (
    <div className={styles.streetPill} data-size={pillSize(text)}>
      {text}
    </div>
  );
}

/**
 * Short tap and long press on one control: a press held for `ms` fires `onLongPress` and
 * swallows the click that follows; a shorter press is a normal click.
 */
export function useLongPress(onLongPress: () => void, ms = 550) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return {
    onPointerDown: () => {
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => {
      // A long press on touch opens the context menu in some browsers; it is ours now.
      event.preventDefault();
    },
    /** Wrap the click handler: returns true when the click is the tail of a long press. */
    consumeLongPress: () => {
      const was = fired.current;
      fired.current = false;
      return was;
    },
  };
}
