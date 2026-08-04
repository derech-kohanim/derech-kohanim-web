import { useEffect, useMemo, useRef } from 'react';
import type { DangerZoneFeature, GeoJsonLineString, ZoneFeature } from '@dk/shared';
// Aliased: the overlays below keep their drawn polygons in a plain `Map`, which the component of
// the same name would otherwise shadow.
import { APIProvider, Map as GoogleMap, Marker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

import { env } from '@/env';
import { nearestPointIndex, toLatLngs } from '@/lib/geo';
import { tokenColor } from '@/lib/tokenColor';
import type { GeoBox } from '@/lib/zoneFilter';
import { EVENT_EMOJI, type RouteEvent, type TrafficSegment } from '@/navigation/events';

import styles from './map.module.css';
import type { MapCanvasProps, SelectedZone } from './types';

const DEFAULT_ZOOM = 14;
const DRIVING_ZOOM = 17;
/** The 3D perspective tilt held while driving, so navigation is always a 3D roadmap. */
const DRIVING_TILT = 45;
/**
 * Shortest gap between two viewport reports. A drag fires `bounds_changed` on every frame and the
 * driving camera pans on every position fix, so the reports are throttled: re-filtering the
 * country-wide zone layers belongs at human pace, not at frame pace.
 */
const VIEWPORT_THROTTLE_MS = 250;

/** A zone polygon already on the map, held with the feature it was built from. */
interface DrawnZone<T> {
  feature: T;
  polygon: google.maps.Polygon;
}

// Waze-style dimensional route: a darker casing under a brighter active line. Literal hex is
// used per the design; the active blue stays close to the app's primary while reading as "route".
const ROUTE_CASING = '#1565C0';
const ROUTE_ACTIVE = '#2D8CFF';
const ROUTE_ALT = '#9AA5B1';
// Unverified (a route that could not be proven clean): the same two-layer treatment in danger red.
const ROUTE_CASING_DANGER = '#7F1D1D';

export function GoogleMapCanvas(props: MapCanvasProps) {
  const centre = props.vehicle ?? props.center ?? props.origin ?? { lat: 32.0807, lng: 34.8338 };

  // Whether the map is actually turned so travel points up. This mirrors the Camera below (which
  // only sets the heading while following the driving vehicle), so the arrow can be rotated to
  // match: on a heading-up map the arrow points straight up (0), otherwise it points along travel.
  const focusPoint = props.focusOnVehicle ? props.vehicle : props.center;
  const following = Boolean(props.camera) && (props.camera?.follow ?? true) && Boolean(focusPoint);
  const mapHeadingUp = following && Boolean(props.camera?.headingUp) && Boolean(props.vehicle);

  // Draw only the road ahead: from the vehicle to the destination. The nearest route vertex to
  // the vehicle is the slice point; the exact vehicle point is prepended so the line starts under
  // the marker. Traffic keeps the full route so its by-index segments stay aligned; it is told
  // where the vehicle is so it can drop segments already behind.
  const trimIndex = useMemo(() => {
    if (!props.route || !props.vehicle) return null;
    const points = toLatLngs(props.route.coordinates);
    if (points.length === 0) return null;
    return nearestPointIndex(points, props.vehicle);
  }, [props.route, props.vehicle]);

  const drawnRoute = useMemo<GeoJsonLineString | null | undefined>(() => {
    if (!props.route) return props.route;
    if (trimIndex == null || !props.vehicle) return props.route;
    const ahead = props.route.coordinates.slice(trimIndex);
    const vehiclePoint: [number, number] = [props.vehicle.lng, props.vehicle.lat];
    return { type: 'LineString', coordinates: [vehiclePoint, ...ahead] };
  }, [props.route, trimIndex, props.vehicle]);

  return (
    <div className={styles.canvas}>
      <APIProvider apiKey={env.googleMapsKey}>
        <GoogleMap
          // A vector Map ID lets the map rotate to the heading and tilt into 3D while driving;
          // without one Google renders a raster map that stays flat and north-up.
          mapId={env.googleMapsId || undefined}
          // Always the roadmap base (never satellite/terrain), so the driving view is a clean 3D
          // roadmap once the camera tilts.
          mapTypeId="roadmap"
          defaultCenter={centre}
          defaultZoom={
            props.focusOnVehicle ? props.camera?.zoom ?? DRIVING_ZOOM : props.camera?.zoom ?? DEFAULT_ZOOM
          }
          // Open the driving view already tilted into 3D, before the camera effect runs.
          defaultTilt={props.focusOnVehicle ? DRIVING_TILT : 0}
          gestureHandling="greedy"
          disableDefaultUI
          // No POI info cards while driving: a tap must not open a details popup.
          clickableIcons={!props.disablePoi}
          style={{ inlineSize: '100%', blockSize: '100%' }}
        >
          <Viewport onChange={props.onVisibleBoundsChange} />
          <Zones zones={props.zones} onSelect={props.onZoneSelect} />
          <DangerZones zones={props.dangerZones ?? []} onSelect={props.onZoneSelect} />
          <Line geometry={props.naiveRoute} color={tokenColor('route-naive')} weight={3} dashed />
          {/* Faded alternatives sit under the selected route (zIndex 0). */}
          {(props.alternativeRoutes ?? []).map((geometry, index) => (
            <Line
              key={index}
              geometry={geometry}
              color={ROUTE_ALT}
              weight={8}
              opacity={0.9}
              zIndex={0}
            />
          ))}
          {/* The unavoided comparison route: a clear warning style, never the selected one. */}
          <Line geometry={props.unavoidedRoute} color={tokenColor('warning')} weight={5} dashed />
          {/* Selected route: a dimensional casing + active line, always on top of alternatives. */}
          <RouteLine geometry={drawnRoute} verifiedClean={props.verifiedClean} />
          <Traffic
            route={props.route}
            traffic={props.traffic ?? []}
            trimIndex={trimIndex ?? 0}
          />
          {props.origin && <Marker position={props.origin} />}
          {props.destination && <Marker position={props.destination} />}
          <Events events={props.events ?? []} />
          <Vehicle
            position={props.vehicle}
            heading={props.vehicleHeading}
            headingUp={mapHeadingUp}
          />
          <Camera {...props} />
        </GoogleMap>
      </APIProvider>
    </div>
  );
}

/**
 * Reports the visible area upward, throttled. `idle` alone would miss a long uninterrupted drag
 * (it only fires once the camera stops), so `bounds_changed` drives the same throttled report and
 * `idle` guarantees a final, exact one.
 */
function Viewport({ onChange }: { onChange?: (bounds: GeoBox) => void }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !onChange) return;
    let timer = 0;
    let lastReport = 0;

    const report = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      lastReport = Date.now();
      const northEast = bounds.getNorthEast();
      const southWest = bounds.getSouthWest();
      onChange({
        minLat: southWest.lat(),
        maxLat: northEast.lat(),
        minLng: southWest.lng(),
        maxLng: northEast.lng(),
      });
    };

    // Trailing throttle: during a continuous drag the wait shrinks as time passes since the last
    // report, so it lands about once per interval instead of never.
    const schedule = () => {
      window.clearTimeout(timer);
      const wait = Math.max(0, VIEWPORT_THROTTLE_MS - (Date.now() - lastReport));
      timer = window.setTimeout(report, wait);
    };

    const listeners = [
      map.addListener('bounds_changed', schedule),
      map.addListener('idle', schedule),
    ];
    // A map that is already idle emits nothing, so take the opening reading directly.
    schedule();

    return () => {
      window.clearTimeout(timer);
      listeners.forEach((listener) => listener.remove());
    };
  }, [map, onChange]);

  return null;
}

function Traffic({
  route,
  traffic,
  trimIndex = 0,
}: {
  route: GeoJsonLineString | null | undefined;
  traffic: TrafficSegment[];
  /** Vehicle's slice point into the full route; segments entirely behind it are dropped. */
  trimIndex?: number;
}) {
  const map = useMap();
  const maps = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !maps || !route) return;
    const lines = traffic
      // Drop segments the driver has already passed, and clamp a straddling one to the vehicle.
      .filter((segment) => segment.toIndex > trimIndex)
      .map((segment) => {
        const color = tokenColor(segment.level === 'heavy' ? 'danger' : 'warning');
        const from = Math.max(segment.fromIndex, trimIndex);
        return new maps.Polyline({
          path: route.coordinates
            .slice(from, segment.toIndex + 1)
            .map(([lng, lat]) => ({ lat, lng })),
          strokeColor: color,
          strokeWeight: 8,
          strokeOpacity: 0.95,
          zIndex: 3,
          clickable: false,
          map,
        });
      });
    return () => lines.forEach((line) => line.setMap(null));
  }, [map, maps, route, traffic, trimIndex]);

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

function Zones({
  zones,
  onSelect,
}: {
  zones: ZoneFeature[];
  onSelect?: (selection: SelectedZone) => void;
}) {
  const map = useMap();
  const maps = useMapsLibrary('maps');
  // The polygons on the map, keyed by zone id. The drawn set now changes with the camera, so only
  // the difference is applied: rebuilding every polygon on each pan would be slow and flickery.
  // The feature is kept alongside so a re-fetched layer (new objects, same ids) still redraws.
  const drawn = useRef(new Map<number, DrawnZone<ZoneFeature>>());
  // Held in a ref so a fresh callback identity does not force that rebuild either.
  const select = useRef(onSelect);
  const clickable = Boolean(onSelect);

  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!map || !maps) return;
    const wanted = new Map(zones.map((zone) => [zone.properties.id, zone]));
    for (const [id, entry] of drawn.current) {
      if (wanted.get(id) === entry.feature) continue;
      entry.polygon.setMap(null);
      drawn.current.delete(id);
    }
    for (const zone of zones) {
      if (drawn.current.has(zone.properties.id)) continue;
      // Colour each polygon by its own stringency layer, not by the requested level.
      const color = tokenColor(`zone-${zone.properties.stringency}`);
      const polygon = new maps.Polygon({
        paths: zone.geometry.coordinates.map((ring) => ring.map(([lng, lat]) => ({ lat, lng }))),
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.24,
        clickable,
        map,
      });
      if (clickable) {
        polygon.addListener('click', () => select.current?.({ kind: 'stringency', feature: zone }));
      }
      drawn.current.set(zone.properties.id, { feature: zone, polygon });
    }
  }, [map, maps, zones, clickable]);

  // A new map instance (or a change in interactivity) invalidates every polygon, so they are all
  // dropped and the effect above rebuilds them; on unmount they are simply cleared.
  useEffect(() => {
    const entries = drawn.current;
    return () => {
      entries.forEach((entry) => entry.polygon.setMap(null));
      entries.clear();
    };
  }, [map, maps, clickable]);

  return null;
}

function DangerZones({
  zones,
  onSelect,
}: {
  zones: DangerZoneFeature[];
  onSelect?: (selection: SelectedZone) => void;
}) {
  const map = useMap();
  const maps = useMapsLibrary('maps');
  // Same diffing as the stringency layer, and it matters more here: a danger ring carries
  // thousands of vertices, so rebuilding one that is already on screen is pure waste.
  const drawn = useRef(new Map<number, DrawnZone<DangerZoneFeature>>());
  const select = useRef(onSelect);
  const clickable = Boolean(onSelect);

  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!map || !maps) return;
    // Danger zones are a separate axis: their own violet token and a heavier outline so they
    // never read as one of the three stringency layers.
    const color = tokenColor('zone-danger');
    const wanted = new Map(zones.map((zone) => [zone.properties.id, zone]));
    for (const [id, entry] of drawn.current) {
      if (wanted.get(id) === entry.feature) continue;
      entry.polygon.setMap(null);
      drawn.current.delete(id);
    }
    for (const zone of zones) {
      if (drawn.current.has(zone.properties.id)) continue;
      const polygon = new maps.Polygon({
        paths: zone.geometry.coordinates.map((ring) => ring.map(([lng, lat]) => ({ lat, lng }))),
        strokeColor: color,
        strokeOpacity: 1,
        strokeWeight: 3,
        fillColor: color,
        fillOpacity: 0.32,
        clickable,
        map,
      });
      if (clickable) {
        polygon.addListener('click', () => select.current?.({ kind: 'danger', feature: zone }));
      }
      drawn.current.set(zone.properties.id, { feature: zone, polygon });
    }
  }, [map, maps, zones, clickable]);

  useEffect(() => {
    const entries = drawn.current;
    return () => {
      entries.forEach((entry) => entry.polygon.setMap(null));
      entries.clear();
    };
  }, [map, maps, clickable]);

  return null;
}

function Line({
  geometry,
  color,
  weight,
  dashed = false,
  opacity = 0.95,
  zIndex,
}: {
  geometry: GeoJsonLineString | null | undefined;
  /** A resolved colour string (hex or hsl), not a token name. */
  color: string;
  weight: number;
  dashed?: boolean;
  opacity?: number;
  zIndex?: number;
}) {
  const map = useMap();
  const maps = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !maps || !geometry) return;
    const polyline = new maps.Polyline({
      path: geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      strokeColor: color,
      strokeWeight: dashed ? 0 : weight,
      strokeOpacity: dashed ? 0 : opacity,
      zIndex,
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
  }, [map, maps, geometry, color, weight, dashed, opacity, zIndex]);

  return null;
}

/**
 * The selected route, drawn Waze-style: a darker casing under a brighter active line so the road
 * reads as dimensional. An unverified route (could not be proven zone-clean) keeps a clear
 * warning look - danger red, dashed active - while still getting the two-layer casing treatment.
 */
function RouteLine({
  geometry,
  verifiedClean,
}: {
  geometry: GeoJsonLineString | null | undefined;
  verifiedClean?: boolean;
}) {
  const map = useMap();
  const maps = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !maps || !geometry) return;
    const path = geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    const unverified = verifiedClean === false;
    const casingColor = unverified ? ROUTE_CASING_DANGER : ROUTE_CASING;
    const activeColor = unverified ? tokenColor('danger') : ROUTE_ACTIVE;

    const casing = new maps.Polyline({
      path,
      strokeColor: casingColor,
      strokeWeight: 12,
      strokeOpacity: 1,
      zIndex: 1,
      clickable: false,
      map,
    });
    const active = new maps.Polyline({
      path,
      strokeColor: activeColor,
      // A dashed active line signals the unverified warning; a clean route is a solid bright line.
      strokeWeight: unverified ? 0 : 8,
      strokeOpacity: unverified ? 0 : 1,
      zIndex: 2,
      icons: unverified
        ? [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeColor: activeColor,
                strokeOpacity: 1,
                strokeWeight: 8,
                scale: 3,
              },
              offset: '0',
              repeat: '18px',
            },
          ]
        : undefined,
      clickable: false,
      map,
    });
    return () => {
      casing.setMap(null);
      active.setMap(null);
    };
  }, [map, maps, geometry, verifiedClean]);

  return null;
}

function Vehicle({
  position,
  heading,
  headingUp,
}: {
  position: MapCanvasProps['vehicle'];
  heading: MapCanvasProps['vehicleHeading'];
  /** True when the map itself is rotated to the heading; the arrow then points straight up. */
  headingUp: boolean;
}) {
  const maps = useMapsLibrary('maps');
  if (!position || !maps) return null;

  // The Symbol rotation is measured in screen space, not map space. On a heading-up map the world
  // is already turned so travel points up, so the arrow must sit at 0; north-up rotates by heading.
  const rotation = headingUp ? 0 : heading ?? 0;

  return (
    <Marker
      position={position}
      icon={{
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 7,
        rotation,
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
  onCameraChange,
}: MapCanvasProps) {
  const map = useMap();
  const core = useMapsLibrary('core');
  const focusPoint = focusOnVehicle ? vehicle : center;
  const following = Boolean(camera) && (camera?.follow ?? true) && Boolean(focusPoint);
  // The zoom this component last wrote, so a zoom_changed event can be told apart from a pinch.
  const appliedZoom = useRef<number | null>(null);

  // Best effort: when the driver drags the map, stop following so the camera does not fight
  // them. Recentre (or the overview toggle) turns following back on.
  useEffect(() => {
    if (!map || !onCameraChange) return;
    const listener = map.addListener('dragstart', () => onCameraChange({ follow: false }));
    return () => listener.remove();
  }, [map, onCameraChange]);

  // Same idea for the zoom: a pinch while following pins the zoom, so the automatic driving
  // zoom stops overriding it on the next position update.
  useEffect(() => {
    if (!map || !onCameraChange || !following) return;
    const listener = map.addListener('zoom_changed', () => {
      const zoom = map.getZoom();
      if (zoom == null || appliedZoom.current === null) return;
      if (Math.abs(zoom - appliedZoom.current) < 0.01) return;
      appliedZoom.current = zoom;
      onCameraChange({ zoom, autoZoom: false });
    });
    return () => listener.remove();
  }, [map, onCameraChange, following]);

  // Frames the trip: the route and its endpoints. Deliberately not keyed on the zones - the drawn
  // zone set follows the camera now, so re-fitting whenever it changes would snap the map back and
  // undo the user's own panning.
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
    if (used) map.fitBounds(bounds, 64);
    // Overview/planning is a flat top-down frame; the 3D tilt belongs to the driving view.
    map.setTilt?.(0);
  }, [map, core, route, origin, destination, following]);

  // With no route and no endpoints to anchor on, the zones themselves frame the opening view.
  // Once only, and for the same reason: from here on they follow the camera, so framing them
  // again on every change would let the camera drive itself in a circle.
  const framedFromZones = useRef(false);
  useEffect(() => {
    if (!map || !core || following || framedFromZones.current) return;
    if (route || origin || destination) return;
    const bounds = new core.LatLngBounds();
    let used = false;
    for (const zone of zones) {
      for (const [lng, lat] of zone.geometry.coordinates[0]) {
        bounds.extend({ lat, lng });
        used = true;
      }
    }
    if (!used) return;
    map.fitBounds(bounds, 64);
    framedFromZones.current = true;
  }, [map, core, zones, route, origin, destination, following]);

  useEffect(() => {
    if (!map || !following || !focusPoint) return;
    map.panTo(focusPoint);
    if (camera) {
      appliedZoom.current = camera.zoom;
      map.setZoom(camera.zoom);
      // Heading up needs a vector map and only applies to the driving vehicle; where it is
      // unsupported this is simply ignored.
      map.setHeading?.(camera.headingUp && vehicle ? vehicleHeading ?? 0 : 0);
      // Driving is always a 3D roadmap: a fixed tilt so streets and buildings render in
      // perspective, regardless of the heading-up/north-up toggle. Needs the vector map;
      // ignored where unsupported.
      map.setTilt?.(DRIVING_TILT);
    }
  }, [map, following, focusPoint, vehicle, vehicleHeading, camera]);

  return null;
}
