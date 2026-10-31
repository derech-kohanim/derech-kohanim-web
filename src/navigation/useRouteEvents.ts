import { useMemo } from 'react';

import type { RouteEvent, RouteEventType } from './events';

/** Default approach window, along the route. */
const APPROACH_METERS = 500;
/**
 * Per-type approach windows. A speed camera is announced early enough to slow down; a level
 * crossing matters closer in.
 */
const APPROACH_METERS_BY_TYPE: Partial<Record<RouteEventType, number>> = {
  speed_camera: 500,
  rail_crossing: 300,
};
const PASSED_MARGIN = 40;

export function approachWindowMeters(type: RouteEventType): number {
  return APPROACH_METERS_BY_TYPE[type] ?? APPROACH_METERS;
}

export interface ApproachingEvent {
  event: RouteEvent;
  distanceMeters: number;
}

export interface RouteEventsView {
  /** Events still ahead, nearest first. */
  upcoming: RouteEvent[];
  /** The nearest event within the alert window, or null. */
  approaching: ApproachingEvent | null;
}

/**
 * Turns the flat event list into what the driving screen needs: what is still ahead, and
 * whether anything is close enough to warrant an alert. Distance is measured along the route,
 * so it counts down honestly as the vehicle advances.
 */
export function useRouteEvents(events: RouteEvent[], travelledMeters: number): RouteEventsView {
  return useMemo(() => {
    const upcoming = events
      .filter((event) => event.routeDistanceMeters > travelledMeters - PASSED_MARGIN)
      .map((event) => ({ event, distanceMeters: event.routeDistanceMeters - travelledMeters }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    const approaching =
      upcoming.find(
        (item) =>
          item.distanceMeters <= approachWindowMeters(item.event.type) &&
          item.distanceMeters >= -PASSED_MARGIN,
      ) ?? null;

    return { upcoming: upcoming.map((item) => item.event), approaching };
  }, [events, travelledMeters]);
}
