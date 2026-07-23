import type { Stringency, ZoneCollection, ZoneFeature } from '@dk/shared';

function ring(center: [number, number], width: number, height: number): [number, number][][] {
  const [lng, lat] = center;
  return [
    [
      [lng - width, lat - height],
      [lng + width, lat - height],
      [lng + width, lat + height],
      [lng - width, lat + height],
      [lng - width, lat - height],
    ],
  ];
}

const FEATURES: ZoneFeature[] = [
  {
    type: 'Feature',
    properties: { id: 1, name: 'Segula Cemetery', nameHe: 'בית העלמין סגולה', stringency: 'basic' },
    geometry: { type: 'Polygon', coordinates: ring([34.8735, 32.1015], 0.0035, 0.0022) },
  },
  {
    type: 'Feature',
    properties: {
      id: 2,
      name: 'Ponevezh Cemetery',
      nameHe: 'בית העלמין פוניבז',
      stringency: 'basic',
    },
    geometry: { type: 'Polygon', coordinates: ring([34.8285, 32.0932], 0.0018, 0.0013) },
  },
  {
    type: 'Feature',
    properties: {
      id: 3,
      name: 'Sheba Medical Center',
      nameHe: 'מרכז רפואי שיבא',
      stringency: 'taharat',
    },
    geometry: { type: 'Polygon', coordinates: ring([34.8434, 32.0446], 0.0042, 0.003) },
  },
  {
    type: 'Feature',
    properties: {
      id: 4,
      name: 'Ramat Gan Clinic',
      nameHe: 'מרפאת רמת גן',
      stringency: 'machmirim',
    },
    geometry: { type: 'Polygon', coordinates: ring([34.8123, 32.0836], 0.0016, 0.0011) },
  },
];

const ORDER: Record<Stringency, Stringency[]> = {
  basic: ['basic'],
  taharat: ['basic', 'taharat'],
  machmirim: ['basic', 'taharat', 'machmirim'],
};

export function zonesFor(stringency: Stringency): ZoneCollection {
  const active = ORDER[stringency];
  return {
    type: 'FeatureCollection',
    version: 7,
    features: FEATURES.filter((feature) => active.includes(feature.properties.stringency)),
  };
}

export function zoneAt(
  point: { lat: number; lng: number },
  stringency: Stringency,
): ZoneFeature | null {
  for (const feature of zonesFor(stringency).features) {
    const ring0 = feature.geometry.coordinates[0];
    const lngs = ring0.map(([lng]) => lng);
    const lats = ring0.map(([, lat]) => lat);
    const inside =
      point.lng >= Math.min(...lngs) &&
      point.lng <= Math.max(...lngs) &&
      point.lat >= Math.min(...lats) &&
      point.lat <= Math.max(...lats);
    if (inside) return feature;
  }
  return null;
}
