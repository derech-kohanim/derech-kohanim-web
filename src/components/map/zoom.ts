/** Zoom the driving camera holds at its closest, crawling through streets. */
const CLOSE_ZOOM = 18;
/** Zoom it has pulled back to at motorway speed, so the next manoeuvre is still on screen. */
const WIDE_ZOOM = 16;
/** Below this (about 14 km/h) the camera stays at [CLOSE_ZOOM]. */
const SLOW_MPS = 4;
/** At this (about 100 km/h) it has reached [WIDE_ZOOM]. */
const FAST_MPS = 28;

/**
 * The automatic driving zoom for a speed. Quantised to half steps, so a speed that wobbles
 * around a threshold does not nudge the camera on every position update.
 */
export function drivingZoom(speedMps: number): number {
  const fraction = Math.min(1, Math.max(0, (speedMps - SLOW_MPS) / (FAST_MPS - SLOW_MPS)));
  return Math.round((CLOSE_ZOOM - fraction * (CLOSE_ZOOM - WIDE_ZOOM)) * 2) / 2;
}
