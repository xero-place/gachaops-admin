'use client';

/**
 * SSE hook for real-time playback state from server.
 * Connects to /v1/dashboard/playback-stream, receives state for all devices.
 *
 * Returns a map of device_id -> playback state, updated every 2 seconds.
 */

import { useEffect, useState } from 'react';
import { tokenStore } from '@/lib/token-store';

interface PlaybackState {
  state: 'playing' | 'paused' | 'idle';
  position_ms: number;
  duration_ms: number;
  memory_mb: number;
  asset_url?: string;
  updated_at_ms: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';

export function usePlaybackStream(enabled = true) {
  const [states, setStates] = useState<Record<string, PlaybackState>>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const token = tokenStore.getAccess();
    if (!token) return;

    // EventSource doesn't support custom headers, so use URL-encoded token.
    // The backend should accept it via query param too. If not, this needs
    // to be replaced with fetch + ReadableStream.
    // For now, attempt EventSource and fall back to polling if it fails.

    const url = `${API_BASE}/dashboard/playback-stream`;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const startPolling = async () => {
      // Fallback: poll every 3 seconds via fetch
      const fetchOnce = async () => {
        try {
          // playback-stream is SSE but we can use a simple fetch to its non-streaming variant
          // Actually, since it's pure SSE, we use fetch + ReadableStream
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok || !res.body) return;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          // Read just one event then close (poll mode)
          const { value } = await reader.read();
          reader.cancel();
          if (!value) return;

          buffer = decoder.decode(value);
          // SSE format: "data: {json}\n\n"
          const match = buffer.match(/data:\s*(.+)/);
          if (match) {
            try {
              const parsed = JSON.parse(match[1]);
              setStates(parsed);
              setConnected(true);
            } catch (e) {
              // ignore
            }
          }
        } catch (e) {
          setConnected(false);
        }
      };

      fetchOnce();
      pollInterval = setInterval(fetchOnce, 3000);
    };

    startPolling();

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [enabled]);

  return { states, connected };
}
