import type {
  AuthResponse,
  LatLng,
  PlaceSuggestion,
  RecentPlace,
  RouteEvent,
  RouteResult,
  SavedPlace,
  User,
  UserPreferences,
} from '@dk/shared';

import { formatCoordinates, parseCoordinates } from '@/lib/coordinates';
import { distanceMeters, toLatLngs } from '@/lib/geo';
import { matchRanges, normalise } from '@/lib/highlight';
import { mockEventsForRoute } from '@/navigation/events';

import { ApiClientError, type ApiClient } from '../types';
import { CORPUS, type CorpusEntry } from './corpus';
import { computeMockPlan } from './route';
import { dangerZonesData, zonesFor } from './zones';

const STORE_KEY = 'dk.mock';
/** Typing this word forces the error state, so it can be reviewed without breaking anything. */
const ERROR_TRIGGER = ['error', 'שגיאה'];

interface MockState {
  user: User | null;
  saved: SavedPlace[];
  recent: RecentPlace[];
}

const DEFAULT_PREFERENCES: UserPreferences = {
  language: 'he',
  theme: 'system',
  stringency: 'taharat',
  trafficAware: true,
  avoidTolls: false,
  avoidDangerZones: true,
  voiceEnabled: true,
  voiceId: 'he-default',
  units: 'metric',
};

const DEMO_USER: User = {
  id: 'u-demo',
  email: 'demo@derech-kohanim.org',
  displayName: 'נוסע לדוגמה',
  tier: 'verified',
  providers: ['password'],
  preferences: DEFAULT_PREFERENCES,
  acceptedTermsVersion: '2026-07-01',
  createdAt: '2026-01-04T08:00:00.000Z',
};

const SEED: MockState = {
  user: null,
  saved: [
    {
      id: 's-home',
      label: 'בית',
      category: 'home',
      location: { lat: 32.0853, lng: 34.8348 },
      address: 'רבי עקיבא 100, בני ברק',
      createdAt: '2026-02-01T10:00:00.000Z',
    },
    {
      id: 's-work',
      label: 'עבודה',
      category: 'work',
      location: { lat: 32.0847, lng: 34.8003 },
      address: 'אבא הלל 40, רמת גן',
      createdAt: '2026-02-01T10:05:00.000Z',
    },
    {
      id: 's-shul',
      label: 'בית הכנסת לדרמן',
      category: 'synagogue',
      location: { lat: 32.0869, lng: 34.8401 },
      address: 'רשבם 5, בני ברק',
      createdAt: '2026-03-12T19:20:00.000Z',
    },
  ],
  recent: [
    {
      id: 'p-ponevezh',
      title: 'ישיבת פוניבז',
      subtitle: 'רחוב פוניבז 1, בני ברק',
      location: { lat: 32.0912, lng: 34.8377 },
      lastUsedAt: new Date(Date.now() - 3_600_000).toISOString(),
      useCount: 12,
    },
    {
      id: 'p-kikar-shabbat',
      title: 'כיכר השבת',
      subtitle: 'ירושלים',
      location: { lat: 31.7913, lng: 35.2199 },
      lastUsedAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
      useCount: 3,
    },
    {
      id: 'p-ben-gurion',
      title: 'נמל התעופה בן גוריון',
      subtitle: 'טרמינל 3, לוד',
      location: { lat: 32.0055, lng: 34.8854 },
      lastUsedAt: new Date(Date.now() - 86_400_000 * 9).toISOString(),
      useCount: 1,
    },
  ],
};

function loadState(): MockState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    /* fall through to the seed */
  }
  return structuredClone(SEED);
}

let state = loadState();

function persist(): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const jitter = (min: number, max: number) => min + Math.random() * (max - min);

function entryTitle(entry: CorpusEntry, language: string) {
  return language === 'en' ? entry.titleEn : entry.titleHe;
}

function entrySubtitle(entry: CorpusEntry, language: string) {
  return language === 'en' ? entry.subtitleEn : entry.subtitleHe;
}

function scoreEntry(entry: CorpusEntry, query: string, language: string): number | null {
  const tokens = normalise(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const title = normalise(entryTitle(entry, language));
  const otherTitle = normalise(language === 'en' ? entry.titleHe : entry.titleEn);
  const subtitle = normalise(entrySubtitle(entry, language));
  const aliases = (entry.aliases ?? []).map(normalise);

  let score = 0;
  for (const token of tokens) {
    if (title.startsWith(token)) score += 100;
    else if (title.includes(token)) score += 60;
    else if (otherTitle.includes(token)) score += 40;
    else if (aliases.some((alias) => alias.includes(token))) score += 30;
    else if (subtitle.includes(token)) score += 20;
    else return null;
  }
  return score;
}

const ROUTES = new Map<string, RouteResult>();
const SESSIONS = new Map<string, { routeId: string; simulated: boolean }>();
const REPORTS = new Map<string, RouteEvent[]>();

function coordinateSuggestion(query: string, near?: LatLng): PlaceSuggestion | null {
  const point = parseCoordinates(query);
  if (!point) return null;
  return {
    id: `coord:${point.lat},${point.lng}`,
    title: formatCoordinates(point),
    subtitle: null,
    category: 'coordinates',
    kind: 'coordinates',
    location: point,
    externalId: null,
    distanceMeters: near ? Math.round(distanceMeters(near, point)) : null,
    matchedRanges: [],
  };
}

export const mockClient: ApiClient = {
  async register(body) {
    await delay(jitter(320, 620));
    const user: User = {
      ...DEMO_USER,
      email: body.email,
      displayName: body.displayName ?? body.email.split('@')[0],
      tier: 'registered',
      acceptedTermsVersion: body.acceptedTermsVersion,
    };
    state.user = user;
    persist();
    return authResponse(user);
  },

  async login(body) {
    await delay(jitter(320, 620));
    if (!body.password || body.password.length < 6) {
      throw new ApiClientError('invalid_credentials', 401);
    }
    const user: User = { ...DEMO_USER, email: body.email };
    state.user = user;
    persist();
    return authResponse(user);
  },

  async loginWithGoogle() {
    await delay(jitter(280, 520));
    const user: User = { ...DEMO_USER, providers: ['google'] };
    state.user = user;
    persist();
    return authResponse(user);
  },

  async devLogin(email) {
    await delay(200);
    const user: User = { ...DEMO_USER, email: email || DEMO_USER.email };
    state.user = user;
    persist();
    return authResponse(user);
  },

  async logout() {
    await delay(120);
    state.user = null;
    persist();
  },

  async currentUser() {
    await delay(80);
    if (!state.user) throw new ApiClientError('unauthenticated', 401);
    return state.user;
  },

  async updateProfile(displayName) {
    await delay(120);
    const user = state.user ?? DEMO_USER;
    state.user = { ...user, displayName };
    persist();
    return state.user;
  },

  async updatePreferences(preferences) {
    await delay(140);
    const user = state.user ?? DEMO_USER;
    state.user = { ...user, preferences };
    persist();
    return state.user;
  },

  async terms(language) {
    await delay(160);
    return {
      version: '2026-07-01',
      language,
      title: language === 'en' ? 'Terms of use' : 'תנאי שימוש',
      body: language === 'en' ? TERMS_EN : TERMS_HE,
      updatedAt: '2026-07-01T00:00:00.000Z',
    };
  },

  async requestAccountDeletion() {
    await delay(jitter(240, 480));
    // Nothing is stored: the mock has no operator queue to put a request into.
    return {
      id: 'del-mock',
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };
  },

  async acceptTerms(version) {
    await delay(120);
    const user = state.user ?? DEMO_USER;
    state.user = { ...user, acceptedTermsVersion: version };
    persist();
    return state.user;
  },

  async searchPlaces(body, options) {
    await delay(jitter(140, 340), options?.signal);

    if (ERROR_TRIGGER.some((word) => normalise(body.query).includes(word))) {
      throw new ApiClientError('upstream_unavailable', 503);
    }

    const language = body.language;
    const suggestions: PlaceSuggestion[] = [];

    const coordinate = coordinateSuggestion(body.query, body.near);
    if (coordinate) suggestions.push(coordinate);

    const scored = CORPUS.map((entry) => ({ entry, score: scoreEntry(entry, body.query, language) }))
      .filter((row): row is { entry: CorpusEntry; score: number } => row.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, body.limit ?? 8);

    for (const { entry } of scored) {
      const title = entryTitle(entry, language);
      suggestions.push({
        id: entry.id,
        title,
        subtitle: entrySubtitle(entry, language),
        category: entry.category,
        kind: 'text',
        location: entry.location,
        externalId: `mock:${entry.id}`,
        distanceMeters: body.near
          ? Math.round(distanceMeters(body.near, entry.location))
          : null,
        matchedRanges: matchRanges(title, body.query),
      });
    }

    return { query: body.query, suggestions, cached: false };
  },

  async placeDetails(body) {
    await delay(120);
    const entry = CORPUS.find((item) => item.id === body.id);
    if (!entry) throw new ApiClientError('place_not_found', 404);
    return {
      id: entry.id,
      title: entryTitle(entry, body.language),
      subtitle: entrySubtitle(entry, body.language),
      category: entry.category,
      kind: 'text',
      location: entry.location,
      externalId: `mock:${entry.id}`,
      distanceMeters: null,
      matchedRanges: [],
    };
  },

  async savedPlaces() {
    return state.saved;
  },

  async addSavedPlace(place) {
    await delay(140);
    const saved: SavedPlace = {
      ...place,
      id: `s-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    state.saved = [...state.saved, saved];
    persist();
    return saved;
  },

  async removeSavedPlace(id) {
    await delay(120);
    state.saved = state.saved.filter((place) => place.id !== id);
    persist();
  },

  async recentPlaces() {
    return state.recent;
  },

  async recordRecentPlace(place) {
    const key = place.externalId ?? place.title;
    const existing = state.recent.find((item) => item.id === key);
    const entry: RecentPlace = {
      id: key,
      title: place.title,
      subtitle: place.subtitle,
      location: place.location,
      lastUsedAt: new Date().toISOString(),
      useCount: (existing?.useCount ?? 0) + 1,
    };
    state.recent = [entry, ...state.recent.filter((item) => item.id !== key)].slice(0, 12);
    persist();
  },

  async zones(stringency) {
    await delay(160);
    return zonesFor(stringency);
  },

  async dangerZones() {
    await delay(140);
    return dangerZonesData();
  },

  async providers() {
    await delay(120);
    return [
      {
        name: 'here',
        available: true,
        isDefault: true,
        attribution: 'Routing provided by HERE',
        supportsNativeAvoidance: true,
        supportsLiveTraffic: true,
      },
      {
        name: 'graphhopper',
        available: true,
        isDefault: false,
        attribution: 'Routing provided by GraphHopper, data from OpenStreetMap contributors',
        supportsNativeAvoidance: true,
        supportsLiveTraffic: false,
      },
      {
        name: 'google',
        available: false,
        isDefault: false,
        attribution: 'Routing provided by Google',
        supportsNativeAvoidance: false,
        supportsLiveTraffic: true,
      },
    ];
  },

  async computeRoute(body, options) {
    await delay(jitter(500, 900), options?.signal);
    const plan = computeMockPlan(body);
    // Every selectable alternative must be resolvable by id later (navigation, progress).
    for (const route of plan.routes) ROUTES.set(route.id, route);
    return plan;
  },

  async routeEvents(routeId) {
    await delay(180);
    const route = ROUTES.get(routeId);
    const bundle = route
      ? mockEventsForRoute(route)
      : { routeId, events: [], traffic: [], delaySeconds: 0 };
    return { ...bundle, routeId, events: [...bundle.events, ...(REPORTS.get(routeId) ?? [])] };
  },

  async createReport(body) {
    await delay(160);
    const event: RouteEvent = {
      id: `user-${Date.now()}`,
      type: body.type,
      location: body.location,
      routeDistanceMeters: 0,
      reportedByUser: true,
      createdAt: new Date().toISOString(),
    };
    REPORTS.set(body.routeId, [...(REPORTS.get(body.routeId) ?? []), event]);
    return event;
  },

  async startNavigation(routeId, simulated) {
    await delay(180);
    const id = `nav-${Date.now()}`;
    SESSIONS.set(id, { routeId, simulated });
    return {
      id,
      routeId,
      status: 'navigating',
      simulated,
      startedAt: new Date().toISOString(),
    };
  },

  async reportProgress(body) {
    const session = SESSIONS.get(body.sessionId);
    const route = session ? ROUTES.get(session.routeId) : undefined;
    if (!route) throw new ApiClientError('session_not_found', 404);

    const points = toLatLngs(route.geometry.coordinates);
    let nearestIndex = 0;
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length; index += 1) {
      const gap = distanceMeters(points[index], body.location);
      if (gap < nearest) {
        nearest = gap;
        nearestIndex = index;
      }
    }

    const progress = nearestIndex / (points.length - 1);
    const distanceRemaining = Math.round(route.distanceMeters * (1 - progress));
    const maneuverIndex = Math.max(
      0,
      route.maneuvers.findIndex((maneuver) => maneuver.geometryIndex > nearestIndex),
    );
    const target = route.maneuvers[maneuverIndex] ?? route.maneuvers[route.maneuvers.length - 1];
    const zoneManeuver = route.maneuvers.find(
      (maneuver) => maneuver.action === 'zone_enter' && maneuver.geometryIndex > nearestIndex,
    );
    const zoneDistance = zoneManeuver
      ? Math.round(distanceMeters(body.location, zoneManeuver.point))
      : Number.POSITIVE_INFINITY;

    return {
      status: distanceRemaining < 25 ? 'arrived' : 'navigating',
      currentManeuverIndex: maneuverIndex,
      distanceToManeuverMeters: Math.round(distanceMeters(body.location, target.point)),
      distanceRemainingMeters: distanceRemaining,
      durationRemainingSeconds: Math.round(route.durationSeconds * (1 - progress)),
      zoneAlert:
        zoneManeuver?.zone && zoneDistance < 600
          ? { type: 'zone_ahead', zone: zoneManeuver.zone, distanceMeters: zoneDistance }
          : undefined,
    };
  },

  async endNavigation(sessionId, _arrived) {
    void _arrived;
    SESSIONS.delete(sessionId);
  },

  async submitNavFeedback(body) {
    await delay(160);
    return {
      id: `feedback-${Date.now()}`,
      routeId: body.routeId,
      rating: body.rating,
      text: body.text ?? null,
      createdAt: new Date().toISOString(),
    };
  },

  async voiceManifest(language, voiceId) {
    await delay(140);
    // No audio files ship with the fixtures, so the client falls through to speech synthesis.
    return { language, voiceId, version: 0, clips: [], updatedAt: new Date().toISOString() };
  },

  async resolveVoiceClips(body) {
    await delay(120);
    return { clips: [], missing: body.keys };
  },
};

function authResponse(user: User): AuthResponse {
  return {
    user,
    tokens: {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 3600,
    },
  };
}

const TERMS_HE = `דרך כהנים מסייעת להימנע מאזורים המסומנים על ידי התאחדות טהרת הכהנים, ואינה תחליף לשאלת רב במקרה הצורך.

המערכת מאמתת כל מסלול מול שכבות האזורים לפני הצגתו. מסלול שלא ניתן לאמת מסומן במפורש ואין להתחיל ממנו ניווט חי.

השימוש בנתוני מיקום נדרש לצורך הניווט בלבד. מסלולים מחושבים אצל ספק ניתוב חיצוני.

אחריות הנהיגה ושמירת החוק היא על המשתמש בלבד.`;

const TERMS_EN = `Derech Kohanim helps avoid the areas published by the Association for the Purity of the Kohanim. It is not a substitute for halachic guidance.

Every route is verified against the zone layers before it is shown. A route that cannot be verified is marked clearly and must not be used for live navigation.

Location data is used for navigation only. Routes are computed by an external routing provider.

Safe and lawful driving remains the responsibility of the driver.`;
