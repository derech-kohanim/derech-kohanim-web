import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LoginRequest, RegisterRequest, User } from '@dk/shared';

import { api, tokenStore } from '@/api';

const ONBOARDED_KEY = 'dk.onboarded';

interface AuthApi {
  user: User | null;
  ready: boolean;
  /** True once the terms have been accepted, whether or not an account exists. */
  onboarded: boolean;
  acceptedTermsVersion: string | null;
  completeOnboarding: (termsVersion: string) => void;
  login: (body: LoginRequest) => Promise<void>;
  register: (body: RegisterRequest) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  devLogin: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [acceptedTermsVersion, setAcceptedTermsVersion] = useState<string | null>(() =>
    localStorage.getItem(ONBOARDED_KEY),
  );

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!tokenStore.read()) {
        setReady(true);
        return;
      }
      try {
        const restored = await api.currentUser();
        if (!cancelled) setUser(restored);
      } catch {
        tokenStore.clear();
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const completeOnboarding = useCallback((termsVersion: string) => {
    localStorage.setItem(ONBOARDED_KEY, termsVersion);
    setAcceptedTermsVersion(termsVersion);
  }, []);

  const login = useCallback(async (body: LoginRequest) => {
    const response = await api.login(body);
    setUser(response.user);
  }, []);

  const register = useCallback(async (body: RegisterRequest) => {
    const response = await api.register(body);
    setUser(response.user);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const response = await api.loginWithGoogle({ idToken });
    setUser(response.user);
  }, []);

  const devLogin = useCallback(async (email: string) => {
    const response = await api.devLogin(email);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      user,
      ready,
      onboarded: acceptedTermsVersion !== null,
      acceptedTermsVersion,
      completeOnboarding,
      login,
      register,
      loginWithGoogle,
      devLogin,
      logout,
    }),
    [
      user,
      ready,
      acceptedTermsVersion,
      completeOnboarding,
      login,
      register,
      loginWithGoogle,
      devLogin,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
