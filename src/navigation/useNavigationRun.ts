import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DangerZoneFeature,
  LatLng,
  ManeuverZone,
  NavigationStatus,
  RouteResult,
  ZoneFeature,
} from '@dk/shared';

import { bearingDegrees, distanceMeters, interpolate, toLatLngs } from '@/lib/geo';

import { ZoneTripwire } from './tripwire';

const TICK_MS = 200;
/** Within this lead distance an upcoming forbidden zone raises the driving alert. */
const ZONE_ALERT_RADIUS = 400;
/** A zone alert lingers a little past the crossing so it does not blink off at the line. */
const ZONE_PASSED_MARGIN = 30;
/** Lateral offset from the route beyond which a fix counts as off-route. */
const OFF_ROUTE_METERS = 45;
/** Consecutive off-route fixes before the state flips, to ride out a single bad GPS reading. */
const OFF_ROUTE_HITS = 2;
/** No fresh GPS fix within this window (while navigating) counts as a lost signal. */
const GPS_STALE_MS = 10_000;

/** The zone layers the local tripwire checks against. */
export interface TripwireZones {
  zones: ZoneFeature[];
  dangerZones: DangerZoneFeature[];
}

export interface ZoneAlertState {
  zone: ManeuverZone;
  distanceMeters: number;
  /** True when the vehicle is inside the zone right now, not just approaching it. */
  inside: boolean;
}

export interface NavigationRunState {
  status: NavigationStatus;
  position: LatLng | null;
  heading: number;
  currentManeuverIndex: number;
  distanceToManeuverMeters: number;
  distanceRemainingMeters: number;
  durationRemainingSeconds: number;
  /** Metres travelled along the route, the anchor for approach detection. */
  travelledMeters: number;
  /** Current ground speed, m/s. */
  speedMps: number;
  zoneAlert: ZoneAlertState | null;
  /** Index of the route vertex the vehicle has most recently passed. */
  routeVertexIndex: number;
  /** True when the device has drifted off the route (real driving only). */
  offRoute: boolean;
  /** True when the geolocation watch errored, or no fresh fix arrived within ~10s (real only). */
  gpsLost: boolean;
  /** Fraction of the route already driven, for the simulation scrubber. */
  progress: number;
}

export interface NavigationRunControls {
  paused: boolean;
  setPaused: (paused: boolean) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  restart: () => void;
  /** Simulation: jump the position straight to a manoeuvre, for stepping between turns. */
  jumpToManeuver: (maneuverIndex: number) => void;
}

/**
 * Drives the navigation screen entirely on the client: position comes from the simulator or the
 * device, progress and the zone alert are derived locally, and no per-second report is sent to
 * the server. Off-route detection is surfaced so the screen can recompute (online) or simply
 * keep showing the route and the live position (offline).
 */
export function useNavigationRun(
  route: RouteResult | null,
  simulated: boolean,
  tripwireZones: TripwireZones | null = null,
): NavigationRunState & NavigationRunControls {
  const points = useMemo(() => (route ? toLatLngs(route.geometry.coordinates) : []), [route]);
  const cumulative = useMemo(() => {
    const totals = [0];
    for (let index = 1; index < points.length; index += 1) {
      totals.push(totals[index - 1] + distanceMeters(points[index - 1], points[index]));
    }
    return totals;
  }, [points]);
  const totalMeters = cumulative[cumulative.length - 1] ?? 0;

  // The local tripwire over every loaded zone, built once per layer. It does not depend on the
  // server: once the layers are in memory it keeps alerting through a dropped connection.
  const tripwire = useMemo(() => {
    if (!tripwireZones) return null;
    const entries = [
      ...tripwireZones.zones.map((feature) => ({
        ring: feature.geometry.coordinates[0] ?? [],
        payload: {
          name: feature.properties.name,
          nameHe: feature.properties.nameHe,
          stringency: feature.properties.stringency,
          description: feature.properties.description,
          city: feature.properties.city,
        } satisfies ManeuverZone,
      })),
      ...tripwireZones.dangerZones.map((feature) => ({
        ring: feature.geometry.coordinates[0] ?? [],
        payload: {
          name: feature.properties.name,
          nameHe: feature.properties.name,
          stringency: 'basic',
          description: feature.properties.description,
          city: feature.properties.city,
          danger: true,
        } satisfies ManeuverZone,
      })),
    ];
    return entries.length > 0 ? new ZoneTripwire<ManeuverZone>(entries) : null;
  }, [tripwireZones]);

  const maneuverDistances = useMemo(
    () =>
      route
        ? route.maneuvers.map(
            (maneuver) => cumulative[Math.min(maneuver.geometryIndex, cumulative.length - 1)] ?? 0,
          )
        : [],
    [route, cumulative],
  );

  const [travelled, setTravelled] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [gpsSpeed, setGpsSpeed] = useState(0);
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const lastGpsPoint = useRef<LatLng | null>(null);
  const [status, setStatus] = useState<NavigationStatus>('idle');
  const [rawPosition, setRawPosition] = useState<LatLng | null>(null);
  const [offRoute, setOffRoute] = useState(false);
  const offRouteHits = useRef(0);
  const arrivedRef = useRef(false);
  const [gpsLost, setGpsLost] = useState(false);
  /** Timestamp of the last accepted GPS fix, for the staleness check. */
  const lastFixAt = useRef<number | null>(null);

  // A fresh route (first load or a reroute onto a new path) starts the drive over: the new
  // geometry begins at the current position, so travelled resets and the off-route state clears.
  const routeId = route?.id ?? null;
  useEffect(() => {
    setTravelled(0);
    setOffRoute(false);
    offRouteHits.current = 0;
    arrivedRef.current = false;
    if (routeId) setStatus('navigating');
    else setStatus('idle');
  }, [routeId]);

  // Simulated movement. The metres per second come from the route itself, so the replay
  // takes as long as the drive would at 1x.
  useEffect(() => {
    if (!simulated || !route || paused || status === 'arrived') return;
    const metresPerSecond = totalMeters / Math.max(route.durationSeconds, 1);
    const timer = window.setInterval(() => {
      setTravelled((current) =>
        Math.min(totalMeters, current + metresPerSecond * speed * (TICK_MS / 1000)),
      );
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [simulated, route, paused, speed, totalMeters, status]);

  // Real positions. The same travelled distance is derived by projecting onto the route, and the
  // lateral offset to the nearest route point drives the off-route detector.
  useEffect(() => {
    if (simulated || !route || !navigator.geolocation) return;
    // Give the first fix a grace window before the watchdog can flag a stale signal.
    lastFixAt.current = Date.now();
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const here = { lat: position.coords.latitude, lng: position.coords.longitude };
        lastFixAt.current = Date.now();
        setGpsLost(false);
        setRawPosition(here);
        let bestIndex = 0;
        let best = Number.POSITIVE_INFINITY;
        for (let index = 0; index < points.length; index += 1) {
          const gap = distanceMeters(points[index], here);
          if (gap < best) {
            best = gap;
            bestIndex = index;
          }
        }
        setTravelled(cumulative[bestIndex]);

        if (best > OFF_ROUTE_METERS) {
          offRouteHits.current += 1;
          if (offRouteHits.current >= OFF_ROUTE_HITS) setOffRoute(true);
        } else {
          offRouteHits.current = 0;
          setOffRoute(false);
        }

        if (typeof position.coords.speed === 'number' && position.coords.speed >= 0) {
          setGpsSpeed(position.coords.speed);
        }
        // Prefer the heading the device reports; when the feed omits it (NaN when stationary
        // or on devices without a compass) derive it from the movement between fixes.
        const feedHeading = position.coords.heading;
        if (typeof feedHeading === 'number' && !Number.isNaN(feedHeading)) {
          setGpsHeading(feedHeading);
        } else if (lastGpsPoint.current && distanceMeters(lastGpsPoint.current, here) >= 3) {
          setGpsHeading(bearingDegrees(lastGpsPoint.current, here));
        }
        lastGpsPoint.current = here;
      },
      // A watch error (permission revoked, position unavailable) is a lost signal, not silence.
      () => setGpsLost(true),
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [simulated, route, points, cumulative]);

  // Watchdog: even without an error callback the feed can just go quiet (tunnel, urban canyon).
  // While navigating for real, flag a lost signal when no fix has arrived within GPS_STALE_MS.
  useEffect(() => {
    if (simulated || !route) {
      setGpsLost(false);
      lastFixAt.current = null;
      return;
    }
    const timer = window.setInterval(() => {
      const last = lastFixAt.current;
      if (last === null || Date.now() - last > GPS_STALE_MS) setGpsLost(true);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [simulated, route]);

  const routePosition = useMemo<LatLng | null>(() => {
    if (points.length === 0) return null;
    let index = 1;
    while (index < cumulative.length && cumulative[index] < travelled) index += 1;
    const previous = Math.max(0, index - 1);
    const span = cumulative[index] - cumulative[previous] || 1;
    const ratio = Math.min(1, Math.max(0, (travelled - cumulative[previous]) / span));
    return interpolate(points[previous], points[Math.min(index, points.length - 1)], ratio);
  }, [points, cumulative, travelled]);

  /** Last route vertex at or behind the travelled distance. */
  const routeVertexIndex = useMemo(() => {
    let index = 0;
    while (index + 1 < cumulative.length && cumulative[index + 1] <= travelled) index += 1;
    return index;
  }, [cumulative, travelled]);

  // On route the marker rides the polyline; off route it shows where the vehicle actually is,
  // so the driver can see the drift and steer back.
  const position = !simulated && offRoute && rawPosition ? rawPosition : routePosition;

  // Heading along the route, used directly when simulating and as the fallback for real driving
  // before the device has reported a usable bearing.
  const routeHeading = useMemo(() => {
    if (points.length < 2 || !routePosition) return 0;
    let index = 1;
    while (index < cumulative.length && cumulative[index] < travelled) index += 1;
    return bearingDegrees(routePosition, points[Math.min(index, points.length - 1)]);
  }, [points, cumulative, travelled, routePosition]);

  const heading = simulated ? routeHeading : gpsHeading ?? routeHeading;

  const restart = useCallback(() => {
    setTravelled(0);
    setStatus('navigating');
    setPaused(false);
  }, []);

  const jumpToManeuver = useCallback(
    (maneuverIndex: number) => {
      if (maneuverDistances.length === 0) return;
      const clamped = Math.max(0, Math.min(maneuverDistances.length - 1, maneuverIndex));
      // Nudge just past the manoeuvre point so it reads as the one you are heading to next.
      setTravelled(Math.min(totalMeters, Math.max(0, maneuverDistances[clamped] - 40)));
      setStatus('navigating');
    },
    [maneuverDistances, totalMeters],
  );

  const remaining = Math.max(0, totalMeters - travelled);
  const arrived = remaining < 20 && totalMeters > 0;

  useEffect(() => {
    if (arrived) {
      arrivedRef.current = true;
      setStatus('arrived');
    }
  }, [arrived]);

  // Which manoeuvre we are heading to, derived along the route so the distance counts down
  // smoothly and the ladder fires cleanly.
  const maneuverIndex = useMemo(() => {
    for (let index = 0; index < maneuverDistances.length; index += 1) {
      if (maneuverDistances[index] > travelled + 5) return index;
    }
    return Math.max(0, maneuverDistances.length - 1);
  }, [maneuverDistances, travelled]);

  const distanceToManeuver = Math.max(0, Math.round((maneuverDistances[maneuverIndex] ?? 0) - travelled));

  // The zone alert has two sources. The route's own zone-enter manoeuvres (injected by the
  // server) give the along-route countdown. The local tripwire adds what the server cannot see
  // in time: the vehicle actually being inside a zone (off the planned line, or on a route that
  // was never verified), and a zone the remaining route enters that has no manoeuvre. The
  // nearest of all candidates wins; being inside always wins.
  const zoneAlert = useMemo<ZoneAlertState | null>(() => {
    if (!route) return null;
    let best: ZoneAlertState | null = null;
    const consider = (candidate: ZoneAlertState) => {
      if (
        !best ||
        (candidate.inside && !best.inside) ||
        (candidate.inside === best.inside && candidate.distanceMeters < best.distanceMeters)
      ) {
        best = candidate;
      }
    };

    for (let index = 0; index < route.maneuvers.length; index += 1) {
      const maneuver = route.maneuvers[index];
      if (maneuver.action !== 'zone_enter' || !maneuver.zone) continue;
      const distance = maneuverDistances[index] - travelled;
      if (distance < -ZONE_PASSED_MARGIN || distance > ZONE_ALERT_RADIUS) continue;
      consider({
        zone: maneuver.zone,
        distanceMeters: Math.max(0, Math.round(distance)),
        inside: false,
      });
    }

    if (tripwire && position) {
      const here = tripwire.containing(position);
      if (here) consider({ zone: here, distanceMeters: 0, inside: true });
      // Probe the remaining route ahead only while on it: off route, the line ahead is not
      // where the vehicle is going.
      if (!here && !(offRoute && !simulated)) {
        const ahead = [position, ...points.slice(routeVertexIndex + 1)];
        const hit = tripwire.firstAlong(ahead, ZONE_ALERT_RADIUS);
        if (hit) {
          consider({
            zone: hit.payload,
            distanceMeters: Math.round(hit.distanceMeters),
            inside: false,
          });
        }
      }
    }
    return best;
  }, [
    route,
    maneuverDistances,
    travelled,
    tripwire,
    position,
    offRoute,
    simulated,
    points,
    routeVertexIndex,
  ]);

  const simSpeed =
    simulated && !paused && !arrived ? totalMeters / Math.max(route?.durationSeconds ?? 1, 1) : 0;

  return {
    status: arrived ? 'arrived' : status,
    position,
    heading,
    currentManeuverIndex: maneuverIndex,
    distanceToManeuverMeters: distanceToManeuver,
    distanceRemainingMeters: Math.round(remaining),
    durationRemainingSeconds: route
      ? Math.round(route.durationSeconds * (totalMeters > 0 ? remaining / totalMeters : 0))
      : 0,
    travelledMeters: travelled,
    speedMps: simulated ? simSpeed : gpsSpeed,
    zoneAlert,
    routeVertexIndex,
    offRoute,
    gpsLost,
    progress: totalMeters > 0 ? travelled / totalMeters : 0,
    paused,
    setPaused,
    speed,
    setSpeed,
    restart,
    jumpToManeuver,
  };
}
