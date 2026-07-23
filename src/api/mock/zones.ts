import type {
  DangerZoneCollection,
  DangerZoneFeature,
  Stringency,
  ZoneCollection,
  ZoneFeature,
} from '@dk/shared';

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

// Illustrative fixtures. Rich fields (city/street/description) mirror the real server payload
// so the zone-info card and the driving alerts can be exercised without the live API. Zones
// span the country (Bnei Brak, Jerusalem, Tiberias) to test framing when they are far apart.
const FEATURES: ZoneFeature[] = [
  {
    type: 'Feature',
    properties: {
      id: 1,
      name: 'בית העלמין סגולה',
      nameHe: 'בית העלמין סגולה',
      stringency: 'basic',
      city: 'פתח תקווה',
      street: 'דרך זאב ז\'בוטינסקי',
      description:
        'בית עלמין ותיק. הכביש הגובל עובר בסמוך לשטח הקברים ולכן אסור במעבר לכהנים לכל הדעות.',
    },
    geometry: { type: 'Polygon', coordinates: ring([34.8735, 32.1015], 0.0035, 0.0022) },
  },
  {
    type: 'Feature',
    properties: {
      id: 2,
      name: 'בית העלמין פוניבז',
      nameHe: 'בית העלמין פוניבז',
      stringency: 'basic',
      city: 'בני ברק',
      street: 'רחוב הרב פוניבז',
      description: 'שטח קבורה פעיל. איסור גמור לכהנים לפי כל הדעות; אין לעבור או לשהות בתחומו.',
    },
    geometry: { type: 'Polygon', coordinates: ring([34.8285, 32.0932], 0.0018, 0.0013) },
  },
  {
    type: 'Feature',
    properties: {
      id: 3,
      name: 'מרכז רפואי שיבא',
      nameHe: 'מרכז רפואי שיבא',
      stringency: 'taharat',
      city: 'רמת גן',
      street: 'דרך שיבא',
      description:
        'בית חולים ובו חדר מתים. לפי הכרעת רבני התאחדות טהרת הכהנים יש להימנע ממעבר סמוך למבנה.',
    },
    geometry: { type: 'Polygon', coordinates: ring([34.8434, 32.0446], 0.0042, 0.003) },
  },
  {
    type: 'Feature',
    properties: {
      id: 4,
      name: 'מרפאת רמת גן',
      nameHe: 'מרפאת רמת גן',
      stringency: 'machmirim',
      city: 'רמת גן',
      street: 'רחוב הרא\'\'ה',
      description: 'מרפאה שיש מחמירים להימנע ממעבר בסמוך לה. אזור השנוי במחלוקת.',
    },
    geometry: { type: 'Polygon', coordinates: ring([34.8123, 32.0836], 0.0016, 0.0011) },
  },
  {
    type: 'Feature',
    properties: {
      id: 5,
      name: 'הר המנוחות',
      nameHe: 'הר המנוחות',
      stringency: 'taharat',
      city: 'ירושלים',
      street: 'שדרות הרב עוזיאל',
      description:
        'בית העלמין הגדול בירושלים. הכבישים הגובלים בו סמוכים לשטח הקברים ואסורים לכהנים.',
    },
    geometry: { type: 'Polygon', coordinates: ring([35.1795, 31.7924], 0.006, 0.004) },
  },
  {
    type: 'Feature',
    properties: {
      id: 6,
      name: 'בית העלמין העתיק טבריה',
      nameHe: 'בית העלמין העתיק טבריה',
      stringency: 'basic',
      city: 'טבריה',
      street: 'רחוב אלחדף',
      description: 'שטח קבורה עתיק ובו קברי צדיקים. איסור מעבר לכהנים לכל הדעות.',
    },
    geometry: { type: 'Polygon', coordinates: ring([35.5305, 32.7896], 0.004, 0.003) },
  },
];

// Danger zones (Area A) - a separate axis from halachic stringency. Illustrative mock
// placements so the distinct layer and the avoidance toggle can be verified.
const DANGER_FEATURES: DangerZoneFeature[] = [
  {
    type: 'Feature',
    properties: {
      id: 101,
      name: 'שטח A',
      city: 'אזור מסוכן',
      description:
        'כניסת אזרחים ישראלים אסורה על פי חוק ומסכנת חיים. המסלול מתוכנן לעקוף את השטח.',
    },
    geometry: { type: 'Polygon', coordinates: ring([34.8395, 32.0885], 0.0026, 0.0019) },
  },
  {
    type: 'Feature',
    properties: {
      id: 102,
      name: 'שטח A - טול כרם',
      city: 'טול כרם',
      description: 'שטח בשליטה פלסטינית מלאה. כניסת ישראלים אסורה ומסוכנת.',
    },
    geometry: { type: 'Polygon', coordinates: ring([35.028, 32.308], 0.01, 0.008) },
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
    version: 8,
    features: FEATURES.filter((feature) => active.includes(feature.properties.stringency)),
  };
}

export function dangerZonesData(): DangerZoneCollection {
  return {
    type: 'FeatureCollection',
    version: 1,
    features: DANGER_FEATURES,
  };
}

function boxContains(ring0: [number, number][], point: { lat: number; lng: number }): boolean {
  const lngs = ring0.map(([lng]) => lng);
  const lats = ring0.map(([, lat]) => lat);
  return (
    point.lng >= Math.min(...lngs) &&
    point.lng <= Math.max(...lngs) &&
    point.lat >= Math.min(...lats) &&
    point.lat <= Math.max(...lats)
  );
}

export function zoneAt(
  point: { lat: number; lng: number },
  stringency: Stringency,
): ZoneFeature | null {
  for (const feature of zonesFor(stringency).features) {
    if (boxContains(feature.geometry.coordinates[0], point)) return feature;
  }
  return null;
}
