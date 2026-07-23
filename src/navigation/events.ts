import type { LatLng, RouteEvent, RouteEventBundle, RouteEventType, TrafficSegment } from '@dk/shared';

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
 * unreachable, so navigation never loses its zone markers and congestion overlay. Deterministic
 * per route. Zone events come from the manoeuvres the server already injected.
 */
export function mockEventsForRoute(route: { geometry: RouteEventGeometry; maneuvers: RouteEventManeuver[] }): RouteEventBundle {
  const points = toLatLngs(route.geometry.coordinates);
  const totals = cumulative(points);
  const total = totals[totals.length - 1] ?? 0;
  const at = (fraction: number) => {
    const index = Math.min(points.length - 1, Math.round(fraction * (points.length - 1)));
    return { point: points[index], index, distance: totals[index] };
  };

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

  const police = at(0.28);
  events.push({
    id: 'seed-police',
    type: 'police',
    location: police.point,
    routeDistanceMeters: police.distance,
  });
  const hazard = at(0.7);
  events.push({
    id: 'seed-hazard',
    type: 'hazard',
    location: hazard.point,
    routeDistanceMeters: hazard.distance,
  });

  const heavyFrom = Math.round(points.length * 0.34);
  const heavyTo = Math.round(points.length * 0.46);
  const moderateFrom = Math.round(points.length * 0.6);
  const moderateTo = Math.round(points.length * 0.72);
  const traffic: TrafficSegment[] = [
    { fromIndex: heavyFrom, toIndex: heavyTo, level: 'heavy' },
    { fromIndex: moderateFrom, toIndex: moderateTo, level: 'moderate' },
  ];

  const jam = at(0.4);
  events.push({
    id: 'seed-traffic',
    type: 'traffic',
    location: jam.point,
    routeDistanceMeters: jam.distance,
  });

  const heavyMeters = (totals[heavyTo] ?? total) - (totals[heavyFrom] ?? 0);
  const moderateMeters = (totals[moderateTo] ?? total) - (totals[moderateFrom] ?? 0);
  const delaySeconds = Math.round(heavyMeters * 0.09 + moderateMeters * 0.04);

  return { routeId: 'local', events, traffic, delaySeconds };
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
