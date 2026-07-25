import type { ApiError, AuthResponse, AuthTokens, RoutePlan, RouteResult } from '@dk/shared';

import { env } from '@/env';

import { tokenStore } from './tokenStore';
import { ApiClientError, type ApiClient, type RequestOptions } from './types';

interface Init extends RequestOptions {
  method?: string;
  body?: unknown;
  /** Auth endpoints must not trigger the refresh loop. */
  skipAuth?: boolean;
}

let refreshInFlight: Promise<AuthTokens | null> | null = null;

async function refreshTokens(): Promise<AuthTokens | null> {
  const current = tokenStore.read();
  if (!current) return null;

  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${env.apiBase}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!response.ok) {
        tokenStore.clear();
        return null;
      }
      const tokens = (await response.json()) as AuthTokens;
      tokenStore.write(tokens);
      return tokens;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function raise(response: Response): Promise<never> {
  let code = `http_${response.status}`;
  let message = response.statusText;
  try {
    const body = (await response.json()) as Partial<ApiError>;
    if (body.code) code = body.code;
    if (body.message) message = body.message;
  } catch {
    /* the status line is all we have */
  }
  throw new ApiClientError(code, response.status, message);
}

async function request<T>(path: string, init: Init = {}): Promise<T> {
  const { method = 'GET', body, signal, skipAuth = false } = init;

  if (!skipAuth && tokenStore.isExpiring()) await refreshTokens();

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const tokens = tokenStore.read();
    if (!skipAuth && tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;

    return fetch(`${env.apiBase}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let response = await send();

  if (response.status === 401 && !skipAuth && tokenStore.read()) {
    const refreshed = await refreshTokens();
    if (refreshed) response = await send();
  }

  if (!response.ok) await raise(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function storeAuth(auth: AuthResponse): AuthResponse {
  tokenStore.write(auth.tokens);
  return auth;
}

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

const id = (value: string) => encodeURIComponent(value);

export const httpClient: ApiClient = {
  register: async (body) =>
    storeAuth(await request('/api/auth/register', { method: 'POST', body, skipAuth: true })),
  login: async (body) =>
    storeAuth(await request('/api/auth/login', { method: 'POST', body, skipAuth: true })),
  loginWithGoogle: async (body) =>
    storeAuth(await request('/api/auth/google', { method: 'POST', body, skipAuth: true })),
  devLogin: async (email) =>
    storeAuth(await request('/api/auth/dev-login', { method: 'POST', body: { email }, skipAuth: true })),
  logout: async () => {
    const tokens = tokenStore.read();
    try {
      if (tokens) {
        await request<void>('/api/auth/logout', {
          method: 'POST',
          body: { refreshToken: tokens.refreshToken },
        });
      }
    } finally {
      tokenStore.clear();
    }
  },
  currentUser: () => request('/api/users/me'),
  updateProfile: (displayName) =>
    request('/api/users/me', { method: 'PATCH', body: { displayName } }),
  updatePreferences: (preferences) =>
    request('/api/users/me/preferences', { method: 'PATCH', body: preferences }),
  terms: (language) => request(`/api/auth/terms${query({ language })}`),
  acceptTerms: (version) => request('/api/auth/accept-terms', { method: 'POST', body: { version } }),

  // Search and details are GET: the query string carries the request, and `near` is split
  // into the lat/lng params the API expects. The abort signal is preserved on the GET.
  searchPlaces: (body, options) =>
    request(
      `/api/places/search${query({
        query: body.query,
        language: body.language,
        lat: body.near?.lat,
        lng: body.near?.lng,
        sessionToken: body.sessionToken,
        limit: body.limit,
      })}`,
      { signal: options?.signal },
    ),
  placeDetails: (body) =>
    request(
      `/api/places/details${query({
        id: body.id,
        language: body.language,
        sessionToken: body.sessionToken,
      })}`,
    ),
  savedPlaces: () => request('/api/places/saved'),
  addSavedPlace: (place) => request('/api/places/saved', { method: 'POST', body: place }),
  removeSavedPlace: (placeId) => request(`/api/places/saved/${id(placeId)}`, { method: 'DELETE' }),
  recentPlaces: () => request('/api/places/recent'),
  recordRecentPlace: (place) =>
    request('/api/places/recent', {
      method: 'POST',
      body: {
        title: place.title,
        subtitle: place.subtitle ?? undefined,
        location: place.location,
        externalId: place.externalId ?? undefined,
      },
    }),

  zones: (stringency) => request(`/api/zones${query({ stringency })}`),
  // Danger zones are a newer endpoint. If the server has not landed it yet, fall back to an
  // empty collection so the rest of the app keeps working.
  dangerZones: async () => {
    try {
      return await request('/api/danger-zones');
    } catch {
      return { type: 'FeatureCollection', features: [], version: 0 };
    }
  },
  providers: () => request('/api/providers'),
  computeRoute: async (body, options) => {
    const response = await request<RoutePlan | RouteResult>('/api/routes/compute', {
      method: 'POST',
      body,
      signal: options?.signal,
    });
    // Graceful fallback: an older server returns a bare RouteResult, not a RoutePlan. Normalise
    // both into a RoutePlan so the rest of the client only ever deals with one shape.
    return 'routes' in response ? response : { routes: [response] };
  },
  routeEvents: (routeId) => request(`/api/routes/${id(routeId)}/events`),
  createReport: (body) =>
    request(`/api/routes/${id(body.routeId)}/reports`, { method: 'POST', body }),

  startNavigation: (routeId, simulated) =>
    request('/api/nav/sessions', { method: 'POST', body: { routeId, simulated } }),
  reportProgress: (body) =>
    request(`/api/nav/sessions/${id(body.sessionId)}/progress`, {
      method: 'POST',
      // Only the DTO fields; the session id travels in the path.
      body: {
        location: body.location,
        headingDegrees: body.headingDegrees ?? undefined,
        speedMps: body.speedMps ?? undefined,
        timestamp: body.timestamp,
      },
    }),
  endNavigation: (sessionId, arrived) =>
    request(`/api/nav/sessions/${id(sessionId)}/end`, { method: 'POST', body: { arrived } }),
  submitNavFeedback: (body) => request('/api/nav/feedback', { method: 'POST', body }),

  voiceManifest: (language, voiceId) =>
    request(`/api/voice/packs${query({ language, voice: voiceId })}`),
  resolveVoiceClips: (body) => request('/api/voice/clips/resolve', { method: 'POST', body }),
};
