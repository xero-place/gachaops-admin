'use client';

/**
 * Live playback store — Phase 7.2 Step C
 *
 * Holds the current playback state (playing / paused / idle) for each device,
 * fed by an SSE stream from the backend's /dashboard/playback-stream endpoint.
 *
 * Data flow:
 *   Android device  --(WS playback_status every 5s)-->  backend
 *   backend Redis HSET playback:<device_id>
 *   backend SSE every 2s -->  this store  -->  React components
 *
 * State is automatically refreshed every 2s; if no SSE update for a device
 * arrives within 30s (server-side TTL), the device key disappears from the
 * payload and we treat it as "unknown" (don't show any badge).
 */
import { create } from 'zustand';

export type PlaybackState = 'playing' | 'paused' | 'idle';

export interface DevicePlayback {
  state: PlaybackState;
  updated_at_ms?: number;
}

interface LivePlaybackStore {
  /** key = device_id; absent = no recent update (treat as unknown) */
  states: Record<string, DevicePlayback>;
  /** Whether the SSE connection is currently active */
  isConnected: boolean;
  /** Set the full state map (from an SSE event) */
  setStates: (map: Record<string, DevicePlayback>) => void;
  /** Update connection status */
  setConnected: (v: boolean) => void;
  /** Clear all state (e.g. on logout) */
  clear: () => void;
}

export const useLivePlaybackStore = create<LivePlaybackStore>((set) => ({
  states: {},
  isConnected: false,
  setStates: (map) => set({ states: map }),
  setConnected: (v) => set({ isConnected: v }),
  clear: () => set({ states: {}, isConnected: false }),
}));

/** Get playback state for a specific device (selector helper). */
export function getDevicePlayback(
  states: Record<string, DevicePlayback>,
  deviceId: string,
): DevicePlayback | null {
  return states[deviceId] ?? null;
}
