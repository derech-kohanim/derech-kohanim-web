import type { AuthTokens } from '@dk/shared';

const STORAGE_KEY = 'dk.tokens';

interface StoredTokens extends AuthTokens {
  /** Epoch milliseconds. Lets the client refresh before a request fails. */
  expiresAt: number;
}

let cache: StoredTokens | null | undefined;

export const tokenStore = {
  read(): StoredTokens | null {
    if (cache !== undefined) return cache;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      cache = raw ? (JSON.parse(raw) as StoredTokens) : null;
    } catch {
      cache = null;
    }
    return cache;
  },

  write(tokens: AuthTokens): void {
    const stored: StoredTokens = { ...tokens, expiresAt: Date.now() + tokens.expiresIn * 1000 };
    cache = stored;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  },

  clear(): void {
    cache = null;
    localStorage.removeItem(STORAGE_KEY);
  },

  isExpiring(): boolean {
    const tokens = tokenStore.read();
    if (!tokens) return false;
    return tokens.expiresAt - Date.now() < 30_000;
  },
};
