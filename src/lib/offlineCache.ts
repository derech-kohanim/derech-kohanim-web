import type { DangerZoneCollection, RouteResult, ZoneCollection } from '@dk/shared';

/**
 * Best-effort offline cache for the active-navigation data (route + zone layers + voice audio),
 * so a page reload mid-drive or a connectivity loss can restore from IndexedDB instead of
 * refetching. Everything here is defensive: if IndexedDB is unavailable or a call throws, the
 * helper resolves to null/void and the app behaves exactly as it did before the cache existed.
 */

const DB_NAME = 'dk-offline';
const DB_VERSION = 1;
const STORE = 'routeBundles';
/** localStorage pointer to the route the driver last started, keyed for reload restore. */
const ACTIVE_ROUTE_KEY = 'dk.activeRouteId';

/** One voice clip stored as raw bytes, so it can be re-decoded after a reload with no network. */
export interface CachedVoiceClip {
  key: string;
  mime: string;
  bytes: ArrayBuffer;
}

/** Everything needed to drive a route offline, keyed by route id. */
export interface RouteBundle {
  id: string;
  route: RouteResult;
  zones: ZoneCollection | null;
  dangerZones: DangerZoneCollection | null;
  voice: CachedVoiceClip[];
  savedAt: number;
}

export function isOfflineCacheAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Persist (or replace) the bundle for a route. Silently no-ops when the cache is unavailable. */
export async function putRouteBundle(bundle: RouteBundle): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bundle);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* best-effort: a failed write just means no offline restore for this route */
  } finally {
    db.close();
  }
}

/** Read the bundle for a route id, or null when nothing is cached / the cache is unavailable. */
export async function getRouteBundle(id: string): Promise<RouteBundle | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<RouteBundle | null>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve((request.result as RouteBundle | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/** Remember which route the driver started, so a reload knows what to restore. */
export function setActiveRouteId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_ROUTE_KEY, id);
    else localStorage.removeItem(ACTIVE_ROUTE_KEY);
  } catch {
    /* private-mode or storage disabled: restore simply won't be available */
  }
}

export function getActiveRouteId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ROUTE_KEY);
  } catch {
    return null;
  }
}
