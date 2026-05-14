'use client';

/**
 * Live control overrides — client-side store of "what was just changed".
 *
 * Behaviour:
 *   - In MOCK mode: pure client-side state, makes the UI feel like it
 *   - In LIVE API mode: ALSO posts a real /devices/bulk command so the
 *     backend forwards play_program to all selected devices over WS.
 *     The local override is still kept for immediate UI feedback while
 *     the WS round-trip completes.
 */
import { create } from 'zustand';
import type { Device, PlayMode } from '@/types/domain';
import { api } from '@/lib/api';

export interface LiveOverride {
  device_id: string;
  /** New play_mode after the switch */
  play_mode: PlayMode;
  /** Program currently playing (id) — null if returned to idle */
  program_id: string | null;
  /** Program human-readable name (so the table doesn't need a join) */
  program_name: string | null;
  /** When was this manual override applied? */
  applied_at: string;
  /** If the override was time-limited, when does it expire? */
  expires_at: string | null;
  /** Audit-style note */
  applied_by: string;
}

export interface LiveActionLog {
  id: string;
  ts: string;
  action: 'switch' | 'restore_plan' | 'set_idle';
  /** Free-text scope summary, e.g. "渋谷店 (8台)" */
  scope_label: string;
  affected_count: number;
  program_id: string | null;
  program_name: string | null;
  expires_at: string | null;
  applied_by: string;
}

interface LiveStore {
  /** key = device_id */
  overrides: Record<string, LiveOverride>;
  /** Most recent first */
  history: LiveActionLog[];
  applySwitch: (input: {
    device_ids: string[];
    program_id: string;
    program_name: string;
    expires_at: string | null;
    scope_label: string;
    applied_by: string;
  }) => void;
  restorePlan: (input: { device_ids: string[]; scope_label: string; applied_by: string }) => void;
}

export const useLiveStore = create<LiveStore>((set) => ({
  overrides: {},
  history: [],
  applySwitch: ({ device_ids, program_id, program_name, expires_at, scope_label, applied_by }) => {
    // Fire the real bulk command in the background. We don't await it —
    // the UI feedback comes from the optimistic override below. If it
    // fails the user sees the error in the network tab; the override
    // remains visible.
    if (true) {
      api.post('/devices/bulk', {
        device_ids,
        command: {
          type: 'play_program',
          payload: {
            // ★ v11.6 修正: asset_url ハードコード削除、サーバが DB から正規 URL を解決 ★
            program_id,
          },
          expires_at,
        },
      }).catch((e) => {
        console.error('bulk play_program failed', e);
      });
    }

    set((state) => {
      const now = new Date().toISOString();
      const newOverrides = { ...state.overrides };
      for (const id of device_ids) {
        newOverrides[id] = {
          device_id: id,
          play_mode: 'manual',
          program_id,
          program_name,
          applied_at: now,
          expires_at,
          applied_by,
        };
      }
      return {
        overrides: newOverrides,
        history: [
          {
            id: 'la_' + Math.random().toString(36).slice(2, 10),
            ts: now,
            action: 'switch' as const,
            scope_label,
            affected_count: device_ids.length,
            program_id,
            program_name,
            expires_at,
            applied_by,
          },
          ...state.history,
        ].slice(0, 50),
      };
    });
  },
  restorePlan: ({ device_ids, scope_label, applied_by }) => {
    if (true) {
      api.post('/devices/bulk', {
        device_ids,
        command: { type: 'stop', payload: {} },
      }).catch((e) => {
        console.error('bulk stop failed', e);
      });
    }
    set((state) => {
      const newOverrides = { ...state.overrides };
      for (const id of device_ids) delete newOverrides[id];
      const now = new Date().toISOString();
      return {
        overrides: newOverrides,
        history: [
          {
            id: 'la_' + Math.random().toString(36).slice(2, 10),
            ts: now,
            action: 'restore_plan' as const,
            scope_label,
            affected_count: device_ids.length,
            program_id: null,
            program_name: null,
            expires_at: null,
            applied_by,
          },
          ...state.history,
        ].slice(0, 50),
      };
    });
  },
}));

/**
 * Filters out expired overrides automatically.
 */
export function applyOverridesToDevice<T extends Device>(d: T, overrides: Record<string, LiveOverride>): T {
  const o = overrides[d.id];
  if (!o) return d;
  // If expired, treat as not overridden
  if (o.expires_at && new Date(o.expires_at).getTime() < Date.now()) return d;
  return {
    ...d,
    play_mode: o.play_mode,
    current_program_id: o.program_id,
    current_program_name: o.program_name,
  };
}

export function applyOverridesToDevices<T extends Device>(devices: T[], overrides: Record<string, LiveOverride>): T[] {
  return devices.map((d) => applyOverridesToDevice(d, overrides));
}
