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
const DEVICE_KEY = 'gachaops_device_token';
const IMP_SNAPSHOT_KEY = 'gachaops_impersonator';

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
  // S216: 認証は有効なのに user が欠落した状態(ヘッダーが「ゲスト」表示)を
  // /auth/me の結果で復元するためのセッター。
  setUser(user: StoredUser): void {
    if (!isClient()) return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  getDevice(): string | null {
    if (!isClient()) return null;
    return localStorage.getItem(DEVICE_KEY);
  },
  setDevice(token: string): void {
    if (!isClient()) return;
    localStorage.setItem(DEVICE_KEY, token);
  },
  // S157 impersonation: stash the operator's own session so we can
  // restore it with one click after acting as another account.
  saveImpersonatorSnapshot(): void {
    if (!isClient()) return;
    const access = localStorage.getItem(ACCESS_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    const user = localStorage.getItem(USER_KEY);
    if (!access || !refresh) return;
    // Do not overwrite an existing snapshot (no nested impersonation).
    if (localStorage.getItem(IMP_SNAPSHOT_KEY)) return;
    localStorage.setItem(
      IMP_SNAPSHOT_KEY,
      JSON.stringify({ access, refresh, user }),
    );
  },
  isImpersonating(): boolean {
    if (!isClient()) return false;
    return !!localStorage.getItem(IMP_SNAPSHOT_KEY);
  },
  restoreImpersonator(): boolean {
    if (!isClient()) return false;
    const raw = localStorage.getItem(IMP_SNAPSHOT_KEY);
    if (!raw) return false;
    try {
      const snap = JSON.parse(raw) as { access: string; refresh: string; user: string | null };
      localStorage.setItem(ACCESS_KEY, snap.access);
      localStorage.setItem(REFRESH_KEY, snap.refresh);
      if (snap.user) localStorage.setItem(USER_KEY, snap.user);
    } catch {
      return false;
    }
    localStorage.removeItem(IMP_SNAPSHOT_KEY);
    return true;
  },
  set(access: string, refresh: string, user?: StoredUser): void {
    if (!isClient()) return;
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  // clear() drops the session. By default the device token is KEPT so an
  // automatic expiry (refresh failure) leaves the device trusted and the
  // next login can skip OTP (up to the 90-day device TTL). Pass
  // { forgetDevice: true } on an explicit logout to fully sign out this
  // device, which then requires the OTP code again next time.
  // The real 422 fix lives in login/page.tsx (never send an empty code),
  // so keeping the device token here is safe.
  clear(opts?: { forgetDevice?: boolean }): void {
    if (!isClient()) return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(IMP_SNAPSHOT_KEY);
    if (opts?.forgetDevice) {
      localStorage.removeItem(DEVICE_KEY);
    }
  },
  isAuthenticated(): boolean {
    return !!this.getAccess();
  },
};
