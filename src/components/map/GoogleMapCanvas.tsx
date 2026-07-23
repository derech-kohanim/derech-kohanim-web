import { useEffect } from 'react';
import type { GeoJsonLineString, ZoneFeature } from '@dk/shared';
import { APIProvider, Map, Marker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

import { env } from '@/env';
import { tokenColor } from '@/lib/tokenColor';
import { EVENT_EMOJI, type RouteEvent, type TrafficSegment } from '@/navigation/events';

import styles from './map.module.css';
import type { MapCanvasProps } from './types';

const DEFAULT_ZOOM = 14;
const DRIVING_ZOOM = 17;

export function GoogleMapCanvas(props: MapCanvasProps) {
  const centre = props.vehicle ?? props.center ?? props.origin ?? { lat: 32.0807, lng: 34.8338 };

  return (
    <div className={styles.canvas}>
      <APIProvider apiKey={env.googleMapsKey}>
        <Map
          defaultCenter={centre}
          defaultZoom={props.focusOnVehicle ? DRIVING_ZOOM : props.camera?.zoom ?? DEFAULT_ZOOM}
          gestureHandling="greedy"
          disableDefaultUI
          // No POI info cards while driving: a tap must not open a details popup.
          clickableIcons={!props.disablePoi}
          style={{ inlineSize: '100%', blockSize: '100%' }}
        >
          <Zones zones={props.zones} />
          <Line geometry={props.naiveRoute} colorToken="route-naive" weight={3} dashed />
          {/* Faded alternatives sit under the selected route. */}
          {(props.alternativeRoutes ?? []).map((geometry, index) => (
            <Line
              key={index}
              geometry={geometry}
              colorToken="text-muted"
              weight={5}
              opacity={0.55}
            />
          ))}
          {/* The unavoided comparison route: a clear warning style, never the selected one. */}
          <Line geometry={props.unavoidedRoute} colorToken="warning" weight={5} dashed />
          <Line
            geometry={props.route}
            colorToken={props.verifiedClean === false ? 'danger' : 'primary'}
            weight={7}
            dashed={props.verifiedClean === false}
          />
          <Traffic route={props.route} traffic={props.traffic ?? []} />
          {props.origin && <Marker position={props.origin} />}
          {props.destination && <Marker position={props.destination} />}
          <Events events={props.events ?? []} />
          <Vehicle position={props.vehicle} heading={props.vehicleHeading} />
          <Camera {...props} />
        </Map>
      </APIProvider>
    </div>
  );
}

function Traffic({
  route,
  traffic,
}: {
  route: GeoJsonLineString | null | undefined;
  traffic: TrafficSegment[];
}) {
  const map = useMap();
  const maps = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !maps || !route) return;
    const lines = traffic.map((segment) => {
      const color = tokenColor(segment.level === 'heavy' ? 'danger' : 'warning');
      return new maps.Polyline({
        path: route.coordinates
          .slice(segment.fromIndex, segment.toIndex + 1)
          .map(([lng, lat]) => ({ lat, lng })),
        strokeColor: color,
        strokeWeight: 7,
        strokeOpacity: 0.95,
        clickable: false,
        map,
      });
    });
    return () => lines.forEach((line) => line.setMap(null));
  }, [map, maps, route, traffic]);

  return null;
}

function Events({ events }: { events: RouteEvent[] }) {
  return (
    <>
      {events.map((event) => (
        <Marker
          key={event.id}
          position={event.location}
          label={{ text: EVENT_EMOJI[event.type], fontSize: '20px' }}
          icon={{
            path: 0,
            scale: 14,
            fillColor: tokenColor('surface'),
            fillOpacity: 1,
            strokeColor: tokenColor('border'),
            strokeWeight: 2,
          }}
        />
      ))}
    </>
  );
}

function Zones({ zones }: { zones: ZoneFeature[] }) {
  const map = useMap();
  const maps = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !maps) return;
    const polygons = zones.map((zone) => {
      // Colour each polygon by its own stringency layer, not by the requested level.
      const color = tokenColor(`zone-${zone.properties.stringency}`);
      return new maps.Polygon({
        paths: zone.geometry.coordinates.map((ring) => ring.map(([lng, lat]) => ({ lat, lng }))),
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.24,
        clickable: false,
        map,
      });
    });
    return () => polygons.forEach((polygon) => polygon.setMap(null));
  }, [map, maps, zones]);

  return null;
}

function Line({
  geometry,
  colorToken,
  weight,
  dashed = false,
  opacity = 0.95,
}: {
  geometry: GeoJsonLineString | null | undefined;
  colorToken: string;
  weight: number;
  dashed?: boolean;
  opacity?: number;
}) {
  const map = useMap();
  const maps = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !maps || !geometry) return;
    const color = tokenColor(colorToken);
    const polyline = new maps.Polyline({
      path: geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      strokeColor: color,
      strokeWeight: dashed ? 0 : weight,
      strokeOpacity: dashed ? 0 : opacity,
      icons: dashed
        ? [
            {
              icon: { path: 'M 0,-1 0,1', strokeColor: color, strokeOpacity: 0.9, strokeWeight: weight, scale: 3 },
              offset: '0',
              repeat: '16px',
            },
          ]
        : undefined,
      clickable: false,
      map,
    });
    return () => polyline.setMap(null);
  }, [map, maps, geometry, colorToken, weight, dashed, opacity]);

  return null;
}

function Vehicle({
  position,
  heading,
}: {
  position: MapCanvasProps['vehicle'];
  heading: MapCanvasProps['vehicleHeading'];
}) {
  const maps = useMapsLibrary('maps');
  if (!position || !maps) return null;

  return (
    <Marker
      position={position}
      icon={{
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 7,
        rotation: heading ?? 0,
        fillColor: tokenColor('primary'),
        fillOpacity: 1,
        strokeColor: tokenColor('surface'),
        strokeWeight: 2,
      }}
    />
  );
}

/** Frames the route once, then follows the vehicle while driving. */
function Camera({
  zones,
  origin,
  destination,
  route,
  vehicle,
  vehicleHeading,
  focusOnVehicle,
  center,
  camera,
}: MapCanvasProps) {
  const map = useMap();
  const core = useMapsLibrary('core');
  const focusPoint = focusOnVehicle ? vehicle : center;
  const following = Boolean(camera) && (camera?.follow ?? true) && Boolean(focusPoint);

  useEffect(() => {
    if (!map || !core || following) return;
    const bounds = new core.LatLngBounds();
    let used = false;
    for (const [lng, lat] of route?.coordinates ?? []) {
      bounds.extend({ lat, lng });
      used = true;
    }
    for (const point of [origin, destination]) {
      if (point) {
        bounds.extend(point);
        used = true;
      }
    }
    if (!used) {
      for (const zone of zones) {
        for (const [lng, lat] of zone.geometry.coordinates[0]) {
          bounds.extend({ lat, lng });
          used = true;
        }
      }
    }
    if (used) map.fitBounds(bounds, 64);
  }, [map, core, route, origin, destination, zones, following]);

  useEffect(() => {
    if (!map || !following || !focusPoint) return;
    map.panTo(focusPoint);
    if (camera) {
      map.setZoom(camera.zoom);
      // Heading up needs a vector map and only applies to the driving vehicle; where it is
      // unsupported this is simply ignored.
      map.setHeading?.(camera.headingUp && vehicle ? vehicleHeading ?? 0 : 0);
    }
  }, [map, following, focusPoint, vehicle, vehicleHeading, camera]);

  return null;
}
