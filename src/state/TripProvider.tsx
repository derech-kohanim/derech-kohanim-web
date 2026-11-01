import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  DangerZoneCollection,
  LatLng,
  RoutePlan,
  RouteResult,
  ZoneCollection,
} from '@dk/shared';

import { api } from '@/api';
import { currentLanguage } from '@/i18n';
import { analytics } from '@/lib/analytics';
import { getActiveRouteId, getRouteBundle } from '@/lib/offlineCache';
import { voiceEngine } from '@/voice/VoiceEngine';

import { usePreferences } from './PreferencesProvider';

/** Bnei Brak centre. Used until the browser grants a position. */
const FALLBACK_ORIGIN: LatLng = { lat: 32.0807, lng: 34.8338 };

export interface Destination {
  id: string;
  title: string;
  subtitle: string | null;
  location: LatLng;
}

type RouteStatus = 'idle' | 'computing' | 'ready' | 'error';

interface TripApi {
  origin: LatLng;
  locationGranted: boolean;
  /** True while a geolocation request is in flight, for a subtle locating state. */
  locating: boolean;
  /** Re-request the device position. Resolves to the new location, or null if denied. */
  locate: () => Promise<LatLng | null>;
  destination: Destination | null;
  setDestination: (destination: Destination | null) => void;
  /** The selected route: the one drawn highlighted and started for navigation. */
  route: RouteResult | null;
  /** Every zone-verified alternative the server returned, best first. */
  routes: RouteResult[];
  /** Id of the selected route within `routes`. */
  selectedRouteId: string | null;
  /** Pick one of the alternatives as the active route. */
  selectRoute: (routeId: string) => void;
  /** Plain provider route with no avoidance, present only for comparison. Never navigable. */
  unavoidedRoute: RouteResult | null;
  status: RouteStatus;
  errorCode: string | null;
  zones: ZoneCollection | null;
  /** When the stringency zone layers were last loaded from the server, or null. */
  zonesLoadedAt: Date | null;
  /** Danger zones (Area A), a separate layer from the stringency zones. */
  dangerZones: DangerZoneCollection | null;
  compute: (destination: Destination) => Promise<RouteResult | null>;
  recompute: () => Promise<RouteResult | null>;
  /** Recompute the current destination from a new origin, e.g. after drifting off-route. */
  recomputeFrom: (from: LatLng) => Promise<RouteResult | null>;
  /** Abort an in-flight compute and fall back to the last stable state (kept route, else idle). */
  cancel: () => void;
  clear: () => void;
  /**
   * Restore the active route (geometry+maneuvers), its zone layers and voice clips from the
   * offline cache, e.g. after a page reload mid-drive. Resolves to true when a bundle was found
   * and applied. Best-effort: returns false when nothing is cached or the cache is unavailable.
   */
  hydrateFromCache: (routeId?: string) => Promise<boolean>;
}

const TripContext = createContext<TripApi | null>(null);

export function TripProvider({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences();
  const [origin, setOrigin] = useState<LatLng>(FALLBACK_ORIGIN);
  const [locationGranted, setLocationGranted] = useState(false);
  const [locating, setLocating] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [status, setStatus] = useState<RouteStatus>('idle');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [zones, setZones] = useState<ZoneCollection | null>(null);
  const [zonesLoadedAt, setZonesLoadedAt] = useState<Date | null>(null);
  const [dangerZones, setDangerZones] = useState<DangerZoneCollection | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const routes = useMemo(() => plan?.routes ?? [], [plan]);
  const route = useMemo(
    () => routes.find((candidate) => candidate.id === selectedRouteId) ?? routes[0] ?? null,
    [routes, selectedRouteId],
  );
  const unavoidedRoute = plan?.unavoidedRoute ?? null;

  const locate = useCallback((): Promise<LatLng | null> => {
    if (!navigator.geolocation) return Promise.resolve(null);
    setLocating(true);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const here = { lat: position.coords.latitude, lng: position.coords.longitude };
          setOrigin(here);
          setLocationGranted(true);
          setLocating(false);
          resolve(here);
        },
        () => {
          setLocationGranted(false);
          setLocating(false);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }, []);

  useEffect(() => {
    void locate();
  }, [locate]);

  useEffect(() => {
    let cancelled = false;
    void api
      .zones(preferences.stringency)
      .then((collection) => {
        if (!cancelled) {
          setZones(collection);
          setZonesLoadedAt(new Date());
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [preferences.stringency]);

  // Danger zones do not depend on stringency, so they are fetched once. Failure is non-fatal:
  // the client falls back to an empty collection.
  useEffect(() => {
    let cancelled = false;
    void api
      .dangerZones()
      .then((collection) => {
        if (!cancelled) setDangerZones(collection);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const runCompute = useCallback(
    async (target: Destination, fromOrigin?: LatLng): Promise<RouteResult | null> => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      setStatus('computing');
      setErrorCode(null);

      try {
        const result = await api.computeRoute(
          {
            origin: fromOrigin ?? origin,
            destination: target.location,
            stringency: preferences.stringency,
            mode: 'drive',
            trafficAware: preferences.trafficAware,
            avoidTolls: preferences.avoidTolls,
            avoidDangerZones: preferences.avoidDangerZones,
            // Always ask; the server only fills unavoidedRoute when avoidance changed the outcome.
            includeUnavoided: true,
            language: currentLanguage(),
          },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return null;
        if (result.routes.length === 0) {
          setPlan(null);
          setSelectedRouteId(null);
          setStatus('error');
          setErrorCode('avoidance_failed');
          analytics.event('route_computed', {
            stringency: preferences.stringency,
            verified_clean: false,
            alternatives: 0,
            success: false,
          });
          return null;
        }
        setPlan(result);
        // A fresh compute always defaults to the best route.
        setSelectedRouteId(result.routes[0].id);
        setStatus('ready');
        analytics.event('route_computed', {
          stringency: preferences.stringency,
          verified_clean: result.routes[0].verifiedClean,
          alternatives: result.routes.length,
          success: true,
        });
        return result.routes[0];
      } catch (cause) {
        if (controller.signal.aborted || (cause as Error).name === 'AbortError') return null;
        setPlan(null);
        setSelectedRouteId(null);
        setStatus('error');
        setErrorCode((cause as { code?: string }).code ?? 'generic');
        analytics.event('route_computed', {
          stringency: preferences.stringency,
          verified_clean: false,
          alternatives: 0,
          success: false,
        });
        return null;
      }
    },
    [
      origin,
      preferences.stringency,
      preferences.trafficAware,
      preferences.avoidTolls,
      preferences.avoidDangerZones,
    ],
  );

  const compute = useCallback(
    async (target: Destination) => {
      setDestination(target);
      return runCompute(target);
    },
    [runCompute],
  );

  const selectRoute = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);
  }, []);

  // Travel time is priced by the server (Google in the hybrid engine). When the traffic
  // toggle flips, re-fetch so the displayed ETA is the server's number, not a stale one.
  const trafficRef = useRef(preferences.trafficAware);
  useEffect(() => {
    if (trafficRef.current === preferences.trafficAware) return;
    trafficRef.current = preferences.trafficAware;
    if (destination) void runCompute(destination);
  }, [preferences.trafficAware, destination, runCompute]);

  // Toll avoidance is a routing constraint, so flipping it recomputes the whole plan.
  const avoidTollsRef = useRef(preferences.avoidTolls);
  useEffect(() => {
    if (avoidTollsRef.current === preferences.avoidTolls) return;
    avoidTollsRef.current = preferences.avoidTolls;
    if (destination) void runCompute(destination);
  }, [preferences.avoidTolls, destination, runCompute]);

  // Danger-zone avoidance is likewise a routing constraint.
  const avoidDangerRef = useRef(preferences.avoidDangerZones);
  useEffect(() => {
    if (avoidDangerRef.current === preferences.avoidDangerZones) return;
    avoidDangerRef.current = preferences.avoidDangerZones;
    if (destination) void runCompute(destination);
  }, [preferences.avoidDangerZones, destination, runCompute]);

  const recompute = useCallback(
    async () => (destination ? runCompute(destination) : null),
    [destination, runCompute],
  );

  const recomputeFrom = useCallback(
    async (from: LatLng) => (destination ? runCompute(destination, from) : null),
    [destination, runCompute],
  );

  const cancel = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    // A recompute over an existing plan just keeps it; a first compute has nothing to fall back
    // to, so we return to a clean planning state with no destination and no error.
    if (routes.length > 0) {
      setStatus('ready');
    } else {
      setDestination(null);
      setStatus('idle');
    }
    setErrorCode(null);
  }, [routes.length]);

  const clear = useCallback(() => {
    inFlight.current?.abort();
    setDestination(null);
    setPlan(null);
    setSelectedRouteId(null);
    setStatus('idle');
    setErrorCode(null);
  }, []);

  const hydrateFromCache = useCallback(async (routeId?: string): Promise<boolean> => {
    const targetId = routeId ?? getActiveRouteId();
    if (!targetId) return false;
    const bundle = await getRouteBundle(targetId);
    if (!bundle) return false;
    // Restore the route as the sole plan; a reload has no destination context, which the drive
    // does not need (positions and progress are derived locally from the geometry).
    setPlan({ routes: [bundle.route] });
    setSelectedRouteId(bundle.route.id);
    setStatus('ready');
    if (bundle.zones) setZones(bundle.zones);
    if (bundle.dangerZones) setDangerZones(bundle.dangerZones);
    void voiceEngine.loadCachedClips(bundle.voice);
    return true;
  }, []);

  const value = useMemo<TripApi>(
    () => ({
      origin,
      locationGranted,
      locating,
      locate,
      destination,
      setDestination,
      route,
      routes,
      selectedRouteId,
      selectRoute,
      unavoidedRoute,
      status,
      errorCode,
      zones,
      zonesLoadedAt,
      dangerZones,
      compute,
      recompute,
      recomputeFrom,
      cancel,
      clear,
      hydrateFromCache,
    }),
    [
      origin,
      locationGranted,
      locating,
      locate,
      destination,
      route,
      routes,
      selectedRouteId,
      selectRoute,
      unavoidedRoute,
      status,
      errorCode,
      zones,
      zonesLoadedAt,
      dangerZones,
      compute,
      recompute,
      recomputeFrom,
      cancel,
      clear,
      hydrateFromCache,
    ],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripApi {
  const context = useContext(TripContext);
  if (!context) throw new Error('useTrip must be used inside TripProvider');
  return context;
}
