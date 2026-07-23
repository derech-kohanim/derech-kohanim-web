import { useMemo } from 'react';

import type { RouteEvent } from './events';

const APPROACH_METERS = 500;
const PASSED_MARGIN = 40;

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
      upcoming.find((item) => item.distanceMeters <= APPROACH_METERS && item.distanceMeters >= -PASSED_MARGIN) ??
      null;

    return { upcoming: upcoming.map((item) => item.event), approaching };
  }, [events, travelledMeters]);
}
