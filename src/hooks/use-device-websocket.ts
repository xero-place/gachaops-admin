'use client';

/**
 * useDeviceWebSocket — administrative WebSocket subscriber.
 *
 * Note: in this codebase /ws/v2/device is for SIGNAGE devices (each with
 * a device_token). For an *admin observer* WS endpoint we'd add another
 * route that broadcasts task updates. For now this hook is a thin
 * connector that you can use from any page once the /ws/v2/admin
 * endpoint is added (Phase 2 — see backend README).
 *
 * Provided here so wiring into the UI is one import away.
 */
import { useEffect, useRef, useState } from 'react';
import { tokenStore } from '@/lib/token-store';
import { api } from '@/lib/api';

export type WsState = 'idle' | 'connecting' | 'open' | 'closed';

export function useDeviceWebSocket(
  path: string,
  onMessage?: (msg: unknown) => void,
) {
  const [state, setState] = useState<WsState>('idle');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const access = tokenStore.getAccess();
    if (!access) return;

    let backoff = 500;
    let cancelled = false;
    const apiBase = api.baseUrl.replace(/\/v1$/, '');
    const wsBase = apiBase.startsWith('https://')
      ? apiBase.replace('https://', 'wss://')
      : apiBase.replace('http://', 'ws://');

    const connect = () => {
      if (cancelled) return;
      setState('connecting');
      const ws = new WebSocket(`${wsBase}${path}?token=${encodeURIComponent(access)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setState('open');
        backoff = 500;
      };
      ws.onmessage = (e) => {
        try {
          onMessage?.(JSON.parse(e.data));
        } catch {
          onMessage?.(e.data);
        }
      };
      ws.onclose = () => {
        setState('closed');
        if (!cancelled) {
          setTimeout(connect, backoff);
          backoff = Math.min(10000, backoff * 2);
        }
      };
      ws.onerror = () => {
        ws.close();
      };
    };
    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [path, onMessage]);

  return { state, send: (msg: unknown) => wsRef.current?.send(JSON.stringify(msg)) };
}
