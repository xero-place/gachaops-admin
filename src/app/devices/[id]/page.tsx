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
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { tokenStore } from '@/lib/token-store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import type { GachaMachine, GachaPool } from '@/types/domain';
import {
  ArrowLeft,
  Camera,
  Container,
  Power,
  RefreshCcw,
  Volume2,
  Sun,
  HardDrive,
  Network,
  Smartphone,
  Cpu,
  PlayCircle,
  Zap,
  Undo2,
  Clock,
  Loader2,
  Sparkles,
  QrCode,
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

  // ── Session 51: 所属プール (gacha_machine.pool_id) ──
  const [machine, setMachine] = useState<GachaMachine | null>(null);
  const [machineMissing, setMachineMissing] = useState(false);
  const [pools, setPools] = useState<GachaPool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string>('');
  const [poolSaving, setPoolSaving] = useState(false);
  const [poolMsg, setPoolMsg] = useState<string | null>(null);

  const reloadMachine = useCallback(async () => {
    try {
      const m = await api.get<GachaMachine>(
        `/gacha/devices/${params.id}/machine`,
      );
      setMachine(m);
      setSelectedPoolId(m.pool_id ?? '');
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
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<GachaPool[]>('/gacha/pools');
        if (!cancelled) {
          setPools([...data].sort((a, b) => a.name.localeCompare(b.name, 'ja')));
        }
      } catch {
        // プール一覧取得失敗時は空のまま。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePoolSave = async () => {
    setPoolSaving(true);
    setPoolMsg(null);
    try {
      const next = selectedPoolId || null;
      await api.put<GachaMachine>(
        `/gacha/devices/${params.id}/machine/pool`,
        { pool_id: next },
      );
      await reloadMachine();
      setPoolMsg('所属プールを更新しました。');
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.problem.detail || e.problem.title
          : (e as Error).message;
      setPoolMsg(`更新に失敗しました: ${msg}`);
    } finally {
      setPoolSaving(false);
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
  const detailBase = { ...baseDetail, store_name: baseDetail.store_name ?? '', current_program_name: baseDetail.current_program_name ?? null, storage_used_percent: baseDetail.storage_used_percent ?? null, app_version: baseDetail.app_version ?? null, android_version: baseDetail.android_version ?? null, ip_address: baseDetail.ip_address ?? null, group_ids: baseDetail.group_ids ?? [] };
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
              <Undo2 className="h-3.5 w-3.5" />計画モードに戻す
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" disabled={detail.status !== 'online'}>
            <Camera className="h-3.5 w-3.5" />スクリーンショット
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={detail.status !== 'online'}>
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
              <TabsTrigger value="screenshots">スクリーンショット</TabsTrigger>
              <TabsTrigger value="schedules">電源スケジュール</TabsTrigger>
              <TabsTrigger value="history">タスク履歴</TabsTrigger>
              <TabsTrigger value="coin">投入受付</TabsTrigger>
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
                                {fmtRelative(override.expires_at)}に計画モードへ自動復帰
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

              {isSuperAdmin && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-sm">演出・QR設定</CardTitle>
                  <p className="text-xs text-muted-foreground">運営専用設定（契約先には表示されません）</p>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <QrCode className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">QR注文受付</div>
                        <div className="text-xs text-muted-foreground">この端末でQR決済注文を受け付ける</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {savingQr && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      <Switch checked={detail.qr_enabled ?? false} disabled={savingQr} onCheckedChange={handleQrToggle} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">演出再生</div>
                        <div className="text-xs text-muted-foreground">コイン投入時の当選演出。OFFでも番組は継続し売上は記録されます</div>
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
                </CardContent>
              </Card>
              )}
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
                <CardHeader><CardTitle className="text-sm">最近の配信タスク</CardTitle></CardHeader>
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
            <TabsContent value="coin">
              <CoinSettingsCard deviceId={params.id} />
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Container className="h-3.5 w-3.5" />
                所属プール
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {machineMissing ? (
                <p className="text-muted-foreground">
                  この端末には什器 (gacha_machine) が未登録のため、
                  プールを割り当てできません。
                </p>
              ) : (
                <>
                  <select
                    className="h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-background text-foreground px-3 text-xs"
                    value={selectedPoolId}
                    onChange={(e) => setSelectedPoolId(e.target.value)}
                  >
                    <option value="">プール未所属</option>
                    {pools.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => void handlePoolSave()}
                    disabled={
                      poolSaving ||
                      selectedPoolId === (machine?.pool_id ?? '')
                    }
                  >
                    {poolSaving ? '保存中...' : 'プールを保存'}
                  </Button>
                  {poolMsg && (
                    <p className="text-muted-foreground">{poolMsg}</p>
                  )}
                </>
              )}
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


function CoinSettingsCard({ deviceId }: { deviceId: string }) {
  // 投入受付モード（端末ごと・排他）。物理投入(JY-616)を現金として円計上するか、
  // メダルとして枚数計上するかを切り替える。type_no=1 の kind で現在モードを判定。
  //   現金モード → type_no=1(現金100円) + type_no=5(現金500円)
  //   メダルモード → type_no=1(メダル1枚・円計上なし)
  type Mode = 'cash' | 'token';
  type Row = { type_no: number; kind: string; amount_yen: number | null; label: string; is_active: boolean };

  const [mode, setMode] = useState<Mode>('cash');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<Row[]>(`/devices/${deviceId}/coin-settings`);
        if (!cancelled) {
          const t1 = data.find((r) => r.type_no === 1);
          // type_no=1 が token ならメダルモード、それ以外（cash/未設定）は現金モード
          setMode(t1 && t1.kind === 'token' ? 'token' : 'cash');
        }
      } catch {
        if (!cancelled) setMode('cash');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deviceId]);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const items =
        mode === 'cash'
          ? [
              { type_no: 1, kind: 'cash', amount_yen: 100, label: '100円', is_active: true },
              { type_no: 5, kind: 'cash', amount_yen: 500, label: '500円', is_active: true },
            ]
          : [
              { type_no: 1, kind: 'token', amount_yen: null, label: 'メダル', is_active: true },
            ];
      await api.put<Row[]>(`/devices/${deviceId}/coin-settings`, { items });
      setMsg(mode === 'cash' ? '現金モードで保存しました。' : 'メダルモードで保存しました。');
    } catch (e) {
      const m = e instanceof ApiError ? (e.problem.detail || e.problem.title) : (e as Error).message;
      setMsg(`保存に失敗しました: ${m}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">投入受付設定</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          この什器に投入されたものを「現金」「メダル」のどちらとして扱うかを設定します。
          1台につきどちらか一方です。販売前に切り替えてください。
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${mode === 'cash' ? 'border-primary bg-primary/5' : 'border-slate-300 dark:border-slate-700'}`}>
                <input
                  type="radio"
                  name="accept-mode"
                  className="mt-0.5"
                  checked={mode === 'cash'}
                  onChange={() => setMode('cash')}
                />
                <span>
                  <span className="block text-sm font-medium">現金</span>
                  <span className="block text-xs text-muted-foreground">
                    100円玉・500円玉を売上（円）として計上します。
                  </span>
                </span>
              </label>
              <label className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${mode === 'token' ? 'border-primary bg-primary/5' : 'border-slate-300 dark:border-slate-700'}`}>
                <input
                  type="radio"
                  name="accept-mode"
                  className="mt-0.5"
                  checked={mode === 'token'}
                  onChange={() => setMode('token')}
                />
                <span>
                  <span className="block text-sm font-medium">メダル</span>
                  <span className="block text-xs text-muted-foreground">
                    トークンメダルを枚数として記録します（売上には含めません）。
                  </span>
                </span>
              </label>
            </div>
            <Button size="sm" className="w-full" onClick={() => void handleSave()} disabled={saving}>
              {saving ? '保存中...' : '投入受付設定を保存'}
            </Button>
            {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
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

function SliderRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground">{icon}</span>
      <div className="flex-1">
        <div className="flex justify-between text-xs mb-1">
          <span>{label}</span>
          <span className="tabular-nums text-muted-foreground">{value}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${value}%` }} />
        </div>
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
