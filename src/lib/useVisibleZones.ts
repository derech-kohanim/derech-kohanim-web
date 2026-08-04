import { useCallback, useMemo, useState } from 'react';
import type { DangerZoneFeature, ZoneFeature } from '@dk/shared';

import { boxSpan, padBox, zonesNear, type GeoBox } from './zoneFilter';

/**
 * How far beyond the visible edges zones are still drawn, as a fraction of the visible span. A
 * polygon just off screen is then already on the map when the user drags towards it, so a pan
 * never uncovers an empty strip while waiting for the next camera report.
 */
const VIEWPORT_PAD = 0.35;

/**
 * A polygon narrower than this fraction of the visible span covers well under a pixel, so at an
 * extreme zoom-out (the whole country in view) it is skipped rather than turned into a map object
 * that renders as nothing. At neighbourhood or city scale the test never bites: every real zone
 * is far wider than a two-thousandth of the view.
 */
const MIN_VISIBLE_SPAN = 1 / 2000;

/**
 * A camera move smaller than this fraction of the span is treated as the same view, so the tiny
 * pans of the driving camera (and Google's own settling) do not re-filter the layers.
 */
const SAME_VIEW_EPSILON = 0.02;

export interface VisibleZones {
  /** Stringency zones to draw right now. */
  zones: ZoneFeature[];
  /** Danger zones to draw right now. */
  danger: DangerZoneFeature[];
  /** Hand to `MapCanvas` as `onVisibleBoundsChange`. */
  onVisibleBoundsChange: (bounds: GeoBox) => void;
}

function sameView(a: GeoBox, b: GeoBox): boolean {
  const tolerance = boxSpan(a) * SAME_VIEW_EPSILON;
  return (
    Math.abs(a.minLng - b.minLng) <= tolerance &&
    Math.abs(a.maxLng - b.maxLng) <= tolerance &&
    Math.abs(a.minLat - b.minLat) <= tolerance &&
    Math.abs(a.maxLat - b.maxLat) <= tolerance
  );
}

/**
 * The zones to draw for whatever the map is currently showing.
 *
 * The layers arrive country-wide (hundreds of polygons, danger rings with thousands of vertices
 * each), so they are filtered to the visible box: the map reports its viewport as the camera
 * settles, and the set is recomputed against that, padded so panning stays smooth. Until the
 * first report lands - the very first paint - `fallbackBounds` stands in, which is why every
 * screen still draws its trip's zones immediately.
 *
 * `fallbackBounds` must be stable (memoised by the caller); it is a dependency of the filter.
 */
export function useVisibleZones(
  zones: ZoneFeature[] | undefined,
  dangerZones: DangerZoneFeature[] | undefined,
  fallbackBounds: GeoBox | null,
): VisibleZones {
  const [view, setView] = useState<GeoBox | null>(null);

  const onVisibleBoundsChange = useCallback((bounds: GeoBox) => {
    // Keeping the previous object for an unchanged view stops a re-filter (and with it a rebuild
    // of the map overlays) on every idle the map happens to emit.
    setView((current) => (current && sameView(current, bounds) ? current : bounds));
  }, []);

  const bounds = useMemo(
    () => (view ? padBox(view, VIEWPORT_PAD) : fallbackBounds),
    [view, fallbackBounds],
  );
  // Measured on the visible box, not the padded one: what counts is the size on screen.
  const minSpanDeg = view ? boxSpan(view) * MIN_VISIBLE_SPAN : 0;

  return useMemo(
    () => ({
      zones: zonesNear(zones ?? [], bounds, minSpanDeg),
      danger: zonesNear(dangerZones ?? [], bounds, minSpanDeg),
      onVisibleBoundsChange,
    }),
    [zones, dangerZones, bounds, minSpanDeg, onVisibleBoundsChange],
  );
}
