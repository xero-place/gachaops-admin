/**
 * API client. Knows about:
 *   - RFC 9457 problem+json error responses
 *   - JWT access token (auto-attached as Authorization: Bearer ...)
 *   - 401 auto-refresh with the stored refresh token (retry once)
 *
 * Configuration:
 *   NEXT_PUBLIC_API_BASE_URL=https://api.xero-place.com/v1   ← real backend (required)
 */
import { tokenStore } from './token-store';

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

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  refreshing = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      tokenStore.set(data.access_token, data.refresh_token, tokenStore.getUser() ?? undefined);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  const access = tokenStore.getAccess();
  if (access && !headers.Authorization) {
    headers.Authorization = `Bearer ${access}`;
  }

  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    ...init,
  });

  // Auto-refresh on 401 (once)
  if (res.status === 401 && !retried && tokenStore.getRefresh() && !path.startsWith('/auth/')) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return call<T>(method, path, body, init, true);
    }
    // Refresh failed → clear tokens, send to login
    tokenStore.clear();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
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

export const auth = {
  async login(email: string, password: string, totp_code?: string): Promise<LoginResponse> {
    const data = await api.post<LoginResponse>('/auth/login', {
      email,
      password,
      ...(totp_code ? { totp_code } : {}),
    });
    tokenStore.set(data.access_token, data.refresh_token, data.user);
    return data;
  },
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // best-effort; clear tokens regardless
    }
    tokenStore.clear();
  },
};
