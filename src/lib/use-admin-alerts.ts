'use client';

import { useEffect, useRef, useState } from 'react';
import { tokenStore } from './token-store';

export interface AdminAlert {
  alert_id: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  customer_id?: string;
  ts_ms: number;
  payload: {
    device_id?: string;
    memory_mb?: number;
    threshold_mb?: number;
    [key: string]: unknown;
  };
  type?: string;
}

/**
 * Tier 2-G: Admin alerts subscription hook.
 *
 * - Connects to /ws/v2/admin?token=<jwt> on mount
 * - Receives historical alerts + live updates
 * - Reconnects with exponential backoff on failure
 * - Returns list of recent alerts (oldest first)
 */
export function useAdminAlerts(): {
  alerts: AdminAlert[];
  connected: boolean;
  clear: () => void;
} {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Decode JWT payload (best-effort, no signature check) to detect expiry
    const isTokenExpired = (token: string): boolean => {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return true;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (!payload.exp) return false;
        // Refresh 30s before actual expiry to avoid race
        return Date.now() / 1000 > payload.exp - 30;
      } catch {
        return true;
      }
    };

    // Refresh access token using refresh token. Returns new access token or null.
    const refreshAccessToken = async (): Promise<string | null> => {
      const refresh = tokenStore.getRefresh();
      if (!refresh) return null;
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';
        const res = await fetch(`${apiBase}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        tokenStore.set(data.access_token, data.refresh_token, tokenStore.getUser() ?? undefined);
        return data.access_token as string;
      } catch {
        return null;
      }
    };

    const connect = async () => {
      if (cancelled) return;
      let token = tokenStore.getAccess();
      if (!token) {
        // Not logged in - retry in 5s
        retryTimerRef.current = setTimeout(connect, 5000);
        return;
      }

      // Proactively refresh if expired or near-expiry
      if (isTokenExpired(token)) {
        console.log('[admin-ws] access token expired, refreshing...');
        const fresh = await refreshAccessToken();
        if (!fresh) {
          // Refresh failed - retry later
          retryTimerRef.current = setTimeout(connect, 10000);
          return;
        }
        token = fresh;
      }

      // Derive WS URL from API base URL
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';
      let wsUrl: string;
      try {
        const url = new URL(apiBase);
        const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${wsProtocol}//${url.host}/ws/v2/admin?token=${encodeURIComponent(token)}`;
      } catch {
        console.warn('Admin WS: invalid API base URL, skipping');
        return;
      }

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        let rejectedAuth = false;

        ws.onopen = () => {
          if (cancelled) {
            ws.close();
            return;
          }
          setConnected(true);
          retryCountRef.current = 0;
          console.log('[admin-ws] connected');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as AdminAlert;
            setAlerts((prev) => {
              if (prev.some((a) => a.alert_id === data.alert_id)) return prev;
              return [...prev, data].slice(-50);
            });
          } catch (e) {
            console.warn('[admin-ws] invalid message', e);
          }
        };

        ws.onerror = () => {
          // ignore - onclose handles reconnect; mark for auth refresh probe
          rejectedAuth = true;
        };

        ws.onclose = async (ev) => {
          if (cancelled) return;
          setConnected(false);

          // If closed almost immediately (within 2s of open attempt), likely auth issue.
          // Try refreshing the token before next reconnect.
          if (rejectedAuth || (ev.code !== 1000 && retryCountRef.current === 0)) {
            console.log('[admin-ws] possible auth failure, attempting token refresh');
            await refreshAccessToken();
          }

          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
          retryCountRef.current += 1;
          console.log(`[admin-ws] disconnected, retry in ${delay}ms`);
          retryTimerRef.current = setTimeout(connect, delay);
        };
      } catch (e) {
        console.warn('[admin-ws] connect failed', e);
        retryTimerRef.current = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const clear = async () => {
    // Clear on server-side (Redis) so it doesn't come back on reload
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';
      const token = tokenStore.getAccess();
      await fetch(`${apiBase}/alerts/clear`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Failed to clear alerts on server:', err);
    }
    setAlerts([]);
  };

  return { alerts, connected, clear };
}
