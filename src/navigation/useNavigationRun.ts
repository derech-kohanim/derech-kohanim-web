import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  LatLng,
  ManeuverZone,
  NavigationProgressResponse,
  NavigationStatus,
  RouteResult,
} from '@dk/shared';

import { api } from '@/api';
import { bearingDegrees, distanceMeters, interpolate, toLatLngs } from '@/lib/geo';

const TICK_MS = 200;
const REPORT_EVERY_MS = 1000;

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
  zoneAlert: { zone: ManeuverZone; distanceMeters: number } | null;
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
 * Drives the navigation screen. Position comes from the simulator or from the device; either
 * way the same progress report goes to the server, so simulation exercises the real path.
 */
export function useNavigationRun(
  route: RouteResult | null,
  simulated: boolean,
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [report, setReport] = useState<NavigationProgressResponse | null>(null);
  const [status, setStatus] = useState<NavigationStatus>('idle');
  const lastReport = useRef(0);
  const arrivedRef = useRef(false);

  useEffect(() => {
    if (!route) return;
    let cancelled = false;
    let created: string | null = null;

    void api
      .startNavigation(route.id, simulated)
      .then((session) => {
        if (cancelled) {
          void api.endNavigation(session.id, arrivedRef.current).catch(() => undefined);
          return;
        }
        created = session.id;
        setSessionId(session.id);
        setStatus('navigating');
      })
      .catch(() => setStatus('navigating'));

    return () => {
      cancelled = true;
      if (created) void api.endNavigation(created, arrivedRef.current).catch(() => undefined);
    };
  }, [route, simulated]);

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

  // Real positions. The same travelled distance is derived by projecting onto the route.
  useEffect(() => {
    if (simulated || !route || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const here = { lat: position.coords.latitude, lng: position.coords.longitude };
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
        if (typeof position.coords.speed === 'number' && position.coords.speed >= 0) {
          setGpsSpeed(position.coords.speed);
        }
      },
      () => undefined,
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [simulated, route, points, cumulative]);

  const position = useMemo<LatLng | null>(() => {
    if (points.length === 0) return null;
    let index = 1;
    while (index < cumulative.length && cumulative[index] < travelled) index += 1;
    const previous = Math.max(0, index - 1);
    const span = cumulative[index] - cumulative[previous] || 1;
    const ratio = Math.min(1, Math.max(0, (travelled - cumulative[previous]) / span));
    return interpolate(points[previous], points[Math.min(index, points.length - 1)], ratio);
  }, [points, cumulative, travelled]);

  const heading = useMemo(() => {
    if (points.length < 2 || !position) return 0;
    let index = 1;
    while (index < cumulative.length && cumulative[index] < travelled) index += 1;
    return bearingDegrees(position, points[Math.min(index, points.length - 1)]);
  }, [points, cumulative, travelled, position]);

  useEffect(() => {
    if (!sessionId || !position) return;
    const now = Date.now();
    if (now - lastReport.current < REPORT_EVERY_MS) return;
    lastReport.current = now;

    void api
      .reportProgress({
        sessionId,
        location: position,
        headingDegrees: heading,
        speedMps: null,
        timestamp: new Date().toISOString(),
      })
      .then((response) => {
        setReport(response);
        setStatus(response.status);
      })
      .catch(() => undefined);
  }, [sessionId, position, heading]);

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

  // Which manoeuvre we are heading to, derived along the route rather than from the once a
  // second server report, so the distance counts down smoothly and the ladder fires cleanly.
  const maneuverIndex = useMemo(() => {
    for (let index = 0; index < maneuverDistances.length; index += 1) {
      if (maneuverDistances[index] > travelled + 5) return index;
    }
    return Math.max(0, maneuverDistances.length - 1);
  }, [maneuverDistances, travelled]);

  const distanceToManeuver = Math.max(0, Math.round((maneuverDistances[maneuverIndex] ?? 0) - travelled));

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
    zoneAlert: report?.zoneAlert
      ? { zone: report.zoneAlert.zone, distanceMeters: report.zoneAlert.distanceMeters }
      : null,
    progress: totalMeters > 0 ? travelled / totalMeters : 0,
    paused,
    setPaused,
    speed,
    setSpeed,
    restart,
    jumpToManeuver,
  };
}
