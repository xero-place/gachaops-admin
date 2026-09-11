'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLivePlayback } from '@/hooks/use-live-playback';
import { useLivePlaybackStore } from '@/stores/live-playback-store';
import { PlaybackStatus } from '@/components/domain/playback-status';
import { notFound, useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { tokenStore } from '@/lib/token-store';
import { useT } from '@/i18n/useT';
import { usePageT } from '@/i18n/usePageT';
import { deviceDetailDict } from '@/i18n/ns/deviceDetail';
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
import { DeviceStatusBadge, TaskStatusBadge } from '@/components/domain/status-badges';
import { LiveControlSheet } from '@/components/domain/live-control-sheet';
import { useLiveStore, applyOverridesToDevice } from '@/stores/live-control-store';
import { fmtDate, fmtRelative, fmtYen } from '@/lib/format';
import { PowerScheduleEditor } from './PowerScheduleEditor';
import { api, ApiError } from '@/lib/api';
import type { GachaMachine, GachaPool, GachaEffectPack } from '@/types/domain';
import {
  // S201: force-refresh & power-off buttons removed
  ArrowLeft,
  Camera,
  RefreshCcw,
  Volume2,
  Sun,
  // Sun, // S141: 輝度UI非表示につき未使用化
  PlayCircle,
  Zap,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Coins,
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
  current_program_thumbnail_url?: string | null;  // S231: 現在の番組の先頭素材サムネ
  current_program_video_url?: string | null;  // S232: 先頭素材の再生URL
  storage_used_percent?: number | null;
  app_version?: string | null;
  android_version?: string | null;
  ip_address?: string | null;
  volume: number;
  brightness: number;
  display_mode?: string;  // S197
  group_ids: string[];
  qr_enabled?: boolean;
  qr_locale?: string;
  pulse_unit_yen?: number;
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
  const router = useRouter();
  const { t, locale, formatPrice } = useT();
  const tp = usePageT(deviceDetailDict);
  // S144: 端末削除(危険ゾーン)
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [baseDetail, setBaseDetail] = useState<DeviceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const overrides = useLiveStore((s) => s.overrides);
  const [tab, setTab] = useState('overview');

  // S231: この端末の売上・回転数（本日/累計）。売上タブで表示。既存API(summary/by-device)を device_id で絞込。
  type SalesBucket = { cash_yen: number; qr_yen: number; total_yen: number; medal_count: number };
  type SalesRow = { yen100_count: number; yen100_sum: number; yen500_count: number; yen500_sum: number; cash_total: number; qr_total: number; total_sales: number; credit_balance: number };
  const [salesSummary, setSalesSummary] = useState<{ today: SalesBucket; cumulative: SalesBucket } | null>(null);
  const [salesRow, setSalesRow] = useState<SalesRow | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      const [sum, rows] = await Promise.all([
        api.get<{ today: SalesBucket; cumulative: SalesBucket }>(`/sales-events/summary?device_id=${params.id}`),
        api.get<SalesRow[]>(`/sales-events/by-device?device_id=${params.id}`).catch(() => [] as SalesRow[]),
      ]);
      setSalesSummary(sum);
      setSalesRow(Array.isArray(rows) && rows.length > 0 ? rows[0] : null);
    } catch (e) {
      console.error('[device] sales fetch failed:', e);
    } finally {
      setSalesLoading(false);
    }
  }, [params.id]);
  useEffect(() => { void loadSales(); }, [loadSales]);
  // Tier 1-I: Force-refresh state
  // リモート設定: 音量・輝度の送信中フラグ
  const [savingVolume, setSavingVolume] = useState(false);
  // S143: プロビジョニングコード発行
  const [provCode, setProvCode] = useState<string | null>(null);
  const [provIssuing, setProvIssuing] = useState(false);
  const [provCopied, setProvCopied] = useState(false);
  // const [savingBrightness, setSavingBrightness] = useState(false); // S141: 輝度UI非表示

  const issueProvCode = async () => {
    if (provIssuing) return;
    setProvIssuing(true);
    setProvCopied(false);
    try {
      const res = await api.post<{ device_id: string; provisioning_code: string }>(
        `/devices/${params.id}/provisioning-code`, {}
      );
      setProvCode(res.provisioning_code);
    } catch (e) {
      window.alert(tp.provIssueFailed(e instanceof Error ? e.message : String(e)));
    } finally {
      setProvIssuing(false);
    }
  };
  const copyProvCode = () => {
    if (!provCode) return;
    navigator.clipboard?.writeText(provCode).then(() => {
      setProvCopied(true);
      setTimeout(() => setProvCopied(false), 2000);
    });
  };

  // S144: 端末削除。orders は RESTRICT のため売上のある端末は失敗する(その旨を表示)。
  // 削除すると什器・コイン設定・抽選/コイン履歴も CASCADE で消える。
  const handleDeleteDevice = async () => {
    if (deleting) return;
    if (deleteConfirmText !== params.id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/devices/${params.id}`);
      router.push('/devices');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // orders RESTRICT 等で失敗した場合
      setDeleteError(tp.deleteFailed(msg));
      setDeleting(false);
    }
  };

  const sendDeviceCommand = async (type: 'set_volume' | 'set_brightness', value: number) => {
    const payload = type === 'set_volume' ? { volume: value } : { brightness: value };
    const setSaving = setSavingVolume; // S141: 輝度UI非表示につき音量のみ
    setSaving(true);
    try {
      await api.post(`/devices/${params.id}/commands`, { type, payload });
      setBaseDetail((prev) =>
        prev ? { ...prev, ...(type === 'set_volume' ? { volume: value } : { brightness: value }) } : prev
      );
    } catch (e) {
      alert(e instanceof ApiError ? (e.problem.detail || e.problem.title) : tp.sendFailed);
    } finally {
      setSaving(false);
    }
  };

  // S147c: 表示モード（通常/白黒/高コントラスト）。屋外視認性対策。アプリ内カラーマトリクス。
  const [savingDisplayMode, setSavingDisplayMode] = useState(false);
  const [displayMode, setDisplayMode] = useState<string>('normal');
  const sendDisplayMode = async (mode: 'normal' | 'grayscale' | 'hc1' | 'hc2' | 'hc3' | 'hc4') => {
    setSavingDisplayMode(true);
    try {
      await api.post(`/devices/${params.id}/commands`, { type: 'set_display_mode', payload: { mode } });
      setDisplayMode(mode);
    } catch (e) {
      alert(e instanceof ApiError ? (e.problem.detail || e.problem.title) : tp.sendFailed);
    } finally {
      setSavingDisplayMode(false);
    }
  };
  useLivePlayback();
  const playbackStates = useLivePlaybackStore((s) => s.states);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.get<DeviceDetail>(`/devices/${params.id}`);
        if (cancelled) return;
        setBaseDetail(d);
        setDisplayMode(d.display_mode ?? 'normal');  // S197: 保存済み表示モードでボタン復元
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

  /* === S161 reassign UI (state) === */
  const [reCustList, setReCustList] = useState<{ id: string; name: string }[]>([]);
  const [reStoreList, setReStoreList] = useState<{ id: string; customer_id: string; name: string }[]>([]);
  const [reCustomerId, setReCustomerId] = useState('');
  const [reStoreId, setReStoreId] = useState('');
  const [rePreview, setRePreview] = useState<{
    current_customer_name?: string | null;
    coin_insertion_event_count: number;
    gacha_draw_count: number;
    coin_setting_count: number;
    group_membership_count: number;
    has_dedicated_pool: boolean;
  } | null>(null);
  const [reBusy, setReBusy] = useState(false);
  const [reErr, setReErr] = useState<string | null>(null);
  const [reDone, setReDone] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void (async () => {
      try {
        const cs = await api.get<{ items?: { id: string; name: string }[] } | { id: string; name: string }[]>('/customers?limit=200');
        const cList = Array.isArray(cs) ? cs : (cs.items ?? []);
        setReCustList(cList);
        const ss = await api.get<{ items?: { id: string; customer_id: string; name: string }[] } | { id: string; customer_id: string; name: string }[]>('/stores?limit=200');
        const sList = Array.isArray(ss) ? ss : (ss.items ?? []);
        setReStoreList(sList);
      } catch {
        /* 一覧取得失敗時は付け替えUIを黙って無効化（致命ではない） */
      }
    })();
  }, [isSuperAdmin]);

  const reLoadPreview = useCallback(async () => {
    setReErr(null); setRePreview(null);
    try {
      const pv = await api.get<{
        current_customer_name?: string | null;
        coin_insertion_event_count: number;
        gacha_draw_count: number;
        coin_setting_count: number;
        group_membership_count: number;
        has_dedicated_pool: boolean;
      }>(`/devices/${params.id}/reassign-preview`);
      setRePreview(pv);
    } catch (e) {
      setReErr(e instanceof ApiError ? e.message : tp.fetchFailed);
    }
  }, [params.id]);

  const reExecute = useCallback(async () => {
    if (!reStoreId) return;
    setReBusy(true); setReErr(null);
    try {
      await api.post(`/devices/${params.id}/reassign`, { target_store_id: reStoreId });
      setReDone(true);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setReErr(e instanceof ApiError ? e.message : tp.reassignFailed);
    } finally {
      setReBusy(false);
    }
  }, [params.id, reStoreId]);
  /* === /S161 reassign UI (state) === */

  const [savingQr, setSavingQr] = useState(false);
  const [savingLocale, setSavingLocale] = useState(false);
  const [savingPulseUnit, setSavingPulseUnit] = useState(false);
  const [pulseUnitInput, setPulseUnitInput] = useState<string>('');

  const handleQrToggle = async (next: boolean) => {
    setSavingQr(true);
    try {
      await api.patch(`/devices/${params.id}/qr_enabled`, { qr_enabled: next });
      setBaseDetail((prev) => (prev ? { ...prev, qr_enabled: next } : prev));
    } catch (e) {
      alert(e instanceof ApiError ? (e.problem.detail || e.problem.title) : tp.saveFailed);
    } finally {
      setSavingQr(false);
    }
  };

  const handleLocaleToggle = async (checked: boolean) => {
    const next = checked ? 'en' : 'ja';
    setSavingLocale(true);
    try {
      await api.patch(`/devices/${params.id}/qr_locale`, { qr_locale: next });
      setBaseDetail((prev) => (prev ? { ...prev, qr_locale: next } : prev));
    } catch (e) {
      alert(e instanceof ApiError ? (e.problem.detail || e.problem.title) : tp.saveFailed);
    } finally {
      setSavingLocale(false);
    }
  };

  const handlePulseUnitSave = async () => {
    const raw = (pulseUnitInput ?? '').trim();
    if (raw === '') return;
    const unit = parseInt(raw, 10);
    if (!Number.isFinite(unit) || unit < 1) {
      alert(tp.pulseUnitInvalid);
      return;
    }
    if (unit === (baseDetail?.pulse_unit_yen ?? 100)) return; // 変化なしは保存しない
    setSavingPulseUnit(true);
    try {
      await api.patch(`/devices/${params.id}/pulse_unit_yen`, { pulse_unit_yen: unit });
      setBaseDetail((prev) => (prev ? { ...prev, pulse_unit_yen: unit } : prev));
    } catch (e) {
      alert(e instanceof ApiError ? (e.problem.detail || e.problem.title) : tp.saveFailed);
    } finally {
      setSavingPulseUnit(false);
    }
  };


  const [capturing, setCapturing] = useState(false);
  const [liveShot, setLiveShot] = useState<string | null>(null);
  const [liveOn, setLiveOn] = useState(false);
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1サイクル: 撮影リクエスト→裏で画像をプリロード→成功時のみ差し替え(切替時の壊れ防止)
  const captureCycle = async () => {
    try {
      await api.post(`/devices/${detail.id}/screenshot`, {});
      await new Promise((r) => setTimeout(r, 1200));
      const nextUrl = `https://api.xero-place.com/videos/screenshots/${detail.id}.png?t=${Date.now()}`;
      // S144: onload はデコード完了を保証せず「上だけ表示・下が欠ける」が起きる。
      // img.decode() で完全にデコードできた時だけ差し替える。
      // 撮れなかった/デコード失敗時は差し替えず前画像維持(従来設計を踏襲)。
      const img = new window.Image();
      img.src = nextUrl;
      try {
        await img.decode();
        setLiveShot(nextUrl);
      } catch {
        // 画像未生成・切替隙間・デコード失敗 → 前画像維持
      }
    } catch {
      // ライブ中は黙って次サイクルへ
    }
  };

  const handleScreenshot = async () => {
    if (capturing) return;
    setCapturing(true);
    await captureCycle();
    setCapturing(false);
  };

  // S141: 営業時間外モード手動操作
  const [offhoursBusy, setOffhoursBusy] = useState(false);
  const enterOffHours = async (mode: 'message' | 'blackout') => {
    if (offhoursBusy) return;
    setOffhoursBusy(true);
    try {
      await api.post(`/devices/${detail.id}/commands`, { type: 'enter_offhours', payload: { off_mode: mode } });
      window.alert(mode === 'blackout' ? tp.blackoutDone : tp.offhoursMsgDone);
    } catch (e) {
      window.alert(tp.failPrefix(e instanceof Error ? e.message : tp.unknown));
    } finally {
      setOffhoursBusy(false);
    }
  };
  const exitOffHoursManual = async () => {
    if (offhoursBusy) return;
    setOffhoursBusy(true);
    try {
      await api.post(`/devices/${detail.id}/commands`, { type: 'exit_offhours', payload: {} });
      window.alert(tp.backToBusiness);
    } catch (e) {
      window.alert(tp.failPrefix(e instanceof Error ? e.message : tp.unknown));
    } finally {
      setOffhoursBusy(false);
    }
  };


  const toggleLive = () => {
    if (liveOn) {
      if (liveTimer.current) { clearInterval(liveTimer.current); liveTimer.current = null; }
      setLiveOn(false);
    } else {
      setLiveOn(true);
      void captureCycle();
      liveTimer.current = setInterval(() => { void captureCycle(); }, 2500);
    }
  };

  // ページ離脱時にライブ停止(メモリリーク防止)
  useEffect(() => {
    return () => { if (liveTimer.current) clearInterval(liveTimer.current); };
  }, []);

  const [restarting, setRestarting] = useState(false);
  const handleRestartApp = async () => {
    if (restarting) return;
    const ok = window.confirm(tp.restartConfirm(detail.name));
    if (!ok) return;
    setRestarting(true);
    try {
      const res = await api.post<{ accepted?: boolean; command_id?: string }>(
        `/devices/${detail.id}/restart_app`,
        {}
      );
      if (res.accepted) {
        window.alert(tp.restartSent);
      } else {
        window.alert(tp.sendComplete);
      }
    } catch (e) {
      window.alert(tp.failPrefix(e instanceof Error ? e.message : tp.unknownError));
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

  // 在庫変動履歴（この端末・折りたたみ／日付・決済手段・金額でソート可）
  type StockMove = { ts: string; kind: string; delta: number; payment_method: string | null; amount: number | null; note: string | null };
  const [stockHistOpen, setStockHistOpen] = useState(false);
  const [stockHist, setStockHist] = useState<StockMove[]>([]);
  const [stockHistLoading, setStockHistLoading] = useState(false);
  const [stockHistLoaded, setStockHistLoaded] = useState(false);
  const [stockHistSort, setStockHistSort] = useState<'ts' | 'payment_method' | 'amount'>('ts');
  const [stockHistDir, setStockHistDir] = useState<'asc' | 'desc'>('desc');
  const loadStockHist = async () => {
    if (stockHistLoaded || stockHistLoading) return;
    setStockHistLoading(true);
    try {
      const res = await api.get<StockMove[]>(`/inventories/movements?device_id=${params.id}&limit=500`);
      setStockHist(Array.isArray(res) ? res : []);
      setStockHistLoaded(true);
    } catch (e) { console.error('[stock-history] fetch failed', e); }
    finally { setStockHistLoading(false); }
  };
  const toggleStockHist = () => { const n = !stockHistOpen; setStockHistOpen(n); if (n) loadStockHist(); };
  const sortStockHist = (k: 'ts' | 'payment_method' | 'amount') => {
    if (stockHistSort === k) setStockHistDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setStockHistSort(k); setStockHistDir('desc'); }
  };
  const sortedStockHist = [...stockHist].sort((a, b) => {
    const dir = stockHistDir === 'asc' ? 1 : -1;
    let av: number | string; let bv: number | string;
    if (stockHistSort === 'amount') { av = a.amount ?? -1; bv = b.amount ?? -1; }
    else if (stockHistSort === 'payment_method') { av = a.payment_method ?? ''; bv = b.payment_method ?? ''; }
    else { av = a.ts; bv = b.ts; }
    return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
  });
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
        const eps = await api.post<GachaEffectPack[]>('/gacha/program-effect-packs/ensure', {});
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
      if ((!Number.isNaN(t) && t > 100) || (!Number.isNaN(r) && r > 100)) {
        setStockMsg(tp.stockMax100);
        setStockSaving(false);
        return;
      }
      if (!Number.isNaN(t)) body.total_balls = t;
      if (!Number.isNaN(r)) body.remaining_balls = r;
      if (!Number.isNaN(th)) body.low_stock_threshold = th;
      await api.put<GachaMachine>(
        `/gacha/devices/${params.id}/machine/stock`,
        body,
      );
      await reloadMachine();
      setStockMsg(tp.stockUpdated);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.problem.detail || e.problem.title
          : (e as Error).message;
      setStockMsg(tp.stockUpdateFailed(msg));
    } finally {
      setStockSaving(false);
    }
  };

  // ── S235 フリーモード: 在庫0でも演出動画を流し続ける ──
  const [freeModeSaving, setFreeModeSaving] = useState(false);
  const toggleFreeMode = async () => {
    if (!machine || freeModeSaving) return;
    const next = !machine.free_mode;
    setFreeModeSaving(true);
    setStockMsg(null);
    try {
      await api.post<GachaMachine>(
        `/gacha/devices/${params.id}/machine/free-mode`,
        { enabled: next },
      );
      await reloadMachine();
      setStockMsg(next ? tp.freeModeEnabled : tp.freeModeDisabled);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.problem.detail || e.problem.title
          : (e as Error).message;
      setStockMsg(tp.freeModeFailed(msg));
    } finally {
      setFreeModeSaving(false);
    }
  };

  // 専用設定を作成（ensure）: pool未割当/共有を専用プールに
  const ensureSettings = async () => {
    setSettingsSaving(true);
    setSettingsMsg(null);
    try {
      await api.post<GachaMachine>(`/gacha/devices/${params.id}/machine/ensure`, {});
      await reloadMachine();
      setSettingsMsg(tp.settingsReady);
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : (e as Error).message;
      setSettingsMsg(tp.settingsReadyFailed(msg));
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
      setSettingsMsg(tp.settingsSaved);
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : (e as Error).message;
      setSettingsMsg(tp.settingsSaveFailed(msg));
    } finally {
      setSettingsSaving(false);
    }
  };

  const [sheetOpen, setSheetOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);  // S232: 現在の再生の映像モーダル

  if (loading) {
    return (
      <AppShell title={tp.detailTitle} breadcrumb={[tp.home, tp.devices, params.id]}>
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

  return (
    <AppShell title={detail.name} breadcrumb={[tp.home, tp.devices, detail.id]}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/devices"><ArrowLeft className="h-3.5 w-3.5 mr-1" />{t.common.back}</Link>
        </Button>
        <DeviceStatusBadge status={detail.status} />
        <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:ml-auto">
          <Button
            variant="default"
            size="sm"
            className="gap-1.5"
            disabled={detail.status !== 'online'}
            onClick={() => setSheetOpen(true)}
          >
            <Zap className="h-3.5 w-3.5" />{tp.switchPlayback}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={detail.status !== 'online' || capturing} onClick={handleScreenshot}>
            <Camera className="h-3.5 w-3.5" />{capturing ? tp.capturing : tp.screenshot}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={detail.status !== 'online' || restarting} onClick={handleRestartApp}>
            <RefreshCcw className="h-3.5 w-3.5" />{tp.restart}
          </Button>
        </div>
      </div>

      <div>
        <div className="space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="overview">{t.device.tabs.overview}</TabsTrigger>
              <TabsTrigger value="settings">{t.device.tabs.pricing}</TabsTrigger>
              <TabsTrigger value="effects">{t.device.tabs.effects}</TabsTrigger>
              <TabsTrigger value="screenshots">{t.device.tabs.screenshots}</TabsTrigger>
              <TabsTrigger value="schedules">{t.device.tabs.powerSchedule}</TabsTrigger>
              <TabsTrigger value="history">{t.device.tabs.apkHistory}</TabsTrigger>
                <TabsTrigger value="stock">{t.device.tabs.inventory}</TabsTrigger>
              <TabsTrigger value="sales">{tp.tabSales}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{tp.currentPlayback}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {detail.current_program_name ? (
                    <div className="flex items-center gap-3">
                      {detail.current_program_video_url ? (
                        <button
                          type="button"
                          onClick={() => setVideoOpen(true)}
                          title={tp.clickToPlay}
                          className="relative shrink-0 rounded overflow-hidden group focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <CurrentThumb src={detail.current_program_thumbnail_url} />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/35 transition-colors">
                            <PlayCircle className="h-8 w-8 text-white/95 drop-shadow" />
                          </span>
                        </button>
                      ) : (
                        <CurrentThumb src={detail.current_program_thumbnail_url} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-medium">{detail.current_program_name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {tp.contentSize}<span className="tabular-nums">{formatBytes(detail.current_program_size_bytes)}</span>
                        </div>
                        {playbackStates[detail.id] && (
                          <div className="mt-3 pt-3 border-t">
                            <PlaybackStatus playback={playbackStates[detail.id]} />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{tp.noProgram}</p>
                  )}
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardHeader><CardTitle className="text-sm">{tp.remoteSettings}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <RemoteSliderRow
                    icon={<Volume2 className="h-4 w-4" />}
                    label={tp.volume}
                    value={detail.volume}
                    saving={savingVolume}
                    onCommit={(v) => void sendDeviceCommand('set_volume', v)}
                  />
                  {/* S141: 輝度リモート制御は端末(HiSilicon)がソフト輝度制御非対応のため非表示。
                      signage側 applyDeviceBrightness は残置(将来の対応端末向け)。本体で輝度固定運用。
                  <RemoteSliderRow
                    icon={<Sun className="h-4 w-4" />}
                    label="輝度"
                    value={detail.brightness}
                    saving={savingBrightness}
                    onCommit={(v) => void sendDeviceCommand('set_brightness', v)}
                  /> */}

                  {/* S147c: 表示モード（屋外視認性対策・自分の什器のみ操作可。backendがcustomer_id絞り込みで保証）*/}
                  {detail && (
                    <div className="pt-2 border-t border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <Sun className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{tp.displayModeLabel}</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {([
                          { key: 'normal', label: tp.dmNormal },
                          { key: 'grayscale', label: tp.dmGrayscale },
                          { key: 'hc1', label: tp.dmHc1 },
                          { key: 'hc2', label: tp.dmHc2 },
                          { key: 'hc3', label: tp.dmHc3 },
                          { key: 'hc4', label: tp.dmHc4 },
                        ] as const).map((m) => (
                          <button
                            key={m.key}
                            onClick={() => void sendDisplayMode(m.key)}
                            disabled={savingDisplayMode}
                            className={`h-auto min-h-9 px-2 py-1.5 leading-tight rounded-md text-xs font-medium border transition-colors disabled:opacity-60 ${
                              displayMode === m.key
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-card border-border hover:bg-accent'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {tp.displayModeNote}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* S202: 運営(lv1_super)のみ表示 */}
              {isSuperAdmin && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-sm">{tp.provTitle}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {tp.provDesc}
                  </p>
                  {provCode ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-2xl font-bold tracking-widest tabular-nums select-all">{provCode}</span>
                        <Button size="sm" variant="outline" onClick={copyProvCode}>
                          {provCopied ? tp.copied : tp.copy}
                        </Button>
                      </div>
                      <p className="text-[11px] text-amber-400">{tp.provReissueWarn}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{tp.provNotIssued}</p>
                  )}
                  <Button size="sm" onClick={issueProvCode} disabled={provIssuing}>
                    {provIssuing ? tp.provIssuing : (provCode ? tp.provReissue : tp.provIssue)}
                  </Button>
                </CardContent>
              </Card>
              )}

              {/* S144: 危険ゾーン（端末削除）/ S202: 運営(lv1_super)のみ表示 */}
              {isSuperAdmin && (
              <Card className="mt-4 border-red-500/40">
                <CardHeader>
                  <CardTitle className="text-sm text-red-400">{tp.dangerZone}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {tp.deleteDesc}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tp.deleteConfirmPre}<span className="font-mono text-red-400 select-all">{params.id}</span>{tp.deleteConfirmPost}
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={params.id}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                  {deleteError && (
                    <p className="text-xs text-red-400">{deleteError}</p>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDeleteDevice}
                    disabled={deleting || deleteConfirmText !== params.id}
                  >
                    {deleting ? tp.deleting : tp.deleteButton}
                  </Button>
                </CardContent>
              </Card>
              )}

              {/* === S161 reassign UI === */}
              {isSuperAdmin && (
                <Card className="mt-4 border-amber-500/40">
                  <CardHeader>
                    <CardTitle className="text-sm text-amber-400">{tp.reassignTitle}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {tp.reassignDescPre}<span className="text-amber-400">{tp.reassignDescStrong}</span>{tp.reassignDescPost}
                    </p>

                    {reDone ? (
                      <p className="text-sm text-emerald-400">{tp.reassignDone}</p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-muted-foreground">{tp.targetCustomer}</label>
                            <Select
                              value={reCustomerId}
                              onValueChange={(v) => { setReCustomerId(v); setReStoreId(''); setRePreview(null); }}
                            >
                              <SelectTrigger><SelectValue placeholder={tp.selectCustomer} /></SelectTrigger>
                              <SelectContent>
                                {reCustList
                                  .filter((c) => c.id !== detail.customer_id)
                                  .map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{tp.nameId(c.name, c.id)}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <label className="text-xs text-muted-foreground">{tp.targetStore}</label>
                            <Select
                              value={reStoreId}
                              onValueChange={(v) => setReStoreId(v)}
                              disabled={!reCustomerId}
                            >
                              <SelectTrigger><SelectValue placeholder={reCustomerId ? tp.selectStore : tp.selectCustomerFirst} /></SelectTrigger>
                              <SelectContent>
                                {reStoreList
                                  .filter((st) => st.customer_id === reCustomerId)
                                  .map((st) => (
                                    <SelectItem key={st.id} value={st.id}>{tp.nameId(st.name, st.id)}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => void reLoadPreview()} disabled={!reStoreId}>
                            {tp.checkImpact}
                          </Button>
                        </div>

                        {rePreview && (
                          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-1">
                            <div className="text-amber-300 font-medium">{tp.whatHappens}</div>
                            <div>{tp.currentCustomer}<span className="font-mono">{rePreview.current_customer_name ?? detail.customer_id}</span></div>
                            <div>{tp.deletedDraws}<span className="tabular-nums">{rePreview.gacha_draw_count}</span>{tp.countUnit}</div>
                            <div>{tp.deletedCoins}<span className="tabular-nums">{rePreview.coin_insertion_event_count}</span>{tp.countUnit}</div>
                            <div>{tp.removedGroups}<span className="tabular-nums">{rePreview.group_membership_count}</span>{tp.countUnit}</div>
                            <div>{tp.inheritedPricing}<span className="tabular-nums">{rePreview.coin_setting_count}</span>{tp.countUnit}{rePreview.has_dedicated_pool ? tp.hasDedicatedPool : ''}</div>
                          </div>
                        )}

                        {reErr && <p className="text-xs text-red-400">{reErr}</p>}

                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void reExecute()}
                          disabled={reBusy || !reStoreId || !rePreview}
                        >
                          {reBusy ? tp.reassigning : tp.reassignButton}
                        </Button>
                        {!rePreview && reStoreId && (
                          <p className="text-[11px] text-muted-foreground">{tp.checkImpactFirst}</p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
              {/* === /S161 reassign UI === */}
            </TabsContent>

            <TabsContent value="screenshots">
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle className="text-sm">{tp.liveViewTitle}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-3">
                    <Button size="sm" variant={liveOn ? 'destructive' : 'default'} onClick={toggleLive} disabled={detail.status !== 'online'}>
                      {liveOn ? tp.liveStop : tp.liveStart}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleScreenshot} disabled={detail.status !== 'online' || liveOn || capturing}>
                      {capturing ? tp.capturing : tp.captureOne}
                    </Button>
                    {liveOn && <span className="text-xs text-muted-foreground">{tp.autoUpdating}</span>}
                  </div>
                  {liveShot ? (
                    <div className="rounded-md border overflow-hidden" style={{ maxWidth: '240px' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={liveShot} alt={tp.liveViewAlt} className="w-full h-auto block" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "visible"; }} />
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {tp.notCapturedYet}
                    </div>
                  )}
                </CardContent>
              </Card>
{/* S141: スクリーンショット履歴は非表示（ライブビューに一本化） */}
            </TabsContent>

            <TabsContent value="schedules">
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle className="text-sm">{tp.offhoursTitle}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    {tp.offhoursDesc}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => enterOffHours('message')} disabled={detail.status !== 'online' || offhoursBusy}>
                      {tp.offhoursMessage}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => enterOffHours('blackout')} disabled={detail.status !== 'online' || offhoursBusy}>
                      {tp.offhoursBlackout}
                    </Button>
                    <Button size="sm" variant="default" onClick={exitOffHoursManual} disabled={detail.status !== 'online' || offhoursBusy}>
                      {tp.backToBusinessBtn}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{tp.powerScheduleTitle}</CardTitle>
                </CardHeader>
                <CardContent>
                  <PowerScheduleEditor deviceId={detail.id} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardHeader><CardTitle className="text-sm">{tp.apkHistoryTitle}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tp.colTask}</TableHead>
                        <TableHead>{tp.colStatus}</TableHead>
                        <TableHead>{tp.colStarted}</TableHead>
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
                  <CardTitle className="text-sm">{t.pricing.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {machineMissing ? (
                    <p className="text-sm text-muted-foreground">
                      {t.pricing.machineMissing}
                    </p>
                  ) : !curPool ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {t.pricing.noPool}
                      </p>
                      <Button size="sm" disabled={settingsSaving} onClick={ensureSettings}>
                        {settingsSaving ? t.common.preparing : t.pricing.ensureButton}
                      </Button>
                      {settingsMsg && <p className="text-xs text-muted-foreground">{settingsMsg}</p>}
                    </div>
                  ) : (
                    <>
                      {/* 投入の受付方法（現金 / メダル / 受け付けない） */}
                      <div className="space-y-2">
                        <div className="text-sm font-medium">{t.pricing.acceptMethod.title}</div>
                        <p className="text-xs text-muted-foreground">
                          {t.pricing.acceptMethod.description}
                        </p>
                        <label className={`flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer transition-colors ${acceptMode === 'cash' ? 'border-primary bg-primary/5' : 'border-slate-300 dark:border-slate-700'}`}>
                          <input type="radio" name="accept-mode" className="mt-0.5"
                            checked={acceptMode === 'cash'}
                            onChange={() => setAcceptMode('cash')} />
                          <span>
                            <span className="block font-medium">{t.pricing.acceptMethod.cash.label}</span>
                            {t.pricing.acceptMethod.cash.description ? (
                            <span className="block text-xs text-muted-foreground">
                              {t.pricing.acceptMethod.cash.description}
                            </span>
                            ) : null}
                          </span>
                        </label>

                        {/* 1回の料金（現金のときだけ表示） */}
                        {acceptMode === 'cash' && (
                          <div className="ml-6 space-y-1">
                            <label htmlFor="set-price" className="text-sm font-medium">{t.pricing.pricePerPlay.label}</label>
                            <div className="flex items-center gap-2">
                              <input id="set-price" type="number" inputMode="numeric"
                                className="w-32 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                                value={setPrice} onChange={(e) => setSetPrice(e.target.value)} />
                              <span className="text-sm text-muted-foreground">{t.pricing.pricePerPlay.suffix}</span>
                            </div>
                            {locale === 'en' && (
                              <div className="text-xs text-muted-foreground">≈ {formatPrice(parseInt(setPrice, 10) || 0)}</div>
                            )}
                          </div>
                        )}

                        <label className={`flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer transition-colors ${acceptMode === 'token' ? 'border-primary bg-primary/5' : 'border-slate-300 dark:border-slate-700'}`}>
                          <input type="radio" name="accept-mode" className="mt-0.5"
                            checked={acceptMode === 'token'}
                            onChange={() => setAcceptMode('token')} />
                          <span>
                            <span className="block font-medium">{t.pricing.acceptMethod.token.label}</span>
                            <span className="block text-xs text-muted-foreground">
                              {t.pricing.acceptMethod.token.description}
                            </span>
                          </span>
                        </label>
                        <label className={`flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer transition-colors ${acceptMode === 'none' ? 'border-primary bg-primary/5' : 'border-slate-300 dark:border-slate-700'}`}>
                          <input type="radio" name="accept-mode" className="mt-0.5"
                            checked={acceptMode === 'none'}
                            onChange={() => setAcceptMode('none')} />
                          <span>
                            <span className="block font-medium">{t.pricing.acceptMethod.none.label}</span>
                            <span className="block text-xs text-muted-foreground">
                              {t.pricing.acceptMethod.none.description}
                            </span>
                          </span>
                        </label>
                      </div>

                      {/* QRコード決済（運営専用・即時反映。投入とは独立） */}
                      {isSuperAdmin && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium">{t.pricing.qr.title}</div>
                          {savingQr && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        </div>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={detail.qr_enabled ?? false} disabled={savingQr}
                            onChange={(e) => void handleQrToggle(e.target.checked)} />
                          {t.pricing.qr.checkbox}
                        </label>
                        <p className="text-xs text-muted-foreground">{t.pricing.qr.note}</p>
                        <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
                          <input type="checkbox" checked={(detail.qr_locale ?? 'ja') === 'en'} disabled={savingLocale}
                            onChange={(e) => void handleLocaleToggle(e.target.checked)} />
                          {t.pricing.qr.localeLabel}
                        </label>
                        <p className="text-xs text-muted-foreground">{t.pricing.qr.localeNote}</p>
                        {/* S183: 1パルス単価（円）— 運営専用。什器コインアクセプタ物理設定と一致必須。 */}
                        <div className="pt-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{t.pricing.pulseUnit.label}</span>
                            {savingPulseUnit && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                          </div>
                          <div className="flex items-center gap-2">
                            <input type="number" inputMode="numeric" min={1}
                              className="w-32 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                              value={pulseUnitInput === '' ? String(detail.pulse_unit_yen ?? 100) : pulseUnitInput}
                              disabled={savingPulseUnit}
                              onChange={(e) => setPulseUnitInput(e.target.value)}
                              onBlur={() => void handlePulseUnitSave()} />
                            <span className="text-sm text-muted-foreground">{t.pricing.pulseUnit.suffix}</span>
                          </div>
                          {(() => {
                            const unit = parseInt(pulseUnitInput === '' ? String(detail.pulse_unit_yen ?? 100) : pulseUnitInput, 10);
                            const price = parseInt(setPrice, 10);
                            if (!Number.isFinite(unit) || unit < 1) return null;
                            if (!Number.isFinite(price) || price < 1) return (
                              <p className="text-xs text-muted-foreground">{t.pricing.pulseUnit.note}</p>
                            );
                            const pulses = Math.floor(price / unit);
                            const indivisible = price % unit !== 0;
                            const over9 = pulses > 9;
                            return (
                              <div className="text-xs space-y-0.5">
                                <p className="text-muted-foreground">{price}{t.pricing.pulseUnit.exampleMid}{unit}{t.pricing.pulseUnit.exampleTail}{pulses}{t.pricing.pulseUnit.pulseWord}</p>
                                {over9 && <p className="text-red-600 dark:text-red-400">{t.pricing.pulseUnit.warnOver9}</p>}
                                {indivisible && <p className="text-amber-600 dark:text-amber-400">{t.pricing.pulseUnit.warnIndivisible}</p>}
                              </div>
                            );
                          })()}
                          <p className="text-xs text-muted-foreground">{t.pricing.pulseUnit.note}</p>
                        </div>
                      </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button size="sm" disabled={settingsSaving} onClick={saveSettings}>
                          {settingsSaving ? t.common.saving : t.common.save}
                        </Button>
                        {settingsMsg && <p className="text-xs text-muted-foreground">{settingsMsg}</p>}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="effects">
              <Card className="border-0 shadow-none bg-transparent">
                <CardContent className="p-0 space-y-4">
                  {machineMissing ? (
                    <p className="text-sm text-muted-foreground">
                      {tp.effectsMachineMissing}
                    </p>
                  ) : !machine?.pool_id ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {t.pricing.noPool}
                      </p>
                      <Button size="sm" disabled={settingsSaving} onClick={ensureSettings}>
                        {settingsSaving ? t.common.preparing : t.pricing.ensureButton}
                      </Button>
                      {settingsMsg && <p className="text-xs text-muted-foreground">{settingsMsg}</p>}
                    </div>
                  ) : (
                    <DrawOrderMappingEditor
                      poolId={machine.pool_id}
                      deviceId={machine.device_id}
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
                  <CardTitle className="text-sm">{tp.stockTitle}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {machineMissing ? (
                    <p className="text-sm text-muted-foreground">
                      {tp.stockMachineMissing}
                    </p>
                  ) : !machine ? (
                    <p className="text-sm text-muted-foreground">{tp.loading}</p>
                  ) : (
                    <>
                      {/* 現在の在庫 */}
                      <div className="text-center py-2">
                        <div className="text-4xl font-bold tabular-nums">
                          {machine.free_mode ? (
                            /* S235: フリーモード中は個数のかわりに Free と表示 */
                            <span className="text-primary">{tp.freeModeBadge}</span>
                          ) : (
                            <>
                              <span className={
                                machine.remaining_balls <= 0
                                  ? 'text-destructive'
                                  : machine.remaining_balls <= machine.low_stock_threshold
                                  ? 'text-warn'
                                  : 'text-emerald-500'
                              }>{machine.remaining_balls}</span>
                              <span className="text-xl text-muted-foreground"> / {machine.total_balls}{tp.pcsSuffix}</span>
                            </>
                          )}
                        </div>
                        <div className="mt-3 h-3 w-full max-w-md mx-auto rounded-full bg-muted overflow-hidden">
                          <div
                            className={
                              machine.free_mode
                                ? 'h-full bg-primary-grad'
                                : machine.remaining_balls <= machine.low_stock_threshold
                                ? 'h-full bg-destructive'
                                : 'h-full bg-emerald-500'
                            }
                            style={{
                              width: machine.free_mode
                                ? '100%'
                                : `${machine.total_balls > 0
                                  ? Math.min(100, Math.round((machine.remaining_balls / machine.total_balls) * 100))
                                  : 0}%`,
                            }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {machine.free_mode ? tp.freeModeActive : tp.autoDecrement}
                        </p>
                        {!machine.free_mode && machine.remaining_balls <= 0 && (
                          <Badge variant="destructive" className="mt-2">{tp.soldOut}</Badge>
                        )}
                      </div>

                      {/* S235 フリーモード */}
                      <div className="border-t pt-4 space-y-2">
                        <div className="text-sm font-medium">{tp.freeModeTitle}</div>
                        <p className="text-xs text-muted-foreground">{tp.freeModeDesc}</p>
                        <Button
                          size="sm"
                          variant={machine.free_mode ? 'outline' : 'default'}
                          disabled={freeModeSaving}
                          onClick={toggleFreeMode}
                        >
                          {freeModeSaving
                            ? tp.freeModeSwitching
                            : machine.free_mode
                            ? tp.freeModeOff
                            : tp.freeModeOn}
                        </Button>
                      </div>

                      {/* 在庫を設定・補充 */}
                      <div className="border-t pt-4 space-y-3">
                        <div className="text-sm font-medium">{tp.setRefill}</div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-1">
                            <label htmlFor="st-total" className="text-xs text-muted-foreground">{tp.fullCount}</label>
                            <input id="st-total" type="number" inputMode="numeric" min={0} max={100}
                              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                              value={stockTotal} onChange={(e) => setStockTotal(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label htmlFor="st-remain" className="text-xs text-muted-foreground">{tp.currentCount}</label>
                            <input id="st-remain" type="number" inputMode="numeric" min={0} max={100}
                              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                              value={stockRemaining} onChange={(e) => setStockRemaining(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label htmlFor="st-thr" className="text-xs text-muted-foreground">{tp.lowStockLine}</label>
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
                            {tp.fillUp}
                          </Button>
                          <Button size="sm" disabled={stockSaving} onClick={() => saveStock()}>
                            {stockSaving ? tp.saving : tp.saveButton}
                          </Button>
                        </div>
                        {stockMsg && (
                          <p className="text-xs text-muted-foreground">{stockMsg}</p>
                        )}
                        {machine.last_refilled_at && (
                          <p className="text-xs text-muted-foreground">
                            {tp.lastRefill}{fmtDate(machine.last_refilled_at)}
                          </p>
                        )}
                      </div>

                      {/* 在庫変動履歴（この端末・折りたたみ） */}
                      <div className="border-t pt-4">
                        <button
                          onClick={toggleStockHist}
                          className="flex items-center gap-2 text-sm font-medium hover:opacity-80"
                        >
                          {stockHistOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {tp.stockHistTitle}
                          <span className="text-xs text-muted-foreground font-normal">
                            {stockHistLoaded ? tp.countUnit2(stockHist.length) : tp.clickToShow}
                          </span>
                        </button>
                        {stockHistOpen && (
                          <div className="mt-3 overflow-x-auto">
                            {stockHistLoading ? (
                              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                            ) : sortedStockHist.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-4">{tp.noHistory}</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead className="text-muted-foreground border-b">
                                  <tr>
                                    <th className="text-left py-1.5 cursor-pointer select-none" onClick={() => sortStockHist('ts')}>
                                      {tp.colDatetime} <ArrowUpDown className="inline h-3 w-3" />{stockHistSort === 'ts' ? (stockHistDir === 'asc' ? '▲' : '▼') : ''}
                                    </th>
                                    <th className="text-left py-1.5">{tp.colKind}</th>
                                    <th className="text-right py-1.5">{tp.colDelta}</th>
                                    <th className="text-left py-1.5 cursor-pointer select-none" onClick={() => sortStockHist('payment_method')}>
                                      {tp.colPayment} <ArrowUpDown className="inline h-3 w-3" />{stockHistSort === 'payment_method' ? (stockHistDir === 'asc' ? '▲' : '▼') : ''}
                                    </th>
                                    <th className="text-right py-1.5 cursor-pointer select-none" onClick={() => sortStockHist('amount')}>
                                      {tp.colAmount} <ArrowUpDown className="inline h-3 w-3" />{stockHistSort === 'amount' ? (stockHistDir === 'asc' ? '▲' : '▼') : ''}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedStockHist.slice(0, 500).map((m, i) => (
                                    <tr key={`${m.ts}-${i}`} className="border-b border-muted/40">
                                      <td className="py-1.5 whitespace-nowrap">{fmtDate(m.ts)}</td>
                                      <td className="py-1.5">{m.kind === 'sale' ? tp.kindSale : m.kind === 'replenish' ? tp.kindReplenish : tp.kindAdjust}</td>
                                      <td className={`py-1.5 text-right tabular-nums ${m.delta < 0 ? 'text-destructive' : 'text-emerald-600'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                                      <td className="py-1.5">{m.payment_method === 'cash' ? tp.payCash : m.payment_method === 'qr' ? tp.payQr : m.payment_method === 'token' ? tp.payToken : (m.payment_method ?? '—')}</td>
                                      <td className="py-1.5 text-right tabular-nums">{m.amount != null ? fmtYen(m.amount) : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sales">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm inline-flex items-center gap-2">
                    <Coins className="h-4 w-4 text-amber-500" />{tp.salesTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {salesLoading && !salesSummary ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />{tp.loadingDots}</div>
                  ) : !salesSummary ? (
                    <div className="text-sm text-muted-foreground py-6">{tp.noSalesData}</div>
                  ) : (
                    <>
                      {/* 本日 */}
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">{tp.today}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-lg border p-3">
                            <div className="text-[11px] text-muted-foreground mb-1 inline-flex items-center gap-1"><Coins className="h-3.5 w-3.5 text-amber-500" />{tp.playsMedal}</div>
                            <div className="text-2xl font-bold tabular-nums text-amber-500">{salesSummary.today.medal_count.toLocaleString()}<span className="text-base font-medium ml-1">{tp.timesUnit}</span></div>
                          </div>
                          <div className="rounded-lg border p-3">
                            <div className="text-[11px] text-muted-foreground mb-1">{tp.sales}</div>
                            <div className="text-2xl font-bold tabular-nums">{fmtYen(salesSummary.today.total_yen)}</div>
                            <div className="mt-1 space-y-0.5 text-[11px]">
                              <div className="flex justify-between"><span className="text-muted-foreground">{tp.cash}</span><span className="tabular-nums text-amber-400">{fmtYen(salesSummary.today.cash_yen)}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{tp.cashless}</span><span className="tabular-nums text-emerald-400">{fmtYen(salesSummary.today.qr_yen)}</span></div>
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* 累計 */}
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">{tp.cumulative}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-lg border p-3">
                            <div className="text-[11px] text-muted-foreground mb-1 inline-flex items-center gap-1"><Coins className="h-3.5 w-3.5 text-amber-500" />{tp.cumulativePlays}</div>
                            <div className="text-2xl font-bold tabular-nums text-amber-500">{salesSummary.cumulative.medal_count.toLocaleString()}<span className="text-base font-medium ml-1">{tp.timesUnit}</span></div>
                          </div>
                          <div className="rounded-lg border p-3">
                            <div className="text-[11px] text-muted-foreground mb-1">{tp.cumulativeSales}</div>
                            <div className="text-2xl font-bold tabular-nums text-sky-500">{fmtYen(salesSummary.cumulative.total_yen)}</div>
                            <div className="mt-1 space-y-0.5 text-[11px]">
                              <div className="flex justify-between"><span className="text-muted-foreground">{tp.cash}</span><span className="tabular-nums text-amber-400">{fmtYen(salesSummary.cumulative.cash_yen)}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">{tp.cashless}</span><span className="tabular-nums text-emerald-400">{fmtYen(salesSummary.cumulative.qr_yen)}</span></div>
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* 現金投入内訳 */}
                      {salesRow && (
                        <div className="rounded-lg border p-3">
                          <div className="text-[11px] text-muted-foreground mb-2">{tp.cashBreakdown}</div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div><div className="text-[11px] text-muted-foreground">{tp.yen100In}</div><div className="tabular-nums font-medium">{salesRow.yen100_count.toLocaleString()}{tp.coinsUnit} <span className="text-[11px] text-muted-foreground">/ {fmtYen(salesRow.yen100_sum)}</span></div></div>
                            <div><div className="text-[11px] text-muted-foreground">{tp.yen500In}</div><div className="tabular-nums font-medium">{salesRow.yen500_count.toLocaleString()}{tp.coinsUnit} <span className="text-[11px] text-muted-foreground">/ {fmtYen(salesRow.yen500_sum)}</span></div></div>
                            <div><div className="text-[11px] text-muted-foreground">{tp.cashTotal}</div><div className="tabular-nums font-medium text-amber-500">{fmtYen(salesRow.cash_total)}</div></div>
                            <div><div className="text-[11px] text-muted-foreground">{tp.creditBalance}</div><div className="tabular-nums font-medium">{fmtYen(salesRow.credit_balance)}</div></div>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground">{tp.salesNote}</p>
                        <button onClick={() => void loadSales()} className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded px-2 py-1 hover:bg-accent border"><RefreshCcw className="h-3.5 w-3.5" />{tp.refresh}</button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>


          </Tabs>
        </div>
      </div>

      {videoOpen && detail.current_program_video_url && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setVideoOpen(false)}
        >
          <button
            type="button"
            onClick={() => setVideoOpen(false)}
            aria-label={tp.close}
            className="absolute top-4 right-4 text-white/90 hover:text-white"
          >
            <X className="h-7 w-7" />
          </button>
          <video
            src={detail.current_program_video_url}
            controls
            autoPlay
            playsInline
            className="object-contain rounded bg-black"
            style={{ maxWidth: '95vw', maxHeight: '85vh' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <LiveControlSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        scope={{ device_ids: [detail.id], label: detail.name }}
      />
    </AppShell>
  );
}



/** 現在の再生サムネ: 現在の番組の先頭素材サムネ(動画の先頭フレーム)。無ければ(USB等/取得失敗)再生アイコン。 */
function CurrentThumb({ src }: { src?: string | null }) {
  const tp = usePageT(deviceDetailDict);
  const [err, setErr] = useState(false);
  if (!src || err) return <PlayCircle className="h-10 w-10 text-primary shrink-0" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={tp.thumbAlt}
      onError={() => setErr(true)}
      className="h-16 w-28 rounded object-cover border border-border/50 shrink-0 bg-black"
    />
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
  const tp = usePageT(deviceDetailDict);
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
            {saving ? tp.sending : `${local}%`}
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

