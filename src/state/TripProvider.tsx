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
import type { LatLng, RouteResult, ZoneCollection } from '@dk/shared';

import { api } from '@/api';
import { currentLanguage } from '@/i18n';

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
  route: RouteResult | null;
  status: RouteStatus;
  errorCode: string | null;
  zones: ZoneCollection | null;
  compute: (destination: Destination) => Promise<RouteResult | null>;
  recompute: () => Promise<RouteResult | null>;
  /** Abort an in-flight compute and fall back to the last stable state (kept route, else idle). */
  cancel: () => void;
  clear: () => void;
}

const TripContext = createContext<TripApi | null>(null);

export function TripProvider({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences();
  const [origin, setOrigin] = useState<LatLng>(FALLBACK_ORIGIN);
  const [locationGranted, setLocationGranted] = useState(false);
  const [locating, setLocating] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [status, setStatus] = useState<RouteStatus>('idle');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [zones, setZones] = useState<ZoneCollection | null>(null);
  const inFlight = useRef<AbortController | null>(null);

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
        if (!cancelled) setZones(collection);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [preferences.stringency]);

  const runCompute = useCallback(
    async (target: Destination): Promise<RouteResult | null> => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      setStatus('computing');
      setErrorCode(null);

      try {
        const result = await api.computeRoute(
          {
            origin,
            destination: target.location,
            stringency: preferences.stringency,
            mode: 'drive',
            trafficAware: preferences.trafficAware,
            language: currentLanguage(),
          },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return null;
        setRoute(result);
        setStatus('ready');
        return result;
      } catch (cause) {
        if (controller.signal.aborted || (cause as Error).name === 'AbortError') return null;
        setRoute(null);
        setStatus('error');
        setErrorCode((cause as { code?: string }).code ?? 'generic');
        return null;
      }
    },
    [origin, preferences.stringency, preferences.trafficAware],
  );

  const compute = useCallback(
    async (target: Destination) => {
      setDestination(target);
      return runCompute(target);
    },
    [runCompute],
  );

  // Travel time is priced by the server (Google in the hybrid engine). When the traffic
  // toggle flips, re-fetch so the displayed ETA is the server's number, not a stale one.
  const trafficRef = useRef(preferences.trafficAware);
  useEffect(() => {
    if (trafficRef.current === preferences.trafficAware) return;
    trafficRef.current = preferences.trafficAware;
    if (destination) void runCompute(destination);
  }, [preferences.trafficAware, destination, runCompute]);

  const recompute = useCallback(
    async () => (destination ? runCompute(destination) : null),
    [destination, runCompute],
  );

  const cancel = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    // A recompute over an existing route just keeps that route; a first compute has nothing to
    // fall back to, so we return to a clean planning state with no destination and no error.
    if (route) {
      setStatus('ready');
    } else {
      setDestination(null);
      setStatus('idle');
    }
    setErrorCode(null);
  }, [route]);

  const clear = useCallback(() => {
    inFlight.current?.abort();
    setDestination(null);
    setRoute(null);
    setStatus('idle');
    setErrorCode(null);
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
      status,
      errorCode,
      zones,
      compute,
      recompute,
      cancel,
      clear,
    }),
    [
      origin,
      locationGranted,
      locating,
      locate,
      destination,
      route,
      status,
      errorCode,
      zones,
      compute,
      recompute,
      cancel,
      clear,
    ],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripApi {
  const context = useContext(TripContext);
  if (!context) throw new Error('useTrip must be used inside TripProvider');
  return context;
}
