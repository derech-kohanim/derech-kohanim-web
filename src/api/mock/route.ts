import type {
  Lane,
  LatLng,
  ManeuverZone,
  RoutePlan,
  RouteRequest,
  RouteResult,
  Maneuver,
  SpeedLimitSegment,
  ZoneProperties,
} from '@dk/shared';

import { distanceMeters, interpolate, pathLengthMeters } from '@/lib/geo';

import { zoneAt } from './zones';

const STREETS_HE = [
  'רבי עקיבא',
  'ז\'בוטינסקי',
  'כהנמן',
  'חזון איש',
  'הרצל',
  'אבא הלל',
  'ז\'בוטינסקי',
  'דרך השלום',
];

const ACTIONS = [
  'depart',
  'turn_right',
  'continue',
  'turn_left',
  'roundabout',
  'continue',
  'turn_right',
  'arrive',
];

/** Road numbers for the mock steps, so the street pill shows a "road N" prefix on some. */
const ROAD_REFS: (string | null)[] = [null, '4', null, '1', null, null, '443', null];

/**
 * Lane layouts at the approach to a turn, left to right, with the lanes that make the turn
 * marked valid. Only turns get lanes, the way real `turn:lanes` data is sparse.
 */
function mockLanes(action: string): Lane[] | undefined {
  if (action === 'turn_right') {
    return [
      { indications: ['left'], valid: false },
      { indications: ['through'], valid: false },
      { indications: ['through', 'right'], valid: true },
      { indications: ['right'], valid: true },
    ];
  }
  if (action === 'turn_left') {
    return [
      { indications: ['left'], valid: true },
      { indications: ['left', 'through'], valid: true },
      { indications: ['through'], valid: false },
    ];
  }
  return undefined;
}

/**
 * Speed limits covering the whole geometry: a built-up stretch at the urban default, an
 * estimated interurban stretch, a signed highway stretch, and a signed urban exit.
 */
function mockSpeedLimits(vertexCount: number): SpeedLimitSegment[] {
  const at = (fraction: number) => Math.round((vertexCount - 1) * fraction);
  return [
    { fromIndex: 0, toIndex: at(0.2), kmh: 50, source: 'urban_default', urban: true },
    { fromIndex: at(0.2), toIndex: at(0.45), kmh: 90, source: 'estimated', urban: false },
    { fromIndex: at(0.45), toIndex: at(0.8), kmh: 110, source: 'sign', urban: false },
    { fromIndex: at(0.8), toIndex: vertexCount - 1, kmh: 50, source: 'sign', urban: true },
  ];
}

/** Bends the straight line so the drawn route reads like a real detour. */
function buildGeometry(origin: LatLng, destination: LatLng, bend: number): LatLng[] {
  const control: LatLng = {
    lat: (origin.lat + destination.lat) / 2 + (destination.lng - origin.lng) * bend,
    lng: (origin.lng + destination.lng) / 2 - (destination.lat - origin.lat) * bend,
  };

  const points: LatLng[] = [];
  const steps = 96;
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const a = interpolate(origin, control, t);
    const b = interpolate(control, destination, t);
    points.push(interpolate(a, b, t));
  }
  return points;
}

/** Builds the ManeuverZone the server injects, carrying the reason and locality. */
function maneuverZone(properties: ZoneProperties): ManeuverZone {
  return {
    name: properties.name,
    nameHe: properties.nameHe,
    stringency: properties.stringency,
    description: properties.description,
    city: properties.city,
  };
}

function buildManeuvers(
  points: LatLng[],
  totalMeters: number,
  clean: boolean,
  zone: ManeuverZone | null,
): Maneuver[] {
  const count = ACTIONS.length;
  const maneuvers: Maneuver[] = [];

  for (let index = 0; index < count; index += 1) {
    const geometryIndex = Math.round((index / (count - 1)) * (points.length - 1));
    const action = ACTIONS[index];
    const street = action === 'arrive' ? null : STREETS_HE[index % STREETS_HE.length];
    maneuvers.push({
      id: `m-${index}`,
      instruction: '',
      action,
      point: points[geometryIndex],
      distanceMeters: Math.round(totalMeters / count),
      geometryIndex,
      street,
      roadRef: ROAD_REFS[index] ?? null,
      ...(action === 'roundabout' ? { exitNumber: 2 } : {}),
      ...(mockLanes(action) ? { lanes: mockLanes(action) } : {}),
      voiceKeys: [
        `prefix.in`,
        `dist.200m`,
        `action.${action}`,
        ...(action === 'roundabout' ? ['exit.2'] : []),
      ],
    });
  }

  if (!clean && zone) {
    maneuvers.splice(3, 0, {
      id: 'm-zone-enter',
      instruction: '',
      action: 'zone_enter',
      point: points[Math.round(points.length * 0.4)],
      distanceMeters: 0,
      geometryIndex: Math.round(points.length * 0.4),
      street: null,
      zone,
      voiceKeys: ['zone.enter'],
    });
    maneuvers.splice(6, 0, {
      id: 'm-zone-exit',
      instruction: '',
      action: 'zone_exit',
      point: points[Math.round(points.length * 0.62)],
      distanceMeters: 0,
      geometryIndex: Math.round(points.length * 0.62),
      street: null,
      zone,
      voiceKeys: ['zone.exit'],
    });
  }

  return maneuvers;
}

const REQUIRED_VOICE_KEYS = [
  'prefix.in',
  'dist.200m',
  'dist.500m',
  'action.turn_right',
  'action.turn_left',
  'action.arrive',
  'zone.enter',
  'zone.exit',
  'exit.2',
  'alert.speed_camera',
  'alert.rail_crossing',
  'alert.speeding',
  'misc.gps_lost',
  'misc.gps_recovered',
  'misc.back_on_route',
  'misc.return_to_route',
];

interface Variant {
  bend: number;
  /** Metres per second. A faster road can be longer yet quicker. */
  speedMps: number;
  suffix: string;
}

interface BuildOptions {
  clean: boolean;
  zone: ManeuverZone | null;
  reason?: string;
  label?: string;
}

/** Builds one RouteResult for a given geometry variant of the same origin/destination pair. */
function buildRoute(request: RouteRequest, variant: Variant, options: BuildOptions): RouteResult {
  const direct = distanceMeters(request.origin, request.destination);
  const points = buildGeometry(request.origin, request.destination, variant.bend);
  // Avoiding tolls trades a slightly longer path, so the toggle visibly changes the numbers.
  const tollFactor = request.avoidTolls ? 1.06 : 1;
  const meters = Math.max(pathLengthMeters(points), direct) * tollFactor;
  const speedMps = request.trafficAware ? variant.speedMps * 0.84 : variant.speedMps;
  const seconds = Math.round(meters / speedMps);

  return {
    id: [
      'route',
      Math.round(direct),
      request.stringency,
      request.trafficAware ? 't' : 'f',
      request.avoidTolls ? 'nt' : 'wt',
      variant.suffix,
    ].join('-'),
    geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) },
    maneuvers: buildManeuvers(points, meters, options.clean, options.zone),
    distanceMeters: Math.round(meters),
    durationSeconds: seconds,
    verifiedClean: options.clean,
    reason: options.reason,
    attribution: 'Routing provided by HERE - mock fixtures',
    engine: request.engine ?? 'mock',
    avoidsTolls: request.avoidTolls ? true : undefined,
    label: options.label,
    detourRatio: Number((meters / Math.max(direct, 1)).toFixed(2)),
    requiredVoiceKeys: REQUIRED_VOICE_KEYS,
    speedLimits: mockSpeedLimits(points.length),
    debug: {
      naiveGeometry: {
        type: 'LineString',
        coordinates: buildGeometry(request.origin, request.destination, 0).map((p) => [
          p.lng,
          p.lat,
        ]),
      },
      naiveDistanceMeters: Math.round(direct),
      attempts: options.clean ? ['avoid_areas'] : ['avoid_areas', 'waypoint_ring_1', 'failed'],
    },
  };
}

/** True when the straight-line route would pass through an active zone. */
function naiveCrossesZone(request: RouteRequest): boolean {
  return buildGeometry(request.origin, request.destination, 0).some((point) =>
    Boolean(zoneAt(point, request.stringency)),
  );
}

/** Assigns short labels by comparing the finished alternatives against each other. */
function labelAlternatives(routes: RouteResult[]): void {
  if (routes.length <= 1) return;
  const fastest = routes.reduce((best, r) => (r.durationSeconds < best.durationSeconds ? r : best));
  const shortest = routes.reduce((best, r) => (r.distanceMeters < best.distanceMeters ? r : best));
  for (const route of routes) {
    route.label = route === fastest ? 'fastest' : route === shortest ? 'shortest' : 'alt';
  }
}

/**
 * Mock RoutePlan: up to three zone-verified alternatives, plus the plain unavoided route when
 * the caller asked for it and avoidance actually changed the outcome.
 */
export function computeMockPlan(request: RouteRequest): RoutePlan {
  const destinationZone = zoneAt(request.destination, request.stringency);
  const originZone = zoneAt(request.origin, request.stringency);
  const endpointBlocked = Boolean(destinationZone ?? originZone);
  const zoneFeature = destinationZone ?? originZone;
  const zone = zoneFeature ? maneuverZone(zoneFeature.properties) : null;

  // Origin or destination sits inside a zone: no clean route exists, mirror the single
  // unverified result the server would return.
  if (endpointBlocked) {
    const only = buildRoute(request, { bend: 0.42, speedMps: 11.2, suffix: 'a' }, {
      clean: false,
      zone,
      reason: 'destination_inside_zone',
      label: 'alt',
    });
    const plan: RoutePlan = { routes: [only] };
    if (request.includeUnavoided) plan.unavoidedRoute = buildUnavoidedRoute(request, zone);
    return plan;
  }

  const variants: Variant[] = [
    { bend: 0.16, speedMps: 11.5, suffix: 'a' },
    { bend: 0.3, speedMps: 13.2, suffix: 'b' },
    { bend: 0.23, speedMps: 10.2, suffix: 'c' },
  ];
  const routes = variants.map((variant) =>
    buildRoute(request, variant, { clean: true, zone: null }),
  );
  labelAlternatives(routes);

  const plan: RoutePlan = { routes };
  // Only surface the unavoided comparison when avoidance actually mattered.
  if (request.includeUnavoided && naiveCrossesZone(request)) {
    plan.unavoidedRoute = buildUnavoidedRoute(request, zone);
  }
  return plan;
}

/** The plain provider route with no avoidance: crosses the zone, never navigable. */
function buildUnavoidedRoute(request: RouteRequest, zone: ManeuverZone | null): RouteResult {
  const crossed =
    zone ??
    (() => {
      const hit = buildGeometry(request.origin, request.destination, 0)
        .map((point) => zoneAt(point, request.stringency))
        .find(Boolean);
      return hit ? maneuverZone(hit.properties) : null;
    })();
  return buildRoute(request, { bend: 0, speedMps: 12.6, suffix: 'unavoided' }, {
    clean: false,
    zone: crossed,
    reason: 'crosses_zone',
    label: 'unavoided',
  });
}
