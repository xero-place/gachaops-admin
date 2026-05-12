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

    const connect = () => {
      if (cancelled) return;
      const token = tokenStore.getAccess();
      if (!token) {
        // Not logged in - retry in 5s
        retryTimerRef.current = setTimeout(connect, 5000);
        return;
      }

      // Derive WS URL from API base URL
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';
      // Convert https://api.xero-place.com/v1 -> wss://api.xero-place.com/ws/v2/admin
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
              // Dedupe by alert_id
              if (prev.some((a) => a.alert_id === data.alert_id)) return prev;
              // Keep last 50
              return [...prev, data].slice(-50);
            });
          } catch (e) {
            console.warn('[admin-ws] invalid message', e);
          }
        };

        ws.onerror = () => {
          // ignore - onclose handles reconnect
        };

        ws.onclose = () => {
          if (cancelled) return;
          setConnected(false);
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

  const clear = () => setAlerts([]);

  return { alerts, connected, clear };
}
