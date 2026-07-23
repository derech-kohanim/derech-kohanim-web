import type { GeoJsonLineString, LatLng, ZoneFeature } from '@dk/shared';

import type { RouteEvent, TrafficSegment } from '@/navigation/events';

export interface MapCamera {
  /** Google style zoom level (13 wide, 19 close). Also scales the schematic span. */
  zoom: number;
  /** Rotate the map so the direction of travel points up. */
  headingUp: boolean;
  /** Follow the vehicle. Overview turns this off to frame the whole route. */
  follow: boolean;
}

export interface MapCanvasProps {
  zones: ZoneFeature[];
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
  traffic?: TrafficSegment[];
  events?: RouteEvent[];
}

export const DEFAULT_CAMERA: MapCamera = { zoom: 16, headingUp: true, follow: true };
