'use client';

/**
 * /gacha/draw-effects - device-first effect mapping (Session 126 refactor)
 * Select device -> ensure dedicated pool -> edit draw-order mapping.
 * Mapping editor is extracted to DrawOrderMappingEditor (shared with device detail tab).
 * engine.py is untouched (pool-based API reused).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { DrawOrderMappingEditor } from '@/components/domain/draw-order-mapping-editor';
import type { GachaPool, GachaEffectPack, Device } from '@/types/domain';
import { Sparkles, AlertCircle } from 'lucide-react';

interface ListResponse<T> {
  items?: T[];
  data?: T[];
  total?: number;
}

export default function GachaDrawEffectsPage() {
  const [pools, setPools] = useState<GachaPool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string>('');
  const [packs, setPacks] = useState<GachaEffectPack[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [ensuring, setEnsuring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPool = useMemo(
    () => pools.find((p) => p.id === selectedPoolId) ?? null,
    [pools, selectedPoolId],
  );
  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<ListResponse<GachaEffectPack> | GachaEffectPack[]>(
          '/gacha/effect-packs',
        );
        const list = Array.isArray(res) ? res : res.items ?? res.data ?? [];
        if (cancelled) return;
        setPacks([...list].sort((a, b) => a.tier - b.tier));
      } catch (e) {
        if (!cancelled) setError('演出パック取得失敗: ' + (e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectDevice = useCallback(async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setEnsuring(true);
    setError(null);
    try {
      const machine = await api.post<{ device_id: string; pool_id: string | null }>(
        `/gacha/devices/${deviceId}/machine/ensure`,
        {},
      );
      if (machine.pool_id) {
        setSelectedPoolId(machine.pool_id);
        try {
          const poolsRes = await api.get<ListResponse<GachaPool> | GachaPool[]>('/gacha/pools');
          const poolList = Array.isArray(poolsRes) ? poolsRes : poolsRes.items ?? poolsRes.data ?? [];
          setPools(poolList);
        } catch {
          /* ignore pools refetch failure */
        }
      } else {
        setSelectedPoolId('');
        setError('この端末の専用設定を準備できませんでした');
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError('端末設定の準備に失敗: ' + msg);
    } finally {
      setEnsuring(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<ListResponse<Device> | Device[]>('/devices?limit=200');
        const list = Array.isArray(res) ? res : res.items ?? res.data ?? [];
        if (cancelled) return;
        setDevices(list);
        if (list.length > 0) {
          void selectDevice(list[0].id);
        }
      } catch (e) {
        if (!cancelled) setError('端末取得失敗: ' + (e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDefaultEffectChange = useCallback((updated: GachaPool) => {
    setPools((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  return (
    <AppShell title="ガチャ演出管理" breadcrumb={['ガチャ', '端末 → 演出マッピング']}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              端末を選択
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-md">
                <Label className="text-xs text-muted-foreground">端末</Label>
                <Select value={selectedDeviceId} onValueChange={(v) => void selectDevice(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="端末を選択..." />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}{d.store_name ? ' (' + d.store_name + ')' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1">{error}</div>
                <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
                  ×
                </button>
              </div>
            )}

            {selectedPool && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">端末</div>
                  <div className="font-medium">{selectedDevice?.name ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">顧客 ID</div>
                  <div className="font-mono">{selectedPool.customer_id}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">最大球数</div>
                  <div>{selectedPool.max_ball_number}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">価格 / 抽選</div>
                  <div>¥{selectedPool.price_per_draw}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedPool && !ensuring && (
          <DrawOrderMappingEditor
            poolId={selectedPoolId}
            packs={packs}
            defaultEffectPackId={selectedPool.default_effect_pack_id}
            onDefaultEffectChange={handleDefaultEffectChange}
          />
        )}
      </div>
    </AppShell>
  );
}
