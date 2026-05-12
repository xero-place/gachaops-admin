/**
 * JWT token storage. Persists access + refresh tokens in localStorage so
 * the user stays logged in across browser sessions.
 *
 * Refresh strategy: if access token returns 401, the api client
 * automatically calls /v1/auth/refresh once, swaps tokens, and retries.
 */

const ACCESS_KEY = 'gachaops_access_token';
const REFRESH_KEY = 'gachaops_refresh_token';
const USER_KEY = 'gachaops_user';

export interface StoredUser {
  id: string;
  customer_id: string;
  email: string;
  name: string;
  role: string;
  two_factor_enabled: boolean;
}

function isClient(): boolean {
  return typeof window !== 'undefined';
}

export const tokenStore = {
  getAccess(): string | null {
    if (!isClient()) return null;
    return localStorage.getItem(ACCESS_KEY);
  },
  getRefresh(): string | null {
    if (!isClient()) return null;
    return localStorage.getItem(REFRESH_KEY);
  },
  getUser(): StoredUser | null {
    if (!isClient()) return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      return null;
    }
  },
  set(access: string, refresh: string, user?: StoredUser): void {
    if (!isClient()) return;
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear(): void {
    if (!isClient()) return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isAuthenticated(): boolean {
    return !!this.getAccess();
  },
};
