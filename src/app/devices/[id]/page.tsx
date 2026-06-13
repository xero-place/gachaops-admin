'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePlaybackStream } from '@/hooks/use-playback-stream';
import { PlaybackStatus } from '@/components/domain/playback-status';
import { notFound, useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { tokenStore } from '@/lib/token-store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DrawOrderMappingEditor } from '@/components/domain/draw-order-mapping-editor';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DeviceStatusBadge, PlayModeBadge, TaskStatusBadge } from '@/components/domain/status-badges';
import { LiveControlSheet } from '@/components/domain/live-control-sheet';
import { useLiveStore, applyOverridesToDevice } from '@/stores/live-control-store';
import { fmtDate, fmtRelative, WEEKDAYS_JA } from '@/lib/format';
import { api, ApiError } from '@/lib/api';
import type { GachaMachine, GachaPool, GachaEffectPack } from '@/types/domain';
import {
  ArrowLeft,
  Camera,
  Power,
  RefreshCcw,
  Volume2,
  Sun,
  Network,
  Smartphone,
  Cpu,
  PlayCircle,
  Zap,
  Undo2,
  Clock,
  Loader2,
  Sparkles,
} from 'lucide-react';

import type { TaskStatus as _TS } from '@/types/domain';

type RecentTaskRun = {
  task_id: string;
  task_name: string;
  status: _TS;
  started_at: string;
};

type DeviceDetail = {
  id: string;
  customer_id: string;
  store_id: string;
  store_name?: string;
  name: string;
  serial: string;
  play_mode: 'plan' | 'manual' | 'idle';
  status: 'online' | 'offline' | 'maintenance';
  last_heartbeat_at: string | null;
  current_program_id: string | null;
  current_program_name?: string | null;
  current_program_size_bytes?: number | null;
  storage_used_percent?: number | null;
  app_version?: string | null;
  android_version?: string | null;
  ip_address?: string | null;
  volume: number;
  brightness: number;
  group_ids: string[];
  qr_enabled?: boolean;
  effect_enabled?: boolean | null;
  manual_override_expires_at?: string | null;
  recent_task_runs?: RecentTaskRun[];
  recent_screenshots?: Array<{ url: string; taken_at?: string; captured_at?: string; thumbnail_url?: string }>;
  power_schedule?: Array<{ weekday: number; on_at: string; off_at: string }>;
  power_schedules?: Array<{ id?: string; weekday: number; on_at?: string; off_at?: string; on_time?: string; off_time?: string; power_on_time?: string; power_off_time?: string; enabled?: boolean }>;
  manual_override_program_id?: string | null;
  manual_override_program_name?: string | null;
  cpu_usage_percent?: number | null;
  memory_usage_percent?: number | null;
  uptime_seconds?: number | null;
  signal_strength?: number | null;
  network_type?: string | null;
  device_model?: string | null;
  resolution?: string | null;
  orientation?: string | null;
  brand?: string | null;
  created_at?: string;
  updated_at?: string;
};

export default function DeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const [baseDetail, setBaseDetail] = useState<DeviceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const overrides = useLiveStore((s) => s.overrides);
  const restorePlan = useLiveStore((s) => s.restorePlan);
  const [tab, setTab] = useState('overview');
  // Tier 1-I: Force-refresh state
  const [refreshing, setRefreshing] = useState(false);
  // リモート設定: 音量・輝度の送信中フラグ
  const [savingVolume, setSavingVolume] = useState(false);
  const [savingBrightness, setSavingBrightness] = useState(false);

  const sendDeviceCommand = async (type: 'set_volume' | 'set_brightness', value: number) => {
    const payload = type === 'set_volume' ? { volume: value } : { brightness: value };
    const setSaving = type === 'set_volume' ? setSavingVolume : setSavingBrightness;
    setSaving(true);
    try {
      await api.post(`/devices/${params.id}/commands`, { type, payload });
      setBaseDetail((prev) =>
        prev ? { ...prev, ...(type === 'set_volume' ? { volume: value } : { brightness: value }) } : prev
      );
    } catch (e) {
      alert(e instanceof ApiError ? (e.problem.detail || e.problem.title) : '送信に失敗しました');
    } finally {
      setSaving(false);
    }
  };
  const { states: playbackStates } = usePlaybackStream();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.get<DeviceDetail>(`/devices/${params.id}`);
        if (cancelled) return;
        setBaseDetail(d);
      } catch (e) {
        console.error('[devices/[id]] fetch failed:', e);
        if (!cancelled) setFetchFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params.id]);

  // Tier 1-I: Force-refresh handler (remote power-cycle equivalent)
  const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';
  const [savingQr, setSavingQr] = useState(false);
  const [savingEffect, setSavingEffect] = useState(false);

  const handleQrToggle = async (next: boolean) => {
    setSavingQr(true);
    try {
      await api.patch(`/devices/${params.id}/qr_enabled`, { qr_enabled: next });
      setBaseDetail((prev) => (prev ? { ...prev, qr_enabled: next } : prev));
    } catch (e) {
      alert(e instanceof ApiError ? (e.problem.detail || e.problem.title) : '保存に失敗しました');
    } finally {
      setSavingQr(false);
    }
  };

  const handleEffectChange = async (val: string) => {
    const effect_enabled = val === 'on' ? true : val === 'off' ? false : null;
    setSavingEffect(true);
    try {
      await api.patch(`/devices/${params.id}/effect_enabled`, { effect_enabled });
      setBaseDetail((prev) => (prev ? { ...prev, effect_enabled } : prev));
    } catch (e) {
      alert(e instanceof ApiError ? (e.problem.detail || e.problem.title) : '保存に失敗しました');
    } finally {
      setSavingEffect(false);
    }
  };

  const handleForceRefresh = async () => {
    if (refreshing) return;
    const ok = window.confirm(
      `⚠️ ${detail.name} を強制リフレッシュしますか?\n\n` +
      `この操作は:\n` +
      `1. デバイスに停止コマンドを送信\n` +
      `2. 1.5 秒待機\n` +
      `3. 最後の動画を再送信 (5秒先で再生)\n\n` +
      `(電源 OFF/ON と同等の効果)`
    );
    if (!ok) return;
    setRefreshing(true);
    try {
      const res = await api.post<{ status: string; asset_url?: string }>(
        `/devices/${detail.id}/force_refresh`,
        {}
      );
      if (res.status === 'refreshed') {
        window.alert(`✅ 強制リフレッシュ完了\n動画を再送信しました`);
      } else if (res.status === 'stopped_only') {
        window.alert(`⚠️ 停止のみ実行\n(前回の動画情報なし)`);
      } else {
        window.alert(`✅ 送信完了\nstatus: ${res.status}`);
      }
    } catch (e) {
      window.alert(`❌ 失敗: ${e instanceof Error ? e.message : '不明なエラー'}`);
    } finally {
      setRefreshing(false);
    }
  };

  const [restarting, setRestarting] = useState(false);
  const handleRestartApp = async () => {
    if (restarting) return;
    const ok = window.confirm(
      `🔄 ${detail.name} のアプリを再起動しますか?\n\n` +
      `この操作は:\n` +
      `・端末の signage アプリだけを再起動\n` +
      `・WebSocket 接続を貼り直す\n` +
      `・プロビジョニング情報は保持（再セットアップ不要）\n\n` +
      `配信や OTA が効かなくなった端末の復旧に使います。`
    );
    if (!ok) return;
    setRestarting(true);
    try {
      const res = await api.post<{ accepted?: boolean; command_id?: string }>(
        `/devices/${detail.id}/restart_app`,
        {}
      );
      if (res.accepted) {
        window.alert(`✅ 再起動コマンドを送信しました\n端末が WS を貼り直します（数十秒）`);
      } else {
        window.alert(`✅ 送信完了`);
      }
    } catch (e) {
      window.alert(`❌ 失敗: ${e instanceof Error ? e.message : '不明なエラー'}`);
    } finally {
      setRestarting(false);
    }
  };

  // ── Session 51: 所属プール (gacha_machine.pool_id) ──
  const [machine, setMachine] = useState<GachaMachine | null>(null);
  const [machineMissing, setMachineMissing] = useState(false);
  // ── S124: 在庫（GachaMachine 在庫A）──
  const [stockTotal, setStockTotal] = useState('');
  const [stockRemaining, setStockRemaining] = useState('');
  const [stockThreshold, setStockThreshold] = useState('');
  const [stockSaving, setStockSaving] = useState(false);
  const [stockMsg, setStockMsg] = useState<string | null>(null);
  // ── S124 フェーズ2: 演出・価格（専用プール設定）──
  const [effectPacks, setEffectPacks] = useState<GachaEffectPack[]>([]);
  const [curPool, setCurPool] = useState<GachaPool | null>(null);
  const [setPrice, setSetPrice] = useState('');
  const [setPayQr, setSetPayQr] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  // 投入受付モード（現金=円計上 / メダル=枚数記録）。支払い方法の現金と連動。
  const [acceptMode, setAcceptMode] = useState<'cash' | 'token' | 'none'>('cash');

  const reloadMachine = useCallback(async () => {
    try {
      const m = await api.get<GachaMachine>(
        `/gacha/devices/${params.id}/machine`,
      );
      setMachine(m);
      setStockTotal(String(m.total_balls ?? ''));
      setStockRemaining(String(m.remaining_balls ?? ''));
      setStockThreshold(String(m.low_stock_threshold ?? ''));
      // 専用プール（演出・価格）を読み、フォーム初期値に反映
      if (m.pool_id) {
        try {
          const pl = await api.get<GachaPool>(`/gacha/pools/${m.pool_id}`);
          setCurPool(pl);
          setSetPrice(String(pl.price_per_draw ?? ''));
          const pm = pl.accepted_payment_methods ?? [];
          setSetPayQr(pm.includes('qr'));
        } catch {
          // pool 取得失敗時は無視（フォームは空のまま）
        }
      }
      // 投入受付モードを coin-settings から初期化（type_no=1 が token ならメダル）
      try {
        const cs = await api.get<{ type_no: number; kind: string; is_active?: boolean }[]>(
          `/devices/${params.id}/coin-settings`,
        );
        const active = cs.filter((r) => r.is_active !== false);
        if (active.length === 0) {
          setAcceptMode('none');
        } else {
          const t1 = active.find((r) => r.type_no === 1);
          setAcceptMode(t1 && t1.kind === 'token' ? 'token' : 'cash');
        }
      } catch { /* 取得失敗時は現金モード既定 */ }
      setMachineMissing(false);
    } catch (e) {
      // 什器 (gacha_machine) 未登録の端末は 404。その旨を表示する。
      if (e instanceof ApiError && e.status === 404) {
        setMachineMissing(true);
      }
    }
  }, [params.id]);

  useEffect(() => {
    void reloadMachine();
  }, [reloadMachine]);

  useEffect(() => {
    void (async () => {
      try {
        const eps = await api.get<GachaEffectPack[]>('/gacha/effect-packs');
        setEffectPacks(eps.filter((e) => e.is_active));
      } catch { /* 演出パック取得失敗は無視 */ }
    })();
  }, []);

  const saveStock = async (override?: { remaining?: number }) => {
    setStockSaving(true);
    setStockMsg(null);
    try {
      const body: Record<string, number> = {};
      const t = parseInt(stockTotal, 10);
      const r = override?.remaining ?? parseInt(stockRemaining, 10);
      const th = parseInt(stockThreshold, 10);
      if (!Number.isNaN(t)) body.total_balls = t;
      if (!Number.isNaN(r)) body.remaining_balls = r;
      if (!Number.isNaN(th)) body.low_stock_threshold = th;
      await api.put<GachaMachine>(
        `/gacha/devices/${params.id}/machine/stock`,
        body,
      );
      await reloadMachine();
      setStockMsg('在庫を更新しました。');
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.problem.detail || e.problem.title
          : (e as Error).message;
      setStockMsg(`更新に失敗しました: ${msg}`);
    } finally {
      setStockSaving(false);
    }
  };

  // 専用設定を作成（ensure）: pool未割当/共有を専用プールに
  const ensureSettings = async () => {
    setSettingsSaving(true);
    setSettingsMsg(null);
    try {
      await api.post<GachaMachine>(`/gacha/devices/${params.id}/machine/ensure`, {});
      await reloadMachine();
      setSettingsMsg('この端末専用の設定を用意しました。');
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : (e as Error).message;
      setSettingsMsg(`設定の用意に失敗しました: ${msg}`);
    } finally {
      setSettingsSaving(false);
    }
  };

  // 演出・価格の保存（専用プールを settings API で更新）
  const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsMsg(null);
    try {
      const pay: string[] = [];
      if (acceptMode === 'cash') pay.push('coin');
      if (setPayQr) pay.push('qr');
      const body: Record<string, unknown> = {
        accepted_payment_methods: pay,
      };
      // 料金は「現金」受付時のみ反映（メダル/受け付けないは料金不要）
      if (acceptMode === 'cash') {
        const pr = parseInt(setPrice, 10);
        if (!Number.isNaN(pr)) body.price_per_draw = pr;
      }
      // L1デフォルト演出は「演出」タブの DrawOrderMappingEditor (default-effect API) で保存する。
      // ここ（価格タブの保存）では触らない（取りこぼしによる誤クリア防止）。
      await api.put<GachaPool>(`/gacha/devices/${params.id}/machine/settings`, body);
      // 投入受付モードを coin-settings に保存（現金 / メダル / 受け付けない）。
      const items =
        acceptMode === 'cash'
          ? [
              { type_no: 1, kind: 'cash', amount_yen: 100, label: '100円', is_active: true },
              { type_no: 5, kind: 'cash', amount_yen: 500, label: '500円', is_active: true },
            ]
          : acceptMode === 'token'
          ? [
              { type_no: 1, kind: 'token', amount_yen: null, label: 'メダル', is_active: true },
            ]
          : []; // 受け付けない（無料ガチャ / QR専用）
      await api.put(`/devices/${params.id}/coin-settings`, { items });
      await reloadMachine();
      setSettingsMsg('設定を保存しました。');
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : (e as Error).message;
      setSettingsMsg(`保存に失敗しました: ${msg}`);
    } finally {
      setSettingsSaving(false);
    }
  };

  const [sheetOpen, setSheetOpen] = useState(false);

  if (loading) {
    return (
      <AppShell title="端末詳細" breadcrumb={['ホーム', '端末', params.id]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }
  if (fetchFailed || !baseDetail) notFound();
  // Augment with defaults required by Device type
  const detailBase = { ...baseDetail, store_name: baseDetail.store_name ?? '', current_program_name: baseDetail.current_program_name ?? null, current_program_size_bytes: baseDetail.current_program_size_bytes ?? null, storage_used_percent: baseDetail.storage_used_percent ?? null, app_version: baseDetail.app_version ?? null, android_version: baseDetail.android_version ?? null, ip_address: baseDetail.ip_address ?? null, group_ids: baseDetail.group_ids ?? [] };
  const detail = applyOverridesToDevice(detailBase as unknown as Parameters<typeof applyOverridesToDevice>[0], overrides) as unknown as DeviceDetail;
  const override = overrides[detail.id];
  const isManual = detail.play_mode === 'manual';

  return (
    <AppShell title={detail.name} breadcrumb={['ホーム', '端末', detail.id]}>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/devices"><ArrowLeft className="h-3.5 w-3.5 mr-1" />一覧へ戻る</Link>
        </Button>
        <DeviceStatusBadge status={detail.status} />
        <PlayModeBadge mode={detail.play_mode} />
        <div className="ml-auto flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="gap-1.5"
            disabled={detail.status !== 'online'}
            onClick={() => setSheetOpen(true)}
          >
            <Zap className="h-3.5 w-3.5" />映像を切替
          </Button>
          {/* Tier 1-I: 強制リフレッシュボタン (緊急時のリモート電源 OFF/ON 相当) */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
            disabled={refreshing || detail.status !== 'online'}
            onClick={handleForceRefresh}
            title="動画送信後に1台だけ動かない時の緊急操作"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'リフレッシュ中...' : '強制リフレッシュ'}
          </Button>
          {isManual && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                restorePlan({
                  device_ids: [detail.id],
                  scope_label: detail.name,
                  applied_by: 'admin@gachaops.example',
                })
              }
            >
              <Undo2 className="h-3.5 w-3.5" />計画配信に戻す
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" disabled={detail.status !== 'online'}>
            <Camera className="h-3.5 w-3.5" />スクリーンショット
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={detail.status !== 'online' || restarting} onClick={handleRestartApp}>
            <RefreshCcw className="h-3.5 w-3.5" />再起動
          </Button>
          <Button variant="destructive" size="sm" className="gap-1.5" disabled={detail.status !== 'online'}>
            <Power className="h-3.5 w-3.5" />電源OFF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="overview">概要</TabsTrigger>
              <TabsTrigger value="settings">価格</TabsTrigger>
              <TabsTrigger value="effects">演出</TabsTrigger>
              <TabsTrigger value="screenshots">スクリーンショット</TabsTrigger>
              <TabsTrigger value="schedules">電源スケジュール</TabsTrigger>
              <TabsTrigger value="history">APK履歴</TabsTrigger>
                <TabsTrigger value="stock">在庫</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">現在の再生</CardTitle>
                    {isManual && (
                      <Badge variant="warn" className="gap-1">
                        <Zap className="h-3 w-3" />手動切替中
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {detail.current_program_name ? (
                    <div className="flex items-center gap-3">
                      <PlayCircle className="h-10 w-10 text-primary" />
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-medium">{detail.current_program_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{detail.current_program_id}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          コンテンツ容量: <span className="tabular-nums">{formatBytes(detail.current_program_size_bytes)}</span>
                        </div>
                        {playbackStates[detail.id] && (
                          <div className="mt-3 pt-3 border-t">
                            <PlaybackStatus playback={playbackStates[detail.id]} />
                          </div>
                        )}
                        {override && (
                          <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <Zap className="h-3 w-3 text-warn" />
                              {fmtRelative(override.applied_at)}に手動切替 ({override.applied_by})
                            </div>
                            {override.expires_at && (
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3 w-3 text-warn" />
                                {fmtRelative(override.expires_at)}に計画配信へ自動復帰
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">再生中のプログラムはありません</p>
                  )}
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardHeader><CardTitle className="text-sm">リモート設定</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <RemoteSliderRow
                    icon={<Volume2 className="h-4 w-4" />}
                    label="音量"
                    value={detail.volume}
                    saving={savingVolume}
                    onCommit={(v) => void sendDeviceCommand('set_volume', v)}
                  />
                  <RemoteSliderRow
                    icon={<Sun className="h-4 w-4" />}
                    label="輝度"
                    value={detail.brightness}
                    saving={savingBrightness}
                    onCommit={(v) => void sendDeviceCommand('set_brightness', v)}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="screenshots">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">最近のスクリーンショット</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(detail.recent_screenshots ?? []).map((s, i) => (
                      <div key={i} className="rounded-md border overflow-hidden">
                        <div className="aspect-[9/16] bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={s.url} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="p-2 text-[11px] text-muted-foreground">
                          {fmtRelative(s.captured_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="schedules">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">電源タイマー</CardTitle>
                    <Button variant="outline" size="sm" className="h-7 text-xs">編集</Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>曜日</TableHead>
                        <TableHead>起動</TableHead>
                        <TableHead>停止</TableHead>
                        <TableHead>状態</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detail.power_schedules ?? []).map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm font-medium">{WEEKDAYS_JA[s.weekday]}曜日</TableCell>
                          <TableCell className="font-mono text-sm">{s.power_on_time}</TableCell>
                          <TableCell className="font-mono text-sm">{s.power_off_time}</TableCell>
                          <TableCell>
                            {s.enabled ? <Badge variant="ok">有効</Badge> : <Badge variant="muted">無効</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardHeader><CardTitle className="text-sm">APK配信履歴</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>タスク</TableHead>
                        <TableHead>状態</TableHead>
                        <TableHead>開始</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detail.recent_task_runs ?? []).map((r) => (
                        <TableRow key={r.task_id}>
                          <TableCell>
                            <Link href={`/tasks/${r.task_id}`} className="text-sm hover:underline">{r.task_name}</Link>
                            <div className="text-[10.5px] font-mono text-muted-foreground">{r.task_id}</div>
                          </TableCell>
                          <TableCell><TaskStatusBadge status={r.status} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtRelative(r.started_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="settings">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">料金・支払い</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {machineMissing ? (
                    <p className="text-sm text-muted-foreground">
                      この端末はまだ設定ができません（什器が未登録です）。
                    </p>
                  ) : !curPool ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        この端末専用の設定がまだありません。下のボタンで用意してください。
                      </p>
                      <Button size="sm" disabled={settingsSaving} onClick={ensureSettings}>
                        {settingsSaving ? '準備中...' : 'この端末専用の設定を用意する'}
                      </Button>
                      {settingsMsg && <p className="text-xs text-muted-foreground">{settingsMsg}</p>}
                    </div>
                  ) : (
                    <>
                      {/* 投入の受付方法（現金 / メダル / 受け付けない） */}
                      <div className="space-y-2">
                        <div className="text-sm font-medium">投入の受付方法</div>
                        <p className="text-xs text-muted-foreground">
                          この什器に投入されたものをどう扱うかを設定します。1台につき一つです。
                        </p>
                        <label className={`flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer transition-colors ${acceptMode === 'cash' ? 'border-primary bg-primary/5' : 'border-slate-300 dark:border-slate-700'}`}>
                          <input type="radio" name="accept-mode" className="mt-0.5"
                            checked={acceptMode === 'cash'}
                            onChange={() => setAcceptMode('cash')} />
                          <span>
                            <span className="block font-medium">現金</span>
                            <span className="block text-xs text-muted-foreground">
                              100円玉・500円玉を売上（円）として計上します。
                            </span>
                          </span>
                        </label>

                        {/* 1回の料金（現金のときだけ表示） */}
                        {acceptMode === 'cash' && (
                          <div className="ml-6 space-y-1">
                            <label htmlFor="set-price" className="text-sm font-medium">1回の料金</label>
                            <div className="flex items-center gap-2">
                              <input id="set-price" type="number" inputMode="numeric"
                                className="w-32 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                                value={setPrice} onChange={(e) => setSetPrice(e.target.value)} />
                              <span className="text-sm text-muted-foreground">円（ハンドル1回ぶん）</span>
                            </div>
                          </div>
                        )}

                        <label className={`flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer transition-colors ${acceptMode === 'token' ? 'border-primary bg-primary/5' : 'border-slate-300 dark:border-slate-700'}`}>
                          <input type="radio" name="accept-mode" className="mt-0.5"
                            checked={acceptMode === 'token'}
                            onChange={() => setAcceptMode('token')} />
                          <span>
                            <span className="block font-medium">メダル</span>
                            <span className="block text-xs text-muted-foreground">
                              トークンメダルを枚数として記録します（売上には含めません）。
                            </span>
                          </span>
                        </label>
                        <label className={`flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer transition-colors ${acceptMode === 'none' ? 'border-primary bg-primary/5' : 'border-slate-300 dark:border-slate-700'}`}>
                          <input type="radio" name="accept-mode" className="mt-0.5"
                            checked={acceptMode === 'none'}
                            onChange={() => setAcceptMode('none')} />
                          <span>
                            <span className="block font-medium">受け付けない</span>
                            <span className="block text-xs text-muted-foreground">
                              無料ガチャ、またはQR決済のみで運用します。
                            </span>
                          </span>
                        </label>
                      </div>

                      {/* QRコード決済（運営専用・即時反映。投入とは独立） */}
                      {isSuperAdmin && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium">QRコード決済</div>
                          {savingQr && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        </div>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={detail.qr_enabled ?? false} disabled={savingQr}
                            onChange={(e) => void handleQrToggle(e.target.checked)} />
                          QRコード決済を受け付ける
                        </label>
                        <p className="text-xs text-muted-foreground">ONにするとモニターにQRを表示します（チェックで即時反映・契約先には表示されません）</p>
                      </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button size="sm" disabled={settingsSaving} onClick={saveSettings}>
                          {settingsSaving ? '保存中...' : '保存する'}
                        </Button>
                        {settingsMsg && <p className="text-xs text-muted-foreground">{settingsMsg}</p>}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="effects">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">この端末の演出</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-4">
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">演出再生</div>
                        <div className="text-xs text-muted-foreground">現金投入時の当選演出。OFFでも番組は継続し売上は記録されます</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {savingEffect && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      <Select
                        value={detail.effect_enabled === true ? 'on' : detail.effect_enabled === false ? 'off' : 'default'}
                        onValueChange={handleEffectChange}
                        disabled={savingEffect}
                      >
                        <SelectTrigger className="h-9 w-44 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="on">演出する</SelectItem>
                          <SelectItem value="off">演出しない</SelectItem>
                          <SelectItem value="default">グループ既定に従う</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {machineMissing ? (
                    <p className="text-sm text-muted-foreground">
                      この端末はまだ設定ができません（什器が未登録です）。
                    </p>
                  ) : !machine?.pool_id ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        この端末専用の設定がまだありません。下のボタンで用意してください。
                      </p>
                      <Button size="sm" disabled={settingsSaving} onClick={ensureSettings}>
                        {settingsSaving ? '準備中...' : 'この端末専用の設定を用意する'}
                      </Button>
                      {settingsMsg && <p className="text-xs text-muted-foreground">{settingsMsg}</p>}
                    </div>
                  ) : (
                    <DrawOrderMappingEditor
                      poolId={machine.pool_id}
                      packs={effectPacks}
                      defaultEffectPackId={curPool?.default_effect_pack_id ?? null}
                      onDefaultEffectChange={(pl) => setCurPool(pl)}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stock">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">在庫（景品カプセル）</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {machineMissing ? (
                    <p className="text-sm text-muted-foreground">
                      この端末はまだ在庫設定ができません（什器が未登録です）。
                    </p>
                  ) : !machine ? (
                    <p className="text-sm text-muted-foreground">読み込み中...</p>
                  ) : (
                    <>
                      {/* 現在の在庫 */}
                      <div className="text-center py-2">
                        <div className="text-4xl font-bold tabular-nums">
                          <span className={
                            machine.remaining_balls <= 0
                              ? 'text-destructive'
                              : machine.remaining_balls <= machine.low_stock_threshold
                              ? 'text-warn'
                              : 'text-emerald-500'
                          }>{machine.remaining_balls}</span>
                          <span className="text-xl text-muted-foreground"> / {machine.total_balls} 個</span>
                        </div>
                        <div className="mt-3 h-3 w-full max-w-md mx-auto rounded-full bg-muted overflow-hidden">
                          <div
                            className={
                              machine.remaining_balls <= machine.low_stock_threshold
                                ? 'h-full bg-destructive'
                                : 'h-full bg-emerald-500'
                            }
                            style={{
                              width: `${machine.total_balls > 0
                                ? Math.min(100, Math.round((machine.remaining_balls / machine.total_balls) * 100))
                                : 0}%`,
                            }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          ※ ハンドルが回るたびに自動で1つ減ります
                        </p>
                        {machine.remaining_balls <= 0 && (
                          <Badge variant="destructive" className="mt-2">売り切れ</Badge>
                        )}
                      </div>

                      {/* 在庫を設定・補充 */}
                      <div className="border-t pt-4 space-y-3">
                        <div className="text-sm font-medium">在庫を設定・補充</div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-1">
                            <label htmlFor="st-total" className="text-xs text-muted-foreground">満タン時の個数</label>
                            <input id="st-total" type="number" inputMode="numeric"
                              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                              value={stockTotal} onChange={(e) => setStockTotal(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label htmlFor="st-remain" className="text-xs text-muted-foreground">現在の個数</label>
                            <input id="st-remain" type="number" inputMode="numeric"
                              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                              value={stockRemaining} onChange={(e) => setStockRemaining(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label htmlFor="st-thr" className="text-xs text-muted-foreground">低在庫の警告ライン</label>
                            <input id="st-thr" type="number" inputMode="numeric"
                              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                              value={stockThreshold} onChange={(e) => setStockThreshold(e.target.value)} />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" disabled={stockSaving}
                            onClick={() => {
                              const t = parseInt(stockTotal, 10);
                              if (!Number.isNaN(t)) {
                                setStockRemaining(String(t));
                                saveStock({ remaining: t });
                              }
                            }}>
                            満タンにする
                          </Button>
                          <Button size="sm" disabled={stockSaving} onClick={() => saveStock()}>
                            {stockSaving ? '保存中...' : '保存する'}
                          </Button>
                        </div>
                        {stockMsg && (
                          <p className="text-xs text-muted-foreground">{stockMsg}</p>
                        )}
                        {machine.last_refilled_at && (
                          <p className="text-xs text-muted-foreground">
                            最終補充: {fmtDate(machine.last_refilled_at)}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>


          </Tabs>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">基本情報</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-xs">
              <KV label="ID" value={detail.id} mono />
              <KV label="シリアル" value={detail.serial} mono />
              <KV label="店舗" value={detail.store_name ?? ""} />
              <KV label="最終接続" value={fmtRelative(detail.last_heartbeat_at)} />
              <KV label="作成" value={fmtDate(detail.created_at)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">技術情報</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-xs">
              <KV label={<span className="flex items-center gap-1.5"><Smartphone className="h-3 w-3" />アプリ</span>} value={detail.app_version ?? '—'} mono />
              <KV label={<span className="flex items-center gap-1.5"><Cpu className="h-3 w-3" />OS</span>} value={detail.android_version ?? '—'} />
              <KV label={<span className="flex items-center gap-1.5"><Network className="h-3 w-3" />IP</span>} value={detail.ip_address ?? '—'} mono />
            </CardContent>
          </Card>

        </div>
      </div>

      <LiveControlSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        scope={{ device_ids: [detail.id], label: detail.name }}
      />
    </AppShell>
  );
}



function formatBytes(bytes?: number | null): string {
  if (bytes == null || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function RemoteSliderRow({
  icon,
  label,
  value,
  saving,
  onCommit,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  saving: boolean;
  onCommit: (value: number) => void;
}) {
  const [local, setLocal] = useState(value);
  const [dragging, setDragging] = useState(false);

  // 親の値が更新されたら（送信成功後など）、ドラッグ中でなければ追従
  useEffect(() => {
    if (!dragging) setLocal(value);
  }, [value, dragging]);

  const commit = () => {
    setDragging(false);
    if (local !== value) onCommit(local);
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground">{icon}</span>
      <div className="flex-1">
        <div className="flex justify-between text-xs mb-1">
          <span>{label}</span>
          <span className="tabular-nums text-muted-foreground">
            {saving ? '送信中...' : `${local}%`}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={local}
          disabled={saving}
          onChange={(e) => { setDragging(true); setLocal(Number(e.target.value)); }}
          onPointerUp={commit}
          onTouchEnd={commit}
          onMouseUp={commit}
          onKeyUp={commit}
          className="w-full accent-primary cursor-pointer disabled:opacity-50"
        />
      </div>
    </div>
  );
}

function KV({ label, value, mono }: { label: React.ReactNode; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right break-all ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
    </div>
  );
}
