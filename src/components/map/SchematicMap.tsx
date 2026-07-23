import { useMemo } from 'react';
import type {
  DangerZoneFeature,
  GeoJsonLineString,
  LatLng,
  Stringency,
  ZoneFeature,
} from '@dk/shared';
import { useTranslation } from 'react-i18next';

import { EVENT_EMOJI, type TrafficSegment } from '@/navigation/events';

import styles from './map.module.css';
import type { MapCanvasProps } from './types';

const ZONE_CLASS: Record<Stringency, string> = {
  basic: styles.zoneBasic,
  taharat: styles.zoneTaharat,
  machmirim: styles.zoneMachmirim,
};

const zoneClass = (stringency: Stringency) => ZONE_CLASS[stringency] ?? styles.zone;

const WIDTH = 1000;
const HEIGHT = 700;
const PADDING = 0.14;

interface Bounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

function collectBounds(
  zones: (ZoneFeature | DangerZoneFeature)[],
  lines: (GeoJsonLineString | null | undefined)[],
  points: (LatLng | null | undefined)[],
): Bounds {
  const lngs: number[] = [];
  const lats: number[] = [];

  for (const zone of zones) {
    for (const ring of zone.geometry.coordinates) {
      for (const [lng, lat] of ring) {
        lngs.push(lng);
        lats.push(lat);
      }
    }
  }
  for (const line of lines) {
    for (const [lng, lat] of line?.coordinates ?? []) {
      lngs.push(lng);
      lats.push(lat);
    }
  }
  for (const point of points) {
    if (point) {
      lngs.push(point.lng);
      lats.push(point.lat);
    }
  }

  if (lngs.length === 0) {
    return { minLng: 34.79, maxLng: 34.88, minLat: 32.05, maxLat: 32.11 };
  }

  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const padLng = (maxLng - minLng || 0.01) * PADDING;
  const padLat = (maxLat - minLat || 0.01) * PADDING;

  return {
    minLng: minLng - padLng,
    maxLng: maxLng + padLng,
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
  };
}

/** Latitude span shown at a given zoom level, halving with each step in. */
function spanForZoom(zoom: number): number {
  return 0.02 * Math.pow(2, 15 - zoom);
}

function boundsAround(center: LatLng, zoom: number): Bounds {
  const latSpan = spanForZoom(zoom);
  const lngSpan = latSpan * 1.4;
  return {
    minLng: center.lng - lngSpan,
    maxLng: center.lng + lngSpan,
    minLat: center.lat - latSpan,
    maxLat: center.lat + latSpan,
  };
}

/**
 * Schematic map used when no Google Maps key is configured. It draws the same geometry the
 * real map draws, plus the traffic overlay and the on-route events, so every screen stays
 * reviewable without a billing account.
 */
export function SchematicMap({
  zones,
  dangerZones = [],
  onZoneSelect,
  origin,
  destination,
  route,
  alternativeRoutes = [],
  unavoidedRoute,
  naiveRoute,
  vehicle,
  vehicleHeading,
  verifiedClean = true,
  focusOnVehicle = false,
  center,
  camera,
  traffic = [],
  events = [],
}: MapCanvasProps) {
  const { t } = useTranslation();

  // The point the camera holds: the vehicle while driving, or a given centre (home screen).
  const focusPoint = focusOnVehicle ? vehicle : center;
  const following = Boolean(focusPoint) && Boolean(camera) && (camera?.follow ?? true);

  const bounds = useMemo(
    () =>
      following && focusPoint
        ? boundsAround(focusPoint, camera?.zoom ?? 16)
        : collectBounds(
            [...zones, ...dangerZones],
            [route, naiveRoute, unavoidedRoute, ...alternativeRoutes],
            [origin, destination, vehicle],
          ),
    [
      following,
      focusPoint,
      camera?.zoom,
      zones,
      dangerZones,
      route,
      naiveRoute,
      unavoidedRoute,
      alternativeRoutes,
      origin,
      destination,
      vehicle,
    ],
  );

  const toX = (lng: number) => ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * WIDTH;
  const toY = (lat: number) =>
    HEIGHT - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * HEIGHT;

  const pathOf = (line: GeoJsonLineString) =>
    line.coordinates
      .map(([lng, lat], index) => `${index === 0 ? 'M' : 'L'} ${toX(lng)} ${toY(lat)}`)
      .join(' ');

  const segmentPath = (segment: TrafficSegment) =>
    (route?.coordinates.slice(segment.fromIndex, segment.toIndex + 1) ?? [])
      .map(([lng, lat], index) => `${index === 0 ? 'M' : 'L'} ${toX(lng)} ${toY(lat)}`)
      .join(' ');

  // Heading up rotates the world around the vehicle; the arrow then points straight up.
  const headingUp = following && (camera?.headingUp ?? false);
  const rotation = headingUp ? -(vehicleHeading ?? 0) : 0;
  const arrowRotation = headingUp ? 0 : vehicleHeading ?? 0;
  const centerX = vehicle ? toX(vehicle.lng) : WIDTH / 2;
  const centerY = vehicle ? toY(vehicle.lat) : HEIGHT / 2;

  return (
    <div className={styles.canvas}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        className={styles.svg}
        role="img"
        aria-label={t('map.fallbackTitle')}
      >
        <g transform={`rotate(${rotation} ${centerX} ${centerY})`}>
          <g className={styles.grid}>
            {Array.from({ length: 21 }, (_, index) => (
              <line
                key={`v${index}`}
                x1={((index - 5) * WIDTH) / 10}
                y1={-HEIGHT}
                x2={((index - 5) * WIDTH) / 10}
                y2={HEIGHT * 2}
              />
            ))}
            {Array.from({ length: 16 }, (_, index) => (
              <line
                key={`h${index}`}
                x1={-WIDTH}
                y1={((index - 4) * HEIGHT) / 7}
                x2={WIDTH * 2}
                y2={((index - 4) * HEIGHT) / 7}
              />
            ))}
          </g>

          {zones.map((zone) => (
            <polygon
              key={zone.properties.id}
              className={`${zoneClass(zone.properties.stringency)} ${
                onZoneSelect ? styles.zoneInteractive : ''
              }`}
              points={zone.geometry.coordinates[0]
                .map(([lng, lat]) => `${toX(lng)},${toY(lat)}`)
                .join(' ')}
              onClick={
                onZoneSelect
                  ? () => onZoneSelect({ kind: 'stringency', feature: zone })
                  : undefined
              }
            />
          ))}

          {dangerZones.map((zone) => (
            <polygon
              key={`danger-${zone.properties.id}`}
              className={`${styles.zoneDanger} ${onZoneSelect ? styles.zoneInteractive : ''}`}
              points={zone.geometry.coordinates[0]
                .map(([lng, lat]) => `${toX(lng)},${toY(lat)}`)
                .join(' ')}
              onClick={
                onZoneSelect ? () => onZoneSelect({ kind: 'danger', feature: zone }) : undefined
              }
            />
          ))}

          {naiveRoute && <path className={styles.routeNaive} d={pathOf(naiveRoute)} />}
          {alternativeRoutes.map((geometry, index) =>
            geometry ? (
              <path key={`alt-${index}`} className={styles.routeAlt} d={pathOf(geometry)} />
            ) : null,
          )}
          {unavoidedRoute && (
            <path className={styles.routeUnavoided} d={pathOf(unavoidedRoute)} />
          )}
          {route && (
            <>
              <path className={styles.routeCasing} d={pathOf(route)} />
              <path
                className={`${styles.route} ${verifiedClean ? '' : styles['route--unverified']}`}
                d={pathOf(route)}
              />
              {traffic.map((segment, index) => (
                <path
                  key={index}
                  className={
                    segment.level === 'heavy' ? styles.trafficHeavy : styles.trafficModerate
                  }
                  d={segmentPath(segment)}
                />
              ))}
            </>
          )}

          {events.map((event) => (
            <g
              key={event.id}
              transform={`translate(${toX(event.location.lng)} ${toY(event.location.lat)})`}
            >
              <circle className={styles.eventPin} r={17} />
              <text className={styles.eventGlyph} textAnchor="middle" dominantBaseline="central">
                {EVENT_EMOJI[event.type]}
              </text>
            </g>
          ))}

          {origin && <Endpoint x={toX(origin.lng)} y={toY(origin.lat)} kind="origin" />}
          {destination && (
            <Endpoint x={toX(destination.lng)} y={toY(destination.lat)} kind="destination" />
          )}
        </g>

        {vehicle && (
          <g transform={`translate(${centerX} ${centerY})`}>
            <circle className={styles.vehicleHalo} r={30} />
            <g transform={`rotate(${arrowRotation})`}>
              <path className={styles.vehicle} d="M 0 -16 L 12 14 L 0 7 L -12 14 Z" />
            </g>
          </g>
        )}
      </svg>
      {/* Nothing but the driving information competes for attention while moving. */}
      {!focusOnVehicle && <span className={styles.note}>{t('map.fallbackHint')}</span>}
    </div>
  );
}

function Endpoint({ x, y, kind }: { x: number; y: number; kind: 'origin' | 'destination' }) {
  return (
    <g>
      <circle cx={x} cy={y} r={13} className={styles.endpointOuter} />
      <circle
        cx={x}
        cy={y}
        r={9}
        className={kind === 'origin' ? styles.endpointOrigin : styles.endpointDestination}
      />
    </g>
  );
}
