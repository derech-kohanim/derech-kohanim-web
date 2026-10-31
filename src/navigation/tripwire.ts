/**
 * Local tripwire: decides on the device whether a position is inside a forbidden zone, and
 * whether the route ahead enters one, with no server round trip. It keeps working when the
 * connection drops mid-drive, which is when the server alerts stop arriving.
 *
 * The method follows the urban-area check in DirGo (GPLv3, derived from OsmAnd): polygons are
 * converted once to integer fixed point (degrees * 1e5, about 1 m), each carries its bounding
 * box so most polygons are rejected with four comparisons, and the point-in-polygon test is
 * an integer ray cast with cross-multiplication instead of division. A result is reused while
 * the position stays within about 50 m of the last query.
 *
 * Self-contained on purpose (no app imports), so `scripts/check-tripwire.ts` can run it under
 * plain Node.
 */

/** Fixed-point scale: 1e5 units per degree, roughly one metre of latitude per unit. */
const SCALE = 100_000;
/** Reuse the last answer while the query moves less than this, in degrees (about 50 m). */
const CACHE_DEGREES = 0.00045;
const EARTH_RADIUS_METERS = 6_371_000;

export interface TripwireZone<T> {
  /** Outer ring as GeoJSON `[lng, lat]` pairs. Holes are ignored: a zone is all forbidden. */
  ring: [number, number][];
  payload: T;
}

export interface TripwireHit<T> {
  payload: T;
  /** Along-path distance from the start of the probed path to the first point inside. */
  distanceMeters: number;
}

interface IndexedZone<T> {
  lat: Int32Array;
  lng: Int32Array;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  payload: T;
}

interface Point {
  lat: number;
  lng: number;
}

export class ZoneTripwire<T> {
  private readonly zones: IndexedZone<T>[] = [];
  private cacheLat = Number.NaN;
  private cacheLng = Number.NaN;
  private cacheResult: T | null = null;

  constructor(zones: TripwireZone<T>[]) {
    for (const zone of zones) {
      const ring = zone.ring;
      if (!ring || ring.length < 3) continue;
      const count = ring.length;
      const lat = new Int32Array(count);
      const lng = new Int32Array(count);
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;
      for (let index = 0; index < count; index += 1) {
        const y = Math.round(ring[index][1] * SCALE);
        const x = Math.round(ring[index][0] * SCALE);
        lat[index] = y;
        lng[index] = x;
        if (y < minLat) minLat = y;
        if (y > maxLat) maxLat = y;
        if (x < minLng) minLng = x;
        if (x > maxLng) maxLng = x;
      }
      this.zones.push({ lat, lng, minLat, maxLat, minLng, maxLng, payload: zone.payload });
    }
  }

  get size(): number {
    return this.zones.length;
  }

  /**
   * The zone containing the point, or null. Cached: a query within ~50 m of the previous one
   * returns the previous answer without testing any polygon.
   */
  containing(point: Point): T | null {
    if (
      Math.abs(point.lat - this.cacheLat) < CACHE_DEGREES &&
      Math.abs(point.lng - this.cacheLng) < CACHE_DEGREES
    ) {
      return this.cacheResult;
    }
    const result = this.test(point);
    this.cacheLat = point.lat;
    this.cacheLng = point.lng;
    this.cacheResult = result;
    return result;
  }

  /** Uncached point-in-zone test, for probing a path ahead. */
  test(point: Point): T | null {
    const y = Math.round(point.lat * SCALE);
    const x = Math.round(point.lng * SCALE);
    for (const zone of this.zones) {
      if (y < zone.minLat || y > zone.maxLat || x < zone.minLng || x > zone.maxLng) continue;
      if (insideRing(zone.lat, zone.lng, y, x)) return zone.payload;
    }
    return null;
  }

  /**
   * Walks a path (the remaining route, first point = current position) in steps of
   * `stepMeters` up to `maxMeters`, and returns the first zone the path enters with its
   * along-path distance. Null when the probed stretch stays clean.
   */
  firstAlong(path: Point[], maxMeters: number, stepMeters = 20): TripwireHit<T> | null {
    if (path.length === 0 || this.zones.length === 0) return null;
    const first = this.test(path[0]);
    if (first !== null) return { payload: first, distanceMeters: 0 };

    let travelled = 0;
    for (let index = 1; index < path.length; index += 1) {
      const from = path[index - 1];
      const to = path[index];
      const length = haversine(from, to);
      if (length <= 0) continue;
      const steps = Math.max(1, Math.ceil(length / stepMeters));
      for (let step = 1; step <= steps; step += 1) {
        const ratio = step / steps;
        const along = travelled + length * ratio;
        if (along > maxMeters) return null;
        const hit = this.test({
          lat: from.lat + (to.lat - from.lat) * ratio,
          lng: from.lng + (to.lng - from.lng) * ratio,
        });
        if (hit !== null) return { payload: hit, distanceMeters: along };
      }
      travelled += length;
      if (travelled >= maxMeters) return null;
    }
    return null;
  }
}

/**
 * Even-odd ray cast in integer space. For each edge that straddles the point's latitude the
 * crossing longitude is compared by cross-multiplying, so no division and no rounding. Values
 * stay well inside 2^53 (degree differences inside a polygon, times 1e5, squared).
 */
function insideRing(lat: Int32Array, lng: Int32Array, y: number, x: number): boolean {
  let inside = false;
  const count = lat.length;
  for (let index = 0, previous = count - 1; index < count; previous = index, index += 1) {
    const yi = lat[index];
    const yj = lat[previous];
    if (yi > y === yj > y) continue;
    const xi = lng[index];
    const xj = lng[previous];
    // Crossing longitude xc = xi + (y - yi) * (xj - xi) / (yj - yi); test x < xc without
    // dividing, flipping the comparison when the denominator is negative.
    const left = (x - xi) * (yj - yi);
    const right = (y - yi) * (xj - xi);
    if (yj - yi > 0 ? left < right : left > right) inside = !inside;
  }
  return inside;
}

function haversine(a: Point, b: Point): number {
  const toRadians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRadians;
  const dLng = (b.lng - a.lng) * toRadians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRadians) * Math.cos(b.lat * toRadians) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Per-key repeat throttle for alerts: a key may fire again only after `intervalMs`, so an
 * alert that stays true (still inside a zone, still speeding) is repeated at a sane pace
 * rather than once forever or on every tick.
 */
export class AlertThrottle {
  private readonly last = new Map<string, number>();

  /** True (and records the firing) when `key` has not fired within `intervalMs`. */
  shouldFire(key: string, intervalMs: number, now: number = Date.now()): boolean {
    const previous = this.last.get(key);
    if (previous !== undefined && now - previous < intervalMs) return false;
    this.last.set(key, now);
    return true;
  }

  reset(key?: string): void {
    if (key === undefined) this.last.clear();
    else this.last.delete(key);
  }
}
