import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { UserPreferences } from '@dk/shared';
import { useTranslation } from 'react-i18next';

import { api } from '@/api';
import { currentLanguage } from '@/i18n';
import { useAuth } from '@/state/AuthProvider';

const STORAGE_KEY = 'dk.preferences';

const DEFAULTS: UserPreferences = {
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

interface PreferencesApi {
  preferences: UserPreferences;
  update: (patch: Partial<UserPreferences>) => void;
}

const PreferencesContext = createContext<PreferencesApi | null>(null);

function load(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<UserPreferences>) };
  } catch {
    /* fall back to the defaults */
  }
  return { ...DEFAULTS, language: currentLanguage() };
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(load);
  const hydratedFor = useRef<string | null>(null);
  const lastSynced = useRef<string>('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  // On sign in, adopt the account's stored preferences: the server is the source of truth.
  useEffect(() => {
    if (!user) {
      hydratedFor.current = null;
      return;
    }
    if (hydratedFor.current === user.id) return;
    hydratedFor.current = user.id;
    lastSynced.current = JSON.stringify(user.preferences);
    setPreferences((current) => ({ ...current, ...user.preferences }));
  }, [user]);

  // Persist changes back to the account, so they survive a reload and follow the user across
  // devices. Skips the values that just arrived from the server to avoid an echo.
  useEffect(() => {
    if (!user) return;
    const serialized = JSON.stringify(preferences);
    if (serialized === lastSynced.current) return;
    lastSynced.current = serialized;
    void api.updatePreferences(preferences).catch(() => undefined);
  }, [preferences, user]);

  useEffect(() => {
    const root = document.documentElement;
    if (preferences.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preferences.theme);
  }, [preferences.theme]);

  useEffect(() => {
    if (i18n.language !== preferences.language) void i18n.changeLanguage(preferences.language);
  }, [i18n, preferences.language]);

  const update = useCallback((patch: Partial<UserPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
  }, []);

  const value = useMemo(() => ({ preferences, update }), [preferences, update]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesApi {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider');
  return context;
}
