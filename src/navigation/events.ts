import type { LatLng, RouteEvent, RouteEventBundle, RouteEventType } from '@dk/shared';

import { distanceMeters, toLatLngs } from '@/lib/geo';

// The event model now lives in the shared contract and is served per route. Re-export the
// pieces the UI consumes so call sites keep one import, and keep only the client side helpers
// and a local generator used as a graceful fallback when the events call fails.
export type { RouteEvent, RouteEventBundle, RouteEventType, TrafficSegment } from '@dk/shared';
export { REPORT_TYPES } from '@dk/shared';

export const EVENT_EMOJI: Record<RouteEventType, string> = {
  zone: '🛑',
  traffic: '🐢',
  police: '🚓',
  accident: '💥',
  hazard: '⚠️',
  closure: '⛔',
};

function cumulative(points: LatLng[]): number[] {
  const totals = [0];
  for (let index = 1; index < points.length; index += 1) {
    totals.push(totals[index - 1] + distanceMeters(points[index - 1], points[index]));
  }
  return totals;
}

/**
 * Fallback event bundle, generated on the client when the server events endpoint is
 * unreachable, so navigation never loses its zone markers. Deterministic per route. Zone
 * events come from the manoeuvres the server already injected; no traffic, police, hazard or
 * other incidents are fabricated here - those only ever come from real reports via the API.
 */
export function mockEventsForRoute(route: { geometry: RouteEventGeometry; maneuvers: RouteEventManeuver[] }): RouteEventBundle {
  const points = toLatLngs(route.geometry.coordinates);
  const totals = cumulative(points);

  const events: RouteEvent[] = [];

  for (const maneuver of route.maneuvers) {
    if (maneuver.action === 'zone_enter' && maneuver.zone) {
      events.push({
        id: `zone-${maneuver.id}`,
        type: 'zone',
        location: maneuver.point,
        routeDistanceMeters: totals[Math.min(maneuver.geometryIndex, totals.length - 1)] ?? 0,
        label: maneuver.zone.name,
        labelHe: maneuver.zone.nameHe,
      });
    }
  }

  return { routeId: 'local', events, traffic: [], delaySeconds: 0 };
}

interface RouteEventGeometry {
  coordinates: [number, number][];
}

interface RouteEventManeuver {
  id: string;
  action: string;
  point: LatLng;
  geometryIndex: number;
  zone?: { name: string; nameHe: string };
}

export function eventLabel(
  event: RouteEvent,
  language: 'he' | 'en',
  t: (key: string) => string,
): string {
  if (event.type === 'zone') {
    return (language === 'he' ? event.labelHe : event.label) ?? t('events.zone');
  }
  return t(`events.${event.type}`);
}
