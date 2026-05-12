'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  LiveControlSheet,
  type LiveControlScope,
} from '@/components/domain/live-control-sheet';
import {
  useLiveStore,
  applyOverridesToDevices,
} from '@/stores/live-control-store';
import { api } from '@/lib/api';
import type { Device, Store, DeviceGroup } from '@/types/domain';
import { fmtRelative } from '@/lib/format';
import {
  Zap,
  Building2,
  Layers3,
  Globe2,
  Search,
  Undo2,
  Clock,
  Activity,
  PlayCircle,
  Wifi,
  Loader2,
  AlertTriangle,
  PowerOff,
} from 'lucide-react';

interface ListResponse<T> { items?: T[]; data?: T[]; total?: number }

export default function LiveControlPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [devR, strR, grpR] = await Promise.all([
          api.get<ListResponse<Device> | Device[]>('/devices?limit=200'),
          api.get<ListResponse<Store> | Store[]>('/stores?limit=200'),
          api.get<ListResponse<DeviceGroup> | DeviceGroup[]>('/device-groups?limit=100').catch(() => [] as DeviceGroup[]),
        ]);
        if (cancelled) return;
        const dArr = Array.isArray(devR) ? devR : (devR.items ?? devR.data ?? []);
        const sArr = Array.isArray(strR) ? strR : (strR.items ?? strR.data ?? []);
        const gArr = Array.isArray(grpR) ? grpR : (grpR.items ?? grpR.data ?? []);
        setDevices(dArr);
        setStores(sArr);
        setDeviceGroups(gArr);
      } catch (e) {
        // best effort
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const overrides = useLiveStore((s) => s.overrides);
  const history = useLiveStore((s) => s.history);
  const restorePlan = useLiveStore((s) => s.restorePlan);

  // Tier 2-E: Emergency stop state + handler
  const [emergencyStopBusy, setEmergencyStopBusy] = useState(false);

  const handleEmergencyStop = async () => {
    if (emergencyStopBusy) return;
    const ok = window.confirm(
      `🚨 全マシン緊急停止を実行しますか?\n\n` +
      `この操作は:\n` +
      `・自社の全 online デバイスに停止コマンドを送信\n` +
      `・全画面が「準備中」表示 (真っ黒画面ではない)\n` +
      `・取り消しは「全マシン一斉切替」で個別動画を再送信\n\n` +
      `⚠️ 緊急時のみ使用してください`
    );
    if (!ok) return;
    setEmergencyStopBusy(true);
    try {
      const res = await api.post<{ status: string; target_count: number; sent_count: number }>(
        '/devices/emergency_stop',
        {}
      );
      window.alert(
        `✅ 緊急停止完了\n\n対象: ${res.target_count}台\n送信: ${res.sent_count}台`
      );
    } catch (e: any) {
      window.alert(`❌ 失敗: ${e?.message ?? '不明なエラー'}`);
    } finally {
      setEmergencyStopBusy(false);
    }
  };
  const [scope, setScope] = useState<LiveControlScope | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const effectiveDevices = useMemo(
    () => applyOverridesToDevices(devices, overrides),
    [devices, overrides],
  );

  // KPIs
  const onlineCount = effectiveDevices.filter((d) => d.status === 'online').length;
  const manualCount = effectiveDevices.filter((d) => d.play_mode === 'manual').length;
  const planCount = effectiveDevices.filter((d) => d.play_mode === 'plan').length;
  const idleCount = effectiveDevices.filter((d) => d.play_mode === 'idle').length;

  // What's currently playing across the fleet (count by program)
  const playingNow = useMemo(() => {
    const m = new Map<string, { name: string; count: number; manual: number }>();
    for (const d of effectiveDevices) {
      if (!d.current_program_id || !d.current_program_name) continue;
      const e = m.get(d.current_program_id) ?? { name: d.current_program_name, count: 0, manual: 0 };
      e.count += 1;
      if (d.play_mode === 'manual') e.manual += 1;
      m.set(d.current_program_id, e);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [effectiveDevices]);

  const storesFiltered = useMemo(() => {
    if (!storeSearch) return stores;
    const s = storeSearch.toLowerCase();
    return stores.filter((x) => x.name.toLowerCase().includes(s) || x.prefecture.includes(s));
  }, [storeSearch]);

  const groupsFiltered = useMemo(() => {
    if (!groupSearch) return deviceGroups;
    const s = groupSearch.toLowerCase();
    return deviceGroups.filter((x) => x.name.toLowerCase().includes(s));
  }, [groupSearch]);

  const openWithScope = (s: LiveControlScope) => {
    setScope(s);
    setSheetOpen(true);
  };

  if (loading) {
    return (
      <AppShell title="ライブ操作" breadcrumb={['ホーム', 'ライブ操作']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="ライブ操作" breadcrumb={['ホーム', 'ライブ操作']}>
      {/* Hero stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard icon={<Wifi className="h-4 w-4" />} label="稼働中" value={onlineCount} accent="ok" sub={`/ 全${effectiveDevices.length}台`} />
        <KpiCard icon={<Zap className="h-4 w-4" />} label="手動切替中" value={manualCount} accent="warn" sub={manualCount > 0 ? '計画モードへ復帰可能' : '0台'} />
        <KpiCard icon={<Activity className="h-4 w-4" />} label="計画モード" value={planCount} sub="時間割で自動再生" />
        <KpiCard icon={<PlayCircle className="h-4 w-4" />} label="待機/停止" value={idleCount} sub="再生中映像なし" />
      </div>

      {/* Quick actions: scope picker */}
      <Card className="mb-6 border-primary/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />クイック操作
          </CardTitle>
          <p className="text-xs text-muted-foreground">よく使う操作を1クリックで</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <QuickAction
            icon={<Globe2 className="h-5 w-5" />}
            title="全マシン一斉切替"
            description={`オンラインの ${onlineCount} 台に同時送信`}
            onClick={() => openWithScope({
              device_ids: effectiveDevices.filter((d) => d.status === 'online').map((d) => d.id),
              label: `全マシン一斉送信 (オンライン ${onlineCount}台)`,
            })}
            disabled={onlineCount === 0}
          />
          <QuickAction
            icon={<Undo2 className="h-5 w-5" />}
            title="全端末を計画モードへ"
            description={manualCount > 0 ? `${manualCount} 台の手動切替を解除` : '手動切替中の端末はありません'}
            onClick={() => {
              const ids = effectiveDevices
                .filter((d) => d.play_mode === 'manual')
                .map((d) => d.id);
              if (ids.length > 0) {
                restorePlan({
                  device_ids: ids,
                  scope_label: `全手動切替を解除 (${ids.length}台)`,
                  applied_by: 'admin@gachaops.example',
                });
              }
            }}
            disabled={manualCount === 0}
            accent="muted"
          />
          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start gap-2 text-left"
            asChild
          >
            <Link href="/devices">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                <span className="font-medium">端末一覧から個別選択</span>
              </div>
              <span className="text-xs text-muted-foreground font-normal">複数台ピックアップして切替</span>
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Tier 2-E: 緊急操作カード (全マシン即停止) */}
      <Card className="mt-4 border-red-500/40 bg-red-500/5">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />緊急操作
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            想定外の事態に全マシンを即停止 (画面は「準備中」表示)
          </p>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            size="lg"
            className="w-full gap-2"
            onClick={handleEmergencyStop}
            disabled={emergencyStopBusy}
          >
            {emergencyStopBusy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <PowerOff className="h-5 w-5" />
            )}
            {emergencyStopBusy ? '停止中...' : '🚨 全マシン緊急停止'}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Scope picker tabs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">対象を選んで切替</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="stores">
                <TabsList className="grid grid-cols-2 w-full sm:w-auto">
                  <TabsTrigger value="stores" className="gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />店舗単位
                  </TabsTrigger>
                  <TabsTrigger value="groups" className="gap-1.5">
                    <Layers3 className="h-3.5 w-3.5" />グループ単位
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="stores" className="mt-4 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="店舗名 / 都道府県..."
                      value={storeSearch}
                      onChange={(e) => setStoreSearch(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[440px] overflow-y-auto pr-1">
                    {storesFiltered.map((s) => {
                      const sdev = effectiveDevices.filter((d) => d.store_id === s.id);
                      const online = sdev.filter((d) => d.status === 'online');
                      const manual = sdev.filter((d) => d.play_mode === 'manual').length;
                      return (
                        <button
                          key={s.id}
                          disabled={online.length === 0}
                          onClick={() =>
                            openWithScope({
                              device_ids: online.map((d) => d.id),
                              label: `${s.name} (${online.length}台)`,
                            })
                          }
                          className="text-left rounded-md border bg-card p-3 transition-all hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent group"
                        >
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium truncate">{s.name}</span>
                            </div>
                            <Zap className="h-3.5 w-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="text-[11px] text-muted-foreground ml-5">{s.prefecture}</div>
                          <div className="flex gap-2 mt-2 ml-5">
                            <Badge variant="ok" className="text-[10px]">オン {online.length}</Badge>
                            {sdev.length - online.length > 0 && (
                              <Badge variant="muted" className="text-[10px]">他 {sdev.length - online.length}</Badge>
                            )}
                            {manual > 0 && (
                              <Badge variant="warn" className="text-[10px] gap-1">
                                <Zap className="h-2.5 w-2.5" />手動 {manual}
                              </Badge>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="groups" className="mt-4 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="グループ名..."
                      value={groupSearch}
                      onChange={(e) => setGroupSearch(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[440px] overflow-y-auto pr-1">
                    {groupsFiltered.map((g) => {
                      // For mock: assume all online devices in stores under this group's prefecture
                      // belong to it. For demo: just take half of online devices.
                      const groupDeviceIds =
                        g.id === 'grp_kanto'
                          ? effectiveDevices.filter(
                              (d) => d.status === 'online' && stores.find((s) => s.id === d.store_id && ['東京都', '神奈川県'].includes(s.prefecture)),
                            ).map((d) => d.id)
                          : g.id === 'grp_kansai'
                            ? effectiveDevices.filter(
                                (d) => d.status === 'online' && stores.find((s) => s.id === d.store_id && s.prefecture === '大阪府'),
                              ).map((d) => d.id)
                            : g.id === 'grp_chubu'
                              ? effectiveDevices.filter(
                                  (d) => d.status === 'online' && stores.find((s) => s.id === d.store_id && s.prefecture === '愛知県'),
                                ).map((d) => d.id)
                              : g.id === 'grp_kyushu'
                                ? effectiveDevices.filter(
                                    (d) => d.status === 'online' && stores.find((s) => s.id === d.store_id && s.prefecture === '福岡県'),
                                  ).map((d) => d.id)
                                : g.id === 'grp_shibuya_window'
                                  ? effectiveDevices.filter((d) => d.status === 'online' && d.store_id === 'str_shibuya_001').slice(0, 4).map((d) => d.id)
                                  : [];

                      return (
                        <button
                          key={g.id}
                          disabled={groupDeviceIds.length === 0}
                          onClick={() =>
                            openWithScope({
                              device_ids: groupDeviceIds,
                              label: `${g.name} (${groupDeviceIds.length}台${g.linked ? ' 連動' : ''})`,
                            })
                          }
                          className="text-left rounded-md border bg-card p-3 transition-all hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent group"
                        >
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <Layers3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium truncate">{g.name}</span>
                            </div>
                            <Zap className="h-3.5 w-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="flex gap-2 mt-2 ml-5">
                            <Badge variant="ok" className="text-[10px]">オン {groupDeviceIds.length}</Badge>
                            {g.linked && <Badge variant="default" className="text-[10px]">連動再生</Badge>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Now playing across fleet */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <PlayCircle className="h-3.5 w-3.5" />端末で再生中の映像
              </CardTitle>
              <p className="text-xs text-muted-foreground">同じ映像を再生している端末をまとめて把握</p>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {playingNow.length === 0 && (
                  <li className="p-4 text-center text-xs text-muted-foreground">
                    現在、再生中の端末はありません
                  </li>
                )}
                {playingNow.map(([programId, info]) => (
                  <li key={programId} className="flex items-center gap-3 p-3">
                    <div className="h-8 w-8 rounded bg-primary/15 flex items-center justify-center shrink-0">
                      <PlayCircle className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{info.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{programId}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">{info.count}<span className="text-xs text-muted-foreground">台</span></div>
                      {info.manual > 0 && (
                        <div className="text-[10px] text-warn flex items-center gap-1 justify-end">
                          <Zap className="h-2.5 w-2.5" />手動 {info.manual}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Active manual overrides */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-warn" />手動切替中の端末
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y max-h-[280px] overflow-y-auto">
                {Object.values(overrides).length === 0 && (
                  <li className="p-4 text-center text-xs text-muted-foreground">
                    現在、手動切替中の端末はありません
                  </li>
                )}
                {Object.values(overrides)
                  .sort((a, b) => b.applied_at.localeCompare(a.applied_at))
                  .map((o) => {
                    const d = devices.find((x) => x.id === o.device_id);
                    if (!d) return null;
                    return (
                      <li key={o.device_id} className="p-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <Link href={`/devices/${d.id}`} className="text-sm font-medium hover:underline">
                              {d.name}
                            </Link>
                            <div className="text-[10.5px] text-muted-foreground truncate mt-0.5">
                              {o.program_name}
                            </div>
                            <div className="flex flex-wrap gap-x-2 mt-1 text-[10px] text-muted-foreground">
                              <span>{fmtRelative(o.applied_at)}に切替</span>
                              {o.expires_at && (
                                <span className="flex items-center gap-1 text-warn">
                                  <Clock className="h-2.5 w-2.5" />
                                  {fmtRelative(o.expires_at)}に解除
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] gap-1 shrink-0"
                            onClick={() =>
                              restorePlan({
                                device_ids: [o.device_id],
                                scope_label: d.name,
                                applied_by: 'admin@gachaops.example',
                              })
                            }
                          >
                            <Undo2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </CardContent>
          </Card>

          {/* Recent action log */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" />操作履歴
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y max-h-[320px] overflow-y-auto">
                {history.length === 0 && (
                  <li className="p-4 text-center text-xs text-muted-foreground">
                    まだ操作履歴がありません
                  </li>
                )}
                {history.map((h) => (
                  <li key={h.id} className="p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <div
                        className={`h-6 w-6 rounded shrink-0 flex items-center justify-center ${
                          h.action === 'switch'
                            ? 'bg-primary/15 text-primary'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {h.action === 'switch' ? <Zap className="h-3 w-3" /> : <Undo2 className="h-3 w-3" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs">
                          {h.action === 'switch' ? (
                            <>
                              <span className="font-medium">{h.scope_label}</span>
                              <span className="text-muted-foreground"> に </span>
                              <span className="font-medium">{h.program_name}</span>
                              <span className="text-muted-foreground"> を配信</span>
                            </>
                          ) : (
                            <>
                              <span className="font-medium">{h.scope_label}</span>
                              <span className="text-muted-foreground"> を計画モードへ復帰</span>
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-2 mt-1 text-[10px] text-muted-foreground">
                          <span>{fmtRelative(h.ts)}</span>
                          <span>{h.applied_by}</span>
                          {h.expires_at && (
                            <span className="text-warn">期限あり</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <LiveControlSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        scope={scope}
      />
    </AppShell>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  accent?: 'ok' | 'warn' | 'primary';
}) {
  const c = accent === 'ok' ? 'text-ok' : accent === 'warn' ? 'text-warn' : accent === 'primary' ? 'text-primary' : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className={`text-2xl font-semibold tabular-nums ${c}`}>{value}</div>
        <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
      </CardContent>
    </Card>
  );
}

function QuickAction({
  icon,
  title,
  description,
  onClick,
  disabled,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: 'muted';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-md border p-4 transition-all flex flex-col gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        accent === 'muted'
          ? 'bg-card hover:bg-accent'
          : 'bg-primary/10 border-primary/30 hover:bg-primary/15'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={accent === 'muted' ? 'text-muted-foreground' : 'text-primary'}>{icon}</span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
