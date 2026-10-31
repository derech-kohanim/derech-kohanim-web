import type { SpeedLimitSegment } from '@dk/shared';
import { useTranslation } from 'react-i18next';

import styles from './navigation.module.css';

/** The ring is full at this speed. */
const RING_MAX_KMH = 120;
/** Above the limit by more than this, the driver counts as speeding (frame turns red). */
export const SPEEDING_MARGIN_KMH = 5;
/** Above the limit by more than this, the speeding alert is spoken. */
export const SPEEDING_ALERT_MARGIN_KMH = 10;

const RADIUS = 28;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The speed limit at a route vertex, from the route's contiguous segments. The last segment's
 * end is inclusive, so the final vertex still has a limit. Null when unknown.
 */
export function speedLimitAt(
  segments: SpeedLimitSegment[] | undefined,
  vertexIndex: number,
): SpeedLimitSegment | null {
  if (!segments || segments.length === 0) return null;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const last = index === segments.length - 1;
    if (vertexIndex >= segment.fromIndex && (vertexIndex < segment.toIndex || last)) {
      return segment.kmh === null ? null : segment;
    }
  }
  return null;
}

/** True when `speedKmh` is over `limitKmh` by more than `margin`. */
export function isOverLimit(speedKmh: number, limitKmh: number | null, margin: number): boolean {
  return limitKmh !== null && speedKmh > limitKmh + margin;
}

/**
 * Current speed inside a ring that fills towards 120 km/h, plus the road-sign style limit next
 * to it when the route knows one. Over the limit the ring turns red.
 */
export function Speedometer({ speedKmh, limitKmh }: { speedKmh: number; limitKmh: number | null }) {
  const { t } = useTranslation();
  const over = isOverLimit(speedKmh, limitKmh, SPEEDING_MARGIN_KMH);
  const fraction = Math.min(1, Math.max(0, speedKmh / RING_MAX_KMH));

  return (
    <div className={styles.speedCluster}>
      <div className={styles.speedo} data-over={over}>
        <svg className={styles.speedoRing} viewBox="0 0 64 64" aria-hidden>
          <circle className={styles.speedoTrack} cx="32" cy="32" r={RADIUS} />
          <circle
            className={styles.speedoFill}
            cx="32"
            cy="32"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          />
        </svg>
        <span className={styles.speedoValue}>{speedKmh}</span>
        <span className={styles.speedoUnit}>{t('navigation.speedUnit')}</span>
      </div>
      {limitKmh !== null && (
        <div className={styles.limitSign} role="img" aria-label={t('navigation.speedLimit', { limit: limitKmh })}>
          {limitKmh}
        </div>
      )}
    </div>
  );
}
