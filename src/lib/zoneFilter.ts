import type { DangerZoneFeature, GeoJsonLineString, LatLng, ZoneFeature } from '@dk/shared';

/** A lng/lat bounding box. */
export interface GeoBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

type AnyZone = ZoneFeature | DangerZoneFeature;

/**
 * Feature bounding boxes, cached per feature object. The zone layers are fetched once and then
 * re-filtered on every camera move, so each box is computed exactly once and reused for the life
 * of the layer. A WeakMap keeps the cache tied to the features themselves, so a re-fetched layer
 * is not held alive by it.
 */
const boxCache = new WeakMap<AnyZone, GeoBox>();

/**
 * Bounding box of a polygon's outer ring. Walked with a plain loop rather than
 * `Math.min(...ring)`: a danger-zone ring carries thousands of vertices, and spreading one into a
 * call blows the argument limit (a RangeError) on the largest of them.
 */
function featureBox(feature: AnyZone): GeoBox {
  const cached = boxCache.get(feature);
  if (cached) return cached;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of feature.geometry.coordinates[0] ?? []) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  // An empty ring leaves the box inverted, which intersects nothing - exactly right for a
  // feature with no geometry to draw.
  const box: GeoBox = { minLng, maxLng, minLat, maxLat };
  boxCache.set(feature, box);
  return box;
}

/**
 * The bounding box of the reference geometry (points + lines), padded by `padDeg` degrees
 * (~111 km per degree of latitude). Returns null when there is nothing to anchor on.
 *
 * This is the fallback frame only: it answers "where is the trip", not "what is on screen". The
 * drawn zone set follows the live camera (see `useVisibleZones`); these bounds cover the first
 * paint, before the map has reported a viewport.
 */
export function referenceBounds(
  points: (LatLng | null | undefined)[],
  lines: (GeoJsonLineString | null | undefined)[] = [],
  padDeg = 0.06,
): GeoBox | null {
  const lngs: number[] = [];
  const lats: number[] = [];
  for (const point of points) {
    if (point) {
      lngs.push(point.lng);
      lats.push(point.lat);
    }
  }
  for (const line of lines) {
    for (const [lng, lat] of line?.coordinates ?? []) {
      lngs.push(lng);
      lats.push(lat);
    }
  }
  if (lngs.length === 0) return null;
  return {
    minLng: Math.min(...lngs) - padDeg,
    maxLng: Math.max(...lngs) + padDeg,
    minLat: Math.min(...lats) - padDeg,
    maxLat: Math.max(...lats) + padDeg,
  };
}

/** Grows a box outwards by `fraction` of its own span on each side. */
export function padBox(box: GeoBox, fraction: number): GeoBox {
  const padLng = (box.maxLng - box.minLng) * fraction;
  const padLat = (box.maxLat - box.minLat) * fraction;
  return {
    minLng: box.minLng - padLng,
    maxLng: box.maxLng + padLng,
    minLat: box.minLat - padLat,
    maxLat: box.maxLat + padLat,
  };
}

/** The longer side of a box, in degrees. */
export function boxSpan(box: GeoBox): number {
  return Math.max(box.maxLng - box.minLng, box.maxLat - box.minLat);
}

/** True when two boxes overlap. */
function boxesIntersect(a: GeoBox, b: GeoBox): boolean {
  return a.minLng <= b.maxLng && a.maxLng >= b.minLng && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}

/**
 * Keeps only the zones worth drawing for `bounds`: their bounding box has to overlap it, and
 * (when `minSpanDeg` is given) be at least that wide, so a polygon far too small to register at
 * the current scale is not turned into a map object for nothing. Boxes are cached per feature,
 * so this is a handful of number comparisons per zone even on the country-wide layer.
 * A null `bounds` (nothing to anchor on) returns every zone unchanged.
 */
export function zonesNear<T extends AnyZone>(
  zones: T[],
  bounds: GeoBox | null,
  minSpanDeg = 0,
): T[] {
  if (!bounds) return zones;
  return zones.filter((zone) => {
    const box = featureBox(zone);
    if (!boxesIntersect(box, bounds)) return false;
    return minSpanDeg <= 0 || boxSpan(box) >= minSpanDeg;
  });
}
