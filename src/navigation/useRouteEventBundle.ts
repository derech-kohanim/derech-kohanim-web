import { useCallback, useEffect, useState } from 'react';
import type { CreateReportRequest, RouteEvent, RouteEventBundle, RouteResult } from '@dk/shared';

import { api } from '@/api';

import { mockEventsForRoute } from './events';

export interface RouteEventFeed {
  bundle: RouteEventBundle | null;
  /** All events, server feed plus anything reported in this session. */
  events: RouteEvent[];
  submitReport: (body: CreateReportRequest, fallbackDistanceMeters: number) => Promise<void>;
}

/**
 * Loads the per-route event feed from the server, and falls back to a locally generated
 * bundle if the call fails so navigation never loses its zone markers and congestion overlay.
 * A submitted report is POSTed and the server's event is folded into the feed; if the POST
 * fails the report is still shown locally.
 */
export function useRouteEventBundle(route: RouteResult | null): RouteEventFeed {
  const [bundle, setBundle] = useState<RouteEventBundle | null>(null);
  const [reports, setReports] = useState<RouteEvent[]>([]);

  useEffect(() => {
    if (!route) {
      setBundle(null);
      setReports([]);
      return;
    }
    let cancelled = false;
    void api
      .routeEvents(route.id)
      .then((served) => {
        if (!cancelled) setBundle(served);
      })
      .catch(() => {
        if (!cancelled) setBundle(mockEventsForRoute(route));
      });
    return () => {
      cancelled = true;
    };
  }, [route]);

  const submitReport = useCallback(
    async (body: CreateReportRequest, fallbackDistanceMeters: number) => {
      try {
        const created = await api.createReport(body);
        setReports((current) => [...current, created]);
      } catch {
        setReports((current) => [
          ...current,
          {
            id: `local-${Date.now()}`,
            type: body.type,
            location: body.location,
            routeDistanceMeters: fallbackDistanceMeters,
            reportedByUser: true,
          },
        ]);
      }
    },
    [],
  );

  return { bundle, events: [...(bundle?.events ?? []), ...reports], submitReport };
}
