import type { DangerZoneFeature, GeoJsonLineString, LatLng, ZoneFeature } from '@dk/shared';

import type { RouteEvent, TrafficSegment } from '@/navigation/events';

/** A tapped zone, discriminated so the info card knows which fields to read. */
export type SelectedZone =
  | { kind: 'stringency'; feature: ZoneFeature }
  | { kind: 'danger'; feature: DangerZoneFeature };

export interface MapCamera {
  /** Google style zoom level (13 wide, 19 close). Also scales the schematic span. */
  zoom: number;
  /** Rotate the map so the direction of travel points up. */
  headingUp: boolean;
  /** Follow the vehicle. Overview turns this off to frame the whole route. */
  follow: boolean;
  /**
   * Let the driving speed pick the zoom (see `drivingZoom`). A deliberate zoom - the buttons or
   * a pinch - turns this off so it sticks; recentring turns it back on.
   */
  autoZoom: boolean;
}

export interface MapCanvasProps {
  zones: ZoneFeature[];
  /** Danger zones (Area A), drawn in their own distinct style. */
  dangerZones?: DangerZoneFeature[];
  /** Tapping a zone polygon reports it here, so the screen can show the info card. */
  onZoneSelect?: (selection: SelectedZone) => void;
  origin?: LatLng | null;
  destination?: LatLng | null;
  route?: GeoJsonLineString | null;
  /** Unselected alternatives, drawn faded/secondary beneath the selected route. */
  alternativeRoutes?: (GeoJsonLineString | null | undefined)[];
  /**
   * User-facing comparison: the plain route with no zone avoidance, drawn in a warning style.
   * Distinct from `naiveRoute`, which is the debug overlay.
   */
  unavoidedRoute?: GeoJsonLineString | null;
  /** Debug only: the route a provider returns with no avoidance. */
  naiveRoute?: GeoJsonLineString | null;
  vehicle?: LatLng | null;
  vehicleHeading?: number | null;
  verifiedClean?: boolean;
  /** Driving view: keep the vehicle centred instead of framing the whole route. */
  focusOnVehicle?: boolean;
  /** Point to keep centred when there is no vehicle, e.g. the home screen location. */
  center?: LatLng | null;
  /** Suppress base-map POI clicks. Set while driving so a tap cannot open a details card. */
  disablePoi?: boolean;
  camera?: MapCamera;
  /** Lets the map hand camera changes back, e.g. dropping follow when the driver pans. */
  onCameraChange?: (patch: Partial<MapCamera>) => void;
  traffic?: TrafficSegment[];
  events?: RouteEvent[];
}

export const DEFAULT_CAMERA: MapCamera = {
  zoom: 17,
  headingUp: true,
  follow: true,
  autoZoom: true,
};
