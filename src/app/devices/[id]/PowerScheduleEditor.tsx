'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { usePageT } from '@/i18n/usePageT';
import { powerScheduleDict } from '@/i18n/ns/powerSchedule';

type Sched = {
  id?: string;
  weekday: number;
  power_on_time: string;
  power_off_time: string;
  enabled: boolean;
  off_mode: string;
};

type Row = {
  enabled: boolean;
  power_on_time: string;
  power_off_time: string;
  off_mode: string;
  existingId?: string;
};

const DEFAULT_ROW: Row = {
  enabled: false,
  power_on_time: '09:00',
  power_off_time: '18:00',
  off_mode: 'message',
};

export function PowerScheduleEditor({ deviceId }: { deviceId: string }) {
  const t = usePageT(powerScheduleDict);
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: 7 }, () => ({ ...DEFAULT_ROW }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Sched[]>(`/devices/${deviceId}/power-schedules`);
      const next: Row[] = Array.from({ length: 7 }, () => ({ ...DEFAULT_ROW }));
      for (const s of data) {
        if (s.weekday >= 0 && s.weekday <= 6) {
          next[s.weekday] = {
            enabled: s.enabled,
            power_on_time: s.power_on_time,
            power_off_time: s.power_off_time,
            off_mode: s.off_mode ?? 'message',
            existingId: s.id,
          };
        }
      }
      setRows(next);
    } catch {
      // 取得失敗時はデフォルトのまま
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  const update = (wd: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === wd ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      for (let wd = 0; wd < 7; wd++) {
        const r = rows[wd];
        if (r.enabled) {
          await api.post(`/devices/${deviceId}/power-schedules`, {
            weekday: wd,
            power_on_time: r.power_on_time,
            power_off_time: r.power_off_time,
            enabled: true,
            off_mode: r.off_mode,
          });
        } else if (r.existingId) {
          try {
            await api.delete(`/devices/${deviceId}/power-schedules/${r.existingId}`);
          } catch {
            // 削除失敗は無視
          }
        }
      }
      window.alert(t.savedMsg);
      await load();
    } catch (e) {
      window.alert(t.saveFailed(e instanceof Error ? e.message : t.unknownError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground p-2">{t.loading}</div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t.intro}
      </p>
      <div className="space-y-2">
        {rows.map((r, wd) => (
          <div key={wd} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            <label className="flex items-center gap-1.5 w-20">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => update(wd, { enabled: e.target.checked })}
              />
              <span className="text-sm font-medium">{t.weekdays[wd]}</span>
            </label>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-muted-foreground">{t.open}</span>
              <input
                type="time"
                value={r.power_on_time}
                disabled={!r.enabled}
                onChange={(e) => update(wd, { power_on_time: e.target.value })}
                className="border rounded px-1 py-0.5 text-sm bg-background disabled:opacity-40"
              />
              <span className="text-muted-foreground">〜</span>
              <input
                type="time"
                value={r.power_off_time}
                disabled={!r.enabled}
                onChange={(e) => update(wd, { power_off_time: e.target.value })}
                className="border rounded px-1 py-0.5 text-sm bg-background disabled:opacity-40"
              />
            </div>
            <div className="w-44">
              <Select
                value={r.off_mode}
                disabled={!r.enabled}
                onValueChange={(v) => update(wd, { off_mode: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="message">{t.offMessage}</SelectItem>
                  <SelectItem value="blackout">{t.offBlackout}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? t.saving : t.saveBtn}
        </Button>
      </div>
    </div>
  );
}
