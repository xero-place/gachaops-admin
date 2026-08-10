/**
 * API client. Knows about:
 *   - RFC 9457 problem+json error responses
 *   - JWT access token (auto-attached as Authorization: Bearer ...)
 *   - 401 auto-refresh with the stored refresh token (retry once)
 *
 * Configuration:
 *   NEXT_PUBLIC_API_BASE_URL=https://api.xero-place.com/v1   ← real backend (required)
 */
import { tokenStore, type StoredUser } from './token-store';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public problem: ProblemDetails,
  ) {
    super(problem.title || `HTTP ${status}`);
  }
}

export interface ProblemDetails {
  type?: string;
  title: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: { field: string; code: string; message: string }[];
}

type RefreshOutcome = 'refreshed' | 'stale' | 'authfail' | 'transient'; // S199
let refreshing: Promise<RefreshOutcome> | null = null;

// S199: refresh-token handling hardened for the backend's rotating refresh
// tokens + reuse-detection (auth.py refresh → "family revoked").
//   1. Serialize refresh across ALL tabs via the Web Locks API so two tabs
//      never present the same refresh token at once (the backend would treat
//      that as a replay and revoke the whole family → every tab logged out).
//   2. If another tab already refreshed while we waited for the lock, do NOT
//      refresh again — return 'stale' so the caller retries with the new token.
//   3. Only a real 401/403 from /auth/refresh is an auth failure; a network
//      error or 5xx is 'transient' and must NOT drop the session.
async function performRefresh(usedAccess: string | null): Promise<RefreshOutcome> {
  // Another tab rotated the token while we waited for the lock.
  if (usedAccess && tokenStore.getAccess() !== usedAccess) return 'stale';
  const refresh = tokenStore.getRefresh();
  if (!refresh) return 'authfail';
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
  } catch {
    return 'transient'; // network blip — keep the session
  }
  if (res.ok) {
    const data = await res.json();
    tokenStore.set(data.access_token, data.refresh_token, tokenStore.getUser() ?? undefined);
    return 'refreshed';
  }
  return res.status === 401 || res.status === 403 ? 'authfail' : 'transient';
}

async function tryRefresh(usedAccess: string | null): Promise<RefreshOutcome> {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as
    | (Navigator & { locks?: { request: (name: string, cb: () => Promise<RefreshOutcome>) => Promise<RefreshOutcome> } })
    | undefined;
  if (nav?.locks?.request) {
    // Cross-tab mutual exclusion: only one refresh runs at a time per origin.
    return nav.locks.request('gachaops_token_refresh', () => performRefresh(usedAccess));
  }
  // Fallback (SSR / very old browsers): single-flight within this tab only.
  if (refreshing) return refreshing;
  refreshing = performRefresh(usedAccess).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
  retried = false,
): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...(init?.headers as Record<string, string> | undefined),
  };
  const access = tokenStore.getAccess();
  if (access && !headers.Authorization) {
    headers.Authorization = `Bearer ${access}`;
  }

  const { headers: _initHeaders, body: _initBody, ...initRest } = init ?? {};
  void _initHeaders; void _initBody;
  const res = await fetch(BASE_URL + path, {
    ...initRest,
    method,
    headers,
    body: body !== undefined
      ? (isForm ? (body as FormData) : JSON.stringify(body))
      : undefined,
    cache: 'no-store',
  });

  // Auto-refresh on 401 (once). S199: tell a real auth failure apart from a
  // transient/stale one so a blip or a cross-tab race never logs the user out.
  if (res.status === 401 && !retried && tokenStore.getRefresh() && !path.startsWith('/auth/')) {
    const outcome = await tryRefresh(access);
    if (outcome === 'refreshed' || outcome === 'stale') {
      return call<T>(method, path, body, init, true);
    }
    if (outcome === 'authfail') {
      // Refresh token genuinely invalid/revoked → sign out.
      tokenStore.clear();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    // 'transient' → keep the session; the error is surfaced below and the
    // user can retry. No clear(), no redirect.
  }

  if (!res.ok) {
    let problem: ProblemDetails = { title: `HTTP ${res.status}` };
    try {
      problem = await res.json();
    } catch {
      // not JSON, ignore
    }
    throw new ApiError(res.status, problem);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(path: string, init?: RequestInit) => call<T>('GET', path, undefined, init),
  post: <T,>(path: string, body?: unknown, init?: RequestInit) =>
    call<T>('POST', path, body, init),
  patch: <T,>(path: string, body?: unknown, init?: RequestInit) =>
    call<T>('PATCH', path, body, init),
  put: <T,>(path: string, body?: unknown, init?: RequestInit) =>
    call<T>('PUT', path, body, init),
  delete: <T,>(path: string, init?: RequestInit) =>
    call<T>('DELETE', path, undefined, init),
  baseUrl: BASE_URL,
};

// ─── Auth helpers ───
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    customer_id: string;
    email: string;
    name: string;
    role: string;
    two_factor_enabled: boolean;
  };
}

export interface OtpRequiredResponse {
  status: 'otp_required';
  email: string;
  message: string;
}

export interface VerifyOtpResponse extends LoginResponse {
  device_token: string;
}

export { tokenStore };

export function isOtpRequired(
  r: LoginResponse | OtpRequiredResponse,
): r is OtpRequiredResponse {
  return (r as OtpRequiredResponse).status === 'otp_required';
}

export interface ImpersonateResponse extends LoginResponse {
  impersonated: true;
}

export const auth = {
  // S216: 現在ログイン中ユーザーをサーバから取得（ヘッダーのゲスト表示の自己修復用）。
  async me(): Promise<StoredUser> {
    return api.get<StoredUser>('/auth/me');
  },
  async login(
    email: string,
    password: string,
    totp_code?: string,
  ): Promise<LoginResponse | OtpRequiredResponse> {
    const device = tokenStore.getDevice();
    const data = await api.post<LoginResponse | OtpRequiredResponse>(
      '/auth/login',
      {
        email,
        password,
        ...(totp_code ? { totp_code } : {}),
      },
      device ? { headers: { 'x-device-token': device } } : undefined,
    );
    // OTP required -> do NOT store tokens; caller shows the code step.
    if (isOtpRequired(data)) {
      return data;
    }
    tokenStore.set(data.access_token, data.refresh_token, data.user);
    return data;
  },
  async verifyOtp(email: string, code: string): Promise<VerifyOtpResponse> {
    const data = await api.post<VerifyOtpResponse>('/auth/verify-otp', {
      email,
      code,
    });
    tokenStore.set(data.access_token, data.refresh_token, data.user);
    if (data.device_token) tokenStore.setDevice(data.device_token);
    return data;
  },
  // S157: lv1_super only. Saves the operator session, then swaps to the
  // target user's tokens. stopImpersonation() restores the operator.
  async impersonate(targetUserId: string): Promise<ImpersonateResponse> {
    tokenStore.saveImpersonatorSnapshot();
    const data = await api.post<ImpersonateResponse>('/auth/impersonate', {
      target_user_id: targetUserId,
    });
    tokenStore.set(data.access_token, data.refresh_token, data.user);
    return data;
  },
  stopImpersonation(): boolean {
    return tokenStore.restoreImpersonator();
  },
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // best-effort; clear tokens regardless
    }
    // Explicit logout fully signs out this device (OTP required next time).
    tokenStore.clear({ forgetDevice: true });
  },
};
