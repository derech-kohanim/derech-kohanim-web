import type { DangerZoneFeature, GeoJsonLineString, LatLng, ZoneFeature } from '@dk/shared';

/** A lng/lat bounding box. */
export interface GeoBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

type AnyZone = ZoneFeature | DangerZoneFeature;

/** Bounding box of a polygon's outer ring. */
function featureBox(feature: AnyZone): GeoBox {
  const ring = feature.geometry.coordinates[0];
  const lngs = ring.map(([lng]) => lng);
  const lats = ring.map(([, lat]) => lat);
  return {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

/**
 * The bounding box of the reference geometry (points + lines), padded by `padDeg` degrees
 * (~111 km per degree of latitude). Returns null when there is nothing to anchor on.
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

/** True when two boxes overlap. */
function boxesIntersect(a: GeoBox, b: GeoBox): boolean {
  return a.minLng <= b.maxLng && a.maxLng >= b.minLng && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}

/**
 * Keeps only the zones whose bounding box intersects `bounds`. With the real data covering the
 * whole country this keeps the map to the handful of polygons near the route/view, so framing
 * is not thrown off by a far-away zone and hundreds of polygons are never drawn at once.
 * A null `bounds` (nothing to anchor on) returns every zone unchanged.
 */
export function zonesNear<T extends AnyZone>(zones: T[], bounds: GeoBox | null): T[] {
  if (!bounds) return zones;
  return zones.filter((zone) => boxesIntersect(featureBox(zone), bounds));
}
