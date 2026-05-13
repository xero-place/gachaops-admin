'use client';

/**
 * useLivePlayback — Phase 7.2 Step C
 *
 * Subscribes to the backend SSE stream at /dashboard/playback-stream and
 * pushes incoming state into useLivePlaybackStore so any component can
 * read the latest "what is each device playing" snapshot.
 *
 * Why fetch + ReadableStream instead of EventSource?
 *   The browser's EventSource API doesn't support custom headers, so we
 *   can't send Authorization: Bearer <token>. fetch() does, and we can
 *   parse the SSE format manually — it's just lines of "data: <json>\n\n".
 *
 * Reconnection:
 *   - Exponential backoff starting at 500ms, capped at 10s.
 *   - Automatic on stream close or fetch error.
 *   - Cancelled on unmount.
 *
 * Mock mode:
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

  useEffect(() => {
    const access = tokenStore.getAccess();
    if (!access) return;

    cancelledRef.current = false;
    let backoff = 500;

    const connect = async () => {
      if (cancelledRef.current) return;
      const url = `${api.baseUrl}/dashboard/playback-stream`;
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${access}`,
            Accept: 'text/event-stream',
          },
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE connect failed: ${res.status}`);
        }

        setConnected(true);
        backoff = 500; // reset on successful connect

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // SSE events are separated by "\n\n", lines start with "data: "
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const event = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of event.split('\n')) {
              if (line.startsWith('data: ')) {
                const json = line.slice(6);
                try {
                  const map = JSON.parse(json) as Record<string, DevicePlayback>;
                  setStates(map);
                } catch (e) {
                  // Malformed event; skip silently (server may send heartbeats etc later)
                }
              }
            }
          }
        }
      } catch (e) {
        // fetch was aborted (unmount) or network error
        if (cancelledRef.current) return;
      } finally {
        setConnected(false);
      }

      // Reconnect with backoff
      if (!cancelledRef.current) {
        setTimeout(connect, backoff);
        backoff = Math.min(10000, backoff * 2);
      }
    };

    connect();

    return () => {
      cancelledRef.current = true;
      controllerRef.current?.abort();
      setConnected(false);
    };
  }, [setStates, setConnected]);
}
