'use client';

/**
 * useLivePlayback — Phase 7.2 Step C（S166 多重接続防止版）
 *
 * backend の SSE ストリーム /v1/dashboard/playback-stream を購読し、
 * useLivePlaybackStore に最新の再生状態を流し込む。
 *
 * なぜ EventSource でなく fetch + ReadableStream か:
 *   EventSource はカスタムヘッダを付けられず Authorization: Bearer を
 *   送れない。fetch なら送れるので、SSE 形式（"data: <json>\n\n"）を
 *   手動パースする。
 *
 * S166 修正（503 連発の根治）:
 *   - 多重接続防止: connect() は同時に 1 本しか走らせない（connectingRef）。
 *   - 再接続前に必ず直前の接続を abort（接続の積み上げ＝HTTP 同時接続枯渇を防ぐ）。
 *   - 指数バックオフ（500ms → 最大 10s）、unmount で確実に停止。
 */
import { useEffect, useRef } from 'react';
import { tokenStore } from '@/lib/token-store';
import { api } from '@/lib/api';
import {
  useLivePlaybackStore,
  type DevicePlayback,
} from '@/stores/live-playback-store';

export function useLivePlayback() {
  const setStates = useLivePlaybackStore((s) => s.setStates);
  const setConnected = useLivePlaybackStore((s) => s.setConnected);

  const cancelledRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const connectingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cancelledRef.current = false;
    let backoff = 500;

    const scheduleReconnect = () => {
      if (cancelledRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(connect, backoff);
      backoff = Math.min(10000, backoff * 2);
    };

    async function connect() {
      if (cancelledRef.current) return;
      // 多重接続防止: 既に接続処理中なら何もしない
      if (connectingRef.current) return;

      const access = tokenStore.getAccess();
      if (!access) {
        scheduleReconnect();
        return;
      }

      // 念のため直前の接続を確実に閉じる（積み上げ防止）
      if (controllerRef.current) {
        try { controllerRef.current.abort(); } catch { /* noop */ }
        controllerRef.current = null;
      }

      connectingRef.current = true;
      const controller = new AbortController();
      controllerRef.current = controller;
      const url = `${api.baseUrl}/dashboard/playback-stream`;

      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${access}`,
            Accept: 'text/event-stream',
          },
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE connect failed: ${res.status}`);
        }

        setConnected(true);
        backoff = 500; // 成功したらバックオフをリセット

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const event = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of event.split('\n')) {
              if (line.startsWith('data: ')) {
                const json = line.slice(6);
                try {
                  const raw = JSON.parse(json) as Record<string, Record<string, unknown>>;
                  const map: Record<string, DevicePlayback> = {};
                  for (const [devId, v] of Object.entries(raw)) {
                    const num = (x: unknown) => {
                      const n = typeof x === 'number' ? x : Number(x);
                      return Number.isFinite(n) ? n : 0;
                    };
                    map[devId] = {
                      state: (v.state as DevicePlayback['state']) ?? 'idle',
                      position_ms: num(v.position_ms),
                      duration_ms: num(v.duration_ms),
                      memory_mb: num(v.memory_mb),
                      asset_url: typeof v.asset_url === 'string' ? v.asset_url : undefined,
                      updated_at_ms: num(v.updated_at_ms),
                    };
                  }
                  setStates(map);
                } catch {
                  // 壊れたイベントは黙って無視（heartbeat 等）
                }
              }
            }
          }
        }
      } catch {
        // abort（unmount）やネットワークエラー
        if (cancelledRef.current) return;
      } finally {
        connectingRef.current = false;
        setConnected(false);
      }

      // ストリームが閉じたら再接続
      scheduleReconnect();
    }

    connect();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (controllerRef.current) {
        try { controllerRef.current.abort(); } catch { /* noop */ }
        controllerRef.current = null;
      }
      connectingRef.current = false;
      setConnected(false);
    };
  }, [setStates, setConnected]);
}
