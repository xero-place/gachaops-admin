'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { tokenStore } from '@/lib/token-store';
import { Loader2, Search, Coins, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, AlertTriangle, Trash2 } from 'lucide-react';
import { fmtYen, fmtDate } from '@/lib/format';
import type { SalesEvent } from '@/types/domain';
import { usePageT } from '@/i18n/usePageT';
import { salesEventsDict } from '@/i18n/ns/salesEvents';

interface CustomerLite { id: string; name: string }
interface DeviceLite { id: string; name: string; customer_id?: string }
interface StoreLite { id: string; name: string }
interface GroupLite { id: string; name: string }

interface SummaryBucket {
  cash_yen: number;
  qr_yen: number;
  total_yen: number;
  medal_count: number;
}
interface SummaryResp {
  today: SummaryBucket;
  cumulative: SummaryBucket;
}
interface DeviceCashRow {
  device_id: string;
  device_name: string;
  customer_name: string;
  yen100_count: number;
  yen100_sum: number;
  yen500_count: number;
  yen500_sum: number;
  other_sum: number;
  cash_total: number;
  drawn_total: number;
  credit_balance: number;
  qr_total?: number;      // S224: キャッシュレス(QR)売上
  total_sales?: number;   // S224: 累計売上(現金+キャッシュレス)
  medal_count?: number;   // 端末別 メダル(token)投入数
}
interface ListResp {
  items: SalesEvent[];
  total: number;
  offset: number;
  limit: number;
  undispensed_count?: number;   // ★P1: 未排出(課金済み・排出なし)の総件数(ページング非依存)
  undispensed_yen?: number;     // ★P1: 未排出の総額
}

const PAGE_SIZE = 200;

const KIND_VALUES = ['all', 'qr', 'cash', 'token'] as const;
// storegroup2: QRのPSP絞り込み候補。'all'=全PSP。
const PROVIDER_VALUES = ['all', 'veritrans', 'paypay', 'stripe', 'paypal', 'square'] as const;

type SalesT = (typeof salesEventsDict)['ja'] | (typeof salesEventsDict)['en'];

// storegroup2: QRのPSP種別ラベル。QR以外(cash/token)や未設定は空文字を返す。
function providerLabelOf(p: string | null | undefined, t: SalesT): string {
  switch ((p || '').toLowerCase()) {
    case 'veritrans': return t.provVeritrans;
    case 'paypay': return t.provPaypay;
    case 'paypal': return t.provPaypal;
    case 'stripe': return t.provStripe;
    case 'square': return t.provSquare;
    default: return '';
  }
}

const EMPTY_BUCKET: SummaryBucket = { cash_yen: 0, qr_yen: 0, total_yen: 0, medal_count: 0 };

function KindBadge({ e }: { e: SalesEvent }) {
  const t = usePageT(salesEventsDict);
  if (e.is_undispensed) {
    return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-500/15 text-red-600 dark:text-red-400">{t.undispensed}</span>;
  }
  if (e.kind === 'qr') {
    const prov = providerLabelOf(e.payment_provider, t);  // storegroup2: 「QR決済 (PayPal)」等
    return <Badge variant="ok">{prov ? `${t.kindQr} (${prov})` : t.kindQr}</Badge>;
  }
  if (e.kind === 'cash') return <Badge variant="warn">{t.kindCash}</Badge>;
  return <Badge variant="muted">{t.kindToken}</Badge>;
}

/** JSTの暦日(YYYY-MM-DD)を、その日の0:00 JST = UTC ISO文字列に変換 */
function jstDateToUtcStart(dateStr: string): string | null {
  if (!dateStr) return null;
  // dateStr は "2026-06-21" 形式。JST 0:00 = 前日15:00 UTC
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
/** JSTの暦日を、その日の終わり(翌日0:00 JST)のUTC ISO文字列に変換（<= 境界用） */
function jstDateToUtcEnd(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 1); // 翌日0:00 JST
  return d.toISOString();
}

/** 売上カード（本日 / 累計）。内訳を下にぶら下げる */
function SalesCard({
  label, badge, badgeClass, totalYen, cashYen, qrYen, accentClass,
}: {
  label: string;
  badge: string;
  badgeClass: string;
  totalYen: number;
  cashYen: number;
  qrYen: number;
  accentClass: string;
}) {
  const t = usePageT(salesEventsDict);
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-muted-foreground">{label}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeClass}`}>{badge}</span>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${accentClass}`}>{fmtYen(totalYen)}</div>
        <div className="mt-2 pt-2 border-t border-border/50 space-y-0.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{t.cashSalesLabel}</span>
            <span className="tabular-nums text-amber-400 font-medium">{fmtYen(cashYen)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{t.cashlessLabel}</span>
            <span className="tabular-nums text-emerald-400 font-medium">{fmtYen(qrYen)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** メダルカード（本日 / 累計） */
function MedalCard({
  label, badge, badgeClass, count,
}: {
  label: string; badge: string; badgeClass: string; count: number;
}) {
  const t = usePageT(salesEventsDict);
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-muted-foreground">{label}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeClass}`}>{badge}</span>
        </div>
        <div className="text-2xl font-bold tabular-nums text-amber-400 inline-flex items-center gap-1.5">
          <Coins className="h-5 w-5" />{count.toLocaleString()} <span className="text-base font-medium">{t.coinsUnit}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SalesEventsPage() {
  const t = usePageT(salesEventsDict);
  const kindLabelOf = (v: string) => (v === 'all' ? t.kindAll : v === 'qr' ? t.kindQr : v === 'cash' ? t.kindCash : v === 'token' ? t.kindToken : v);
  const [events, setEvents] = useState<SalesEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [devices, setDevices] = useState<DeviceLite[]>([]);
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [summary, setSummary] = useState<SummaryResp>({ today: EMPTY_BUCKET, cumulative: EMPTY_BUCKET });
  const [byDevice, setByDevice] = useState<DeviceCashRow[]>([]);  // S213: 端末別現金内訳
  const [summaryOpen, setSummaryOpen] = useState(true);  // S224: サマリー折りたたみ
  const [byDeviceOpen, setByDeviceOpen] = useState(false);  // S225/S229: 端末別内訳は既定で折りたたみ
  const [undispensed, setUndispensed] = useState<{ count: number; yen: number }>({ count: 0, yen: 0 });  // ★P1: 未排出アラート
  const [onlyUndispensed, setOnlyUndispensed] = useState(false);  // ★rankSR1: 未排出のみ表示(バナークリック)
  const [refreshTick, setRefreshTick] = useState(0);              // ★rankSR1: 対応済み後の再取得トリガ
  const [resolving, setResolving] = useState<string | null>(null); // ★rankSR1: 対応中の注文ID

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');  // storegroup2: QRのPSP絞り込み
  const [customerFilter, setCustomerFilter] = useState('all');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const isSuper = tokenStore.getUser()?.role === 'lv1_super';  // 顧客ロールでは顧客プルダウン非表示

  // S230: 検索ボックスにマシン番号/端末名を入れたら、それをサーバー側の端末フィルタに解決する。
  // これで「一覧・上部の4カード・端末別内訳」がすべて同じ端末で集計され、件数の食い違いが消える。
  const searchedDevice = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return null;
    const exact = devices.find((d) => (d.name ?? '').toLowerCase() === s);
    if (exact) return exact;
    const hits = devices.filter(
      (d) => (d.name ?? '').toLowerCase().includes(s) || (d.id ?? '').toLowerCase().includes(s),
    );
    return hits.length === 1 ? hits[0] : null;  // 一意に決まる時だけ端末スコープにする
  }, [search, devices]);
  // ドロップダウンが優先。未指定なら検索で解決した端末を使う。
  const effectiveDeviceId = deviceFilter !== 'all' ? deviceFilter : (searchedDevice?.id ?? null);
  const deviceScoped = !!effectiveDeviceId;
  const scopedDeviceName =
    deviceFilter !== 'all'
      ? (devices.find((d) => d.id === deviceFilter)?.name ?? deviceFilter)
      : (searchedDevice?.name ?? '');
  // 検索が端末に解決しなかった語（顧客名・決済ID等）だけ、クライアント側で現ページを絞り込む。
  const clientFilterActive = !!search && !searchedDevice;

  // ── 売上リセット（運営 lv1_super 専用・破壊的）──
  type ResetResult = { deleted_draws: number; deleted_orders: number; deleted_coin_events: number; machines_reset: number };
  const [resetOpen, setResetOpen] = useState(false);
  const [resetCustomer, setResetCustomer] = useState('');
  const [resetDevice, setResetDevice] = useState('all');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

  const resetCustomerName = customers.find((c) => c.id === resetCustomer)?.name ?? '';
  const resetConfirmOk = !!resetCustomer && (resetConfirm === resetCustomerName || resetConfirm === 'RESET');

  const doReset = async () => {
    if (!resetConfirmOk) return;
    setResetting(true);
    setResetError(null);
    try {
      const res = await api.post<ResetResult>('/sales/reset', {
        customer_id: resetCustomer,
        device_id: resetDevice === 'all' ? null : resetDevice,
        confirm: resetConfirm,
      });
      setResetResult(res);
    } catch (e) {
      setResetError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  };

  // フィルタ → クエリ文字列（summary と list で共通）
  const buildParams = useCallback((includePaging: boolean): string => {
    const p = new URLSearchParams();
    if (kindFilter !== 'all') p.set('payment_method', kindFilter);
    if (providerFilter !== 'all') p.set('provider', providerFilter);  // storegroup2
    if (customerFilter !== 'all') p.set('customer_id', customerFilter);
    if (effectiveDeviceId) p.set('device_id', effectiveDeviceId);
    if (storeFilter !== 'all') p.set('store_id', storeFilter);
    if (groupFilter !== 'all') p.set('group_id', groupFilter);
    const fromUtc = jstDateToUtcStart(dateFrom);
    const toUtc = jstDateToUtcEnd(dateTo);
    if (fromUtc) p.set('date_from', fromUtc);
    if (toUtc) p.set('date_to', toUtc);
    // ★rankUD1: 未排出バナーON時はサーバー側で未排出だけに絞る。
    //   これで該当行が常に先頭ページに来る（従来は全イベントの時系列に埋もれ3〜4ページ目に出ていた）。
    if (onlyUndispensed) p.set('undispensed_only', '1');
    if (includePaging) {
      p.set('limit', String(PAGE_SIZE));
      p.set('offset', String(page * PAGE_SIZE));
    }
    return p.toString();
  }, [kindFilter, providerFilter, customerFilter, storeFilter, groupFilter, deviceFilter, effectiveDeviceId, dateFrom, dateTo, page, onlyUndispensed]);

  // 初回：顧客・端末リスト
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cu, dv, st, gr] = await Promise.all([
          api.get<{ items?: CustomerLite[] } | CustomerLite[]>('/customers?limit=200').catch(() => []),
          api.get<{ items?: DeviceLite[] } | DeviceLite[]>('/devices?limit=200').catch(() => []),
          api.get<{ items?: StoreLite[] } | StoreLite[]>('/stores?limit=200').catch(() => []),
          api.get<{ items?: GroupLite[] } | GroupLite[]>('/device-groups?limit=200').catch(() => []),
        ]);
        if (cancelled) return;
        setCustomers(Array.isArray(cu) ? cu : (cu.items ?? []));
        setDevices(Array.isArray(dv) ? dv : (dv.items ?? []));
        setStores(Array.isArray(st) ? st : (st.items ?? []));
        setGroups(Array.isArray(gr) ? gr : (gr.items ?? []));
      } catch (e) {
        console.error('[sales-events] meta fetch failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // summary（カード用）：フィルタ変更で再フェッチ。ページングは無関係
  const summaryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (kindFilter !== 'all') p.set('payment_method', kindFilter);
    if (customerFilter !== 'all') p.set('customer_id', customerFilter);
    if (effectiveDeviceId) p.set('device_id', effectiveDeviceId);
    if (storeFilter !== 'all') p.set('store_id', storeFilter);
    if (groupFilter !== 'all') p.set('group_id', groupFilter);
    const fromUtc = jstDateToUtcStart(dateFrom);
    const toUtc = jstDateToUtcEnd(dateTo);
    if (fromUtc) p.set('date_from', fromUtc);
    if (toUtc) p.set('date_to', toUtc);
    return p.toString();
  }, [kindFilter, customerFilter, storeFilter, groupFilter, deviceFilter, effectiveDeviceId, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // payment_method は summary が受け取らない設計のため除外して送る
        const sp = new URLSearchParams(summaryParams);
        sp.delete('payment_method');
        const sumQs = sp.toString() ? `?${sp.toString()}` : '';
        const sum = await api.get<SummaryResp>(`/sales-events/summary${sumQs}`);
        if (!cancelled) setSummary(sum);
      } catch (e) {
        console.error('[sales-events] summary fetch failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [summaryParams]);

  // S213: 端末別 現金内訳。summary と同じフィルタで再フェッチ。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sp = new URLSearchParams(summaryParams);
        sp.delete('payment_method');
        const qs = sp.toString() ? `?${sp.toString()}` : '';
        const rows = await api.get<DeviceCashRow[]>(`/sales-events/by-device${qs}`);
        if (!cancelled) setByDevice(Array.isArray(rows) ? rows : []);
      } catch (e) {
        console.error('[sales-events] by-device fetch failed:', e);
        if (!cancelled) setByDevice([]);
      }
    })();
    return () => { cancelled = true; };
  }, [summaryParams]);

  // list（テーブル用）：フィルタ or ページ変更で再フェッチ
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRefreshing(true);
      try {
        const qs = buildParams(true);
        const resp = await api.get<ListResp | SalesEvent[]>(`/sales-events?${qs}`);
        if (cancelled) return;
        // ★rankUD1: 未排出(課金済み・排出なし)は運営(lv1_super)のみに表示。
        //   顧客(lv1_super以外)には is_undispensed を落とし、バナー/バッジ/対応ボタンを一切出さない(通常売上として表示)。
        const _hideUndisp = (list: SalesEvent[]) => isSuper ? list : list.map((e) => ({ ...e, is_undispensed: false }));
        if (Array.isArray(resp)) {
          setEvents(_hideUndisp(resp));
          setTotal(resp.length);
          setUndispensed({ count: 0, yen: 0 });
        } else {
          setEvents(_hideUndisp(resp.items ?? []));
          setTotal(resp.total ?? (resp.items?.length ?? 0));
          setUndispensed(isSuper ? { count: resp.undispensed_count ?? 0, yen: resp.undispensed_yen ?? 0 } : { count: 0, yen: 0 });
        }
      } catch (e) {
        console.error('[sales-events] list fetch failed:', e);
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [buildParams, refreshTick, isSuper]);

  // ★rankSR1: 未排出(課金済み・排出なし)を「対応済み」にする(会計影響なし・アラートから消すだけ)。
  async function handleResolve(orderId: string) {
    setResolving(orderId);
    try {
      await api.post(`/orders/${orderId}/resolve-dispense`);
      setRefreshTick((t) => t + 1);  // 一覧＋バナー件数を再取得
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem?.detail || e.problem?.title || e.message) : String(e);
      window.alert(t.resolveFailed(msg));
    } finally {
      setResolving(null);
    }
  }

  // フィルタを変えたら1ページ目へ戻す（★rankUD1: 未排出バナーのON/OFFでも先頭ページへ）
  useEffect(() => { setPage(0); }, [kindFilter, providerFilter, customerFilter, storeFilter, groupFilter, deviceFilter, effectiveDeviceId, dateFrom, dateTo, onlyUndispensed]);

  // 検索が端末に解決した場合はサーバー側で既に絞り込み済み。それ以外の語だけクライアント絞り込み。
  const visible = useMemo(() => {
    let list = events;
    if (clientFilterActive) {
      const s = search.toLowerCase();
      list = list.filter((e) =>
        e.device_name.toLowerCase().includes(s) ||
        e.customer_name.toLowerCase().includes(s) ||
        (e.group_names ?? []).some((g) => g.toLowerCase().includes(s)) ||
        (e.payment_id ?? '').toLowerCase().includes(s)
      );
    }
    if (onlyUndispensed) list = list.filter((e) => e.is_undispensed);  // ★rankSR1: 未排出のみ
    return list;
  }, [events, search, clientFilterActive, onlyUndispensed]);

  // S229: 検索ボックスは端末別 売上内訳も同じ語で絞り込む（端末名 / 端末ID / 顧客名）。
  const visibleByDevice = useMemo(() => {
    if (!clientFilterActive) return byDevice;
    const s = search.toLowerCase();
    return byDevice.filter((r) =>
      (r.device_name ?? '').toLowerCase().includes(s) ||
      (r.device_id ?? '').toLowerCase().includes(s) ||
      (r.customer_name ?? '').toLowerCase().includes(s)
    );
  }, [byDevice, search, clientFilterActive]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

  const generateReport = useCallback(async () => {
    let daily: Array<{ date: string; qr_revenue_yen: number; cash_revenue_yen: number; revenue_yen: number; medal_count: number }> = [];
    let days = 365;
    if (dateFrom && dateTo) {
      const d1 = new Date(dateFrom).getTime();
      const d2 = new Date(dateTo).getTime();
      if (!isNaN(d1) && !isNaN(d2) && d2 >= d1) days = Math.min(365, Math.max(1, Math.round((d2 - d1) / 86400000) + 1));
    }
    try {
      const sp = new URLSearchParams();
      if (customerFilter !== 'all') sp.set('customer_id', customerFilter);
      sp.set('days', String(days));
      const r = await api.get<typeof daily>(`/stats/sales?${sp.toString()}`);
      daily = Array.isArray(r) ? r : [];
    } catch (e) {
      console.error('[report] stats/sales failed:', e);
    }

    const esc = (s: string) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const custName = customerFilter === 'all' ? t.allCustomersReport : (customers.find((c) => c.id === customerFilter)?.name ?? customerFilter);
    const groupName = groupFilter === 'all' ? '' : (groups.find((g) => g.id === groupFilter)?.name ?? groupFilter);
    const storeName = storeFilter === 'all' ? '' : (stores.find((s) => s.id === storeFilter)?.name ?? storeFilter);
    const machineName = effectiveDeviceId ? (devices.find((d) => d.id === effectiveDeviceId)?.name ?? effectiveDeviceId) : '';
    const kindLabel = kindFilter === 'all' ? '' : (kindFilter === 'qr' ? t.kindQr : kindFilter === 'cash' ? t.kindCash : kindFilter === 'token' ? t.kindMedal : kindFilter);
    const periodLabel = (dateFrom || dateTo) ? t.periodRange(dateFrom || t.dash, dateTo || t.dash) : t.allPeriod;
    const issued = new Date().toLocaleString(t.dateLocale, { timeZone: 'Asia/Tokyo' });
    const yen = (n: number) => '¥' + (n ?? 0).toLocaleString('ja-JP');

    const condParts: string[] = [t.condCustomer(esc(custName))];
    if (groupName) condParts.push(t.condGroup(esc(groupName)));
    if (storeName) condParts.push(t.condStore(esc(storeName)));
    if (machineName) condParts.push(t.condMachine(esc(machineName)));
    if (kindLabel) condParts.push(t.condKind(kindLabel));
    condParts.push(t.condPeriod(periodLabel));
    condParts.push(t.condIssued(issued));
    const condHtml = condParts.join('<br>');

    const mrows = byDevice.map((r) => `
      <tr>
        <td>${esc(r.device_name || r.device_id)}</td>
        <td class="num">${yen(r.cash_total)}</td>
        <td class="num">${yen(r.qr_total ?? 0)}</td>
        <td class="num strong">${yen(r.total_sales ?? (r.cash_total + (r.qr_total ?? 0)))}</td>
        <td class="num">${(r.medal_count ?? 0).toLocaleString('ja-JP')}</td>
      </tr>`).join('');
    const mtot = byDevice.reduce((a, r) => ({
      cash: a.cash + (r.cash_total || 0),
      qr: a.qr + (r.qr_total || 0),
      total: a.total + (r.total_sales ?? ((r.cash_total || 0) + (r.qr_total || 0))),
      medal: a.medal + (r.medal_count || 0),
    }), { cash: 0, qr: 0, total: 0, medal: 0 });

    const dailyRows = daily.map((d) => `
      <tr>
        <td>${d.date}</td>
        <td class="num">${yen(d.qr_revenue_yen)}</td>
        <td class="num">${yen(d.cash_revenue_yen)}</td>
        <td class="num strong">${yen(d.revenue_yen)}</td>
        <td class="num">${(d.medal_count ?? 0).toLocaleString('ja-JP')}</td>
      </tr>`).join('');
    const dailyTotal = daily.reduce((a, d) => ({
      qr: a.qr + (d.qr_revenue_yen || 0),
      cash: a.cash + (d.cash_revenue_yen || 0),
      rev: a.rev + (d.revenue_yen || 0),
      medal: a.medal + (d.medal_count || 0),
    }), { qr: 0, cash: 0, rev: 0, medal: 0 });

    const html = `<!DOCTYPE html>
<html lang="${t.htmlLang}"><head><meta charset="utf-8"><title>${t.reportTitle}</title>
<style>
  * { font-family: "ヒラギノ角ゴ ProN", "Hiragino Kaku Gothic ProN", sans-serif; box-sizing: border-box; }
  body { margin: 0; padding: 32px 36px; color: #1a1a1a; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #c0392b; padding-bottom: 12px; margin-bottom: 20px; }
  .head .title { font-size: 20px; font-weight: 700; }
  .head .sub { font-size: 11px; color: #666; margin-top: 4px; line-height: 1.6; }
  .head .corp { text-align: right; font-size: 11px; color: #444; line-height: 1.6; }
  h2 { font-size: 13px; margin: 22px 0 8px; padding-left: 8px; border-left: 4px solid #c0392b; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; font-size: 11px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.strong { font-weight: 700; }
  tr.total td { background: #fafafa; font-weight: 700; border-top: 2px solid #c0392b; }
  .sum-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .cap { font-size: 10px; color: #888; margin: 2px 0 10px; }
  .foot { margin-top: 28px; font-size: 10px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { body { padding: 0; } @page { margin: 16mm; } }
</style></head>
<body>
  <div class="head">
    <div>
      <div class="title">${t.reportTitle}</div>
      <div class="sub">${condHtml}</div>
    </div>
    <div class="corp">${t.companyName}<br>${t.reportSub}</div>
  </div>

  <h2>${t.summary}</h2>
  <div class="sum-grid">
    <table>
      <tr><th colspan="2">${t.todayCol}</th></tr>
      <tr><td>${t.cashSales}</td><td class="num">${yen(summary.today.cash_yen)}</td></tr>
      <tr><td>${t.qrSales}</td><td class="num">${yen(summary.today.qr_yen)}</td></tr>
      <tr><td>${t.totalSales}</td><td class="num strong">${yen(summary.today.total_yen)}</td></tr>
      <tr><td>${t.medalInserted}</td><td class="num">${(summary.today.medal_count ?? 0).toLocaleString('ja-JP')}</td></tr>
    </table>
    <table>
      <tr><th colspan="2">${t.cumulativeCol}</th></tr>
      <tr><td>${t.cashSales}</td><td class="num">${yen(summary.cumulative.cash_yen)}</td></tr>
      <tr><td>${t.qrSales}</td><td class="num">${yen(summary.cumulative.qr_yen)}</td></tr>
      <tr><td>${t.totalSales}</td><td class="num strong">${yen(summary.cumulative.total_yen)}</td></tr>
      <tr><td>${t.medalInsertedTotal}</td><td class="num">${(summary.cumulative.medal_count ?? 0).toLocaleString('ja-JP')}</td></tr>
    </table>
  </div>

  <h2>${t.machineBreakdown}</h2>
  <table>
    <thead><tr><th>${t.colMachine}</th><th class="num">${t.cashSales}</th><th class="num">${t.colQrSales}</th><th class="num">${t.colTotal}</th><th class="num">${t.colMedalCount}</th></tr></thead>
    <tbody>
      ${mrows || `<tr><td colspan="5" style="text-align:center;color:#999;">${t.noMachineData}</td></tr>`}
      <tr class="total"><td>${t.totalMachines(byDevice.length)}</td><td class="num">${yen(mtot.cash)}</td><td class="num">${yen(mtot.qr)}</td><td class="num">${yen(mtot.total)}</td><td class="num">${mtot.medal.toLocaleString('ja-JP')}</td></tr>
    </tbody>
  </table>

  <h2>${t.dailyTrend}</h2>
  <div class="cap">${t.dailyCaption}</div>
  <table>
    <thead><tr><th>${t.colDate}</th><th class="num">${t.colQrSales}</th><th class="num">${t.cashSales}</th><th class="num">${t.colTotal}</th><th class="num">${t.colMedalCount}</th></tr></thead>
    <tbody>
      ${dailyRows || `<tr><td colspan="5" style="text-align:center;color:#999;">${t.noData}</td></tr>`}
      <tr class="total"><td>${t.totalLabel}</td><td class="num">${yen(dailyTotal.qr)}</td><td class="num">${yen(dailyTotal.cash)}</td><td class="num">${yen(dailyTotal.rev)}</td><td class="num">${dailyTotal.medal.toLocaleString('ja-JP')}</td></tr>
    </tbody>
  </table>

  <div class="foot">${t.reportFoot}</div>
  <script>window.onload = function() { setTimeout(function(){ window.print(); }, 300); };</script>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { window.alert(t.popupBlocked); return; }
    w.document.write(html);
    w.document.close();
  }, [summary, customerFilter, customers, dateFrom, dateTo, byDevice, deviceFilter, groupFilter, storeFilter, groups, stores, devices, effectiveDeviceId, kindFilter, t]);

  type _LedgerRow = { month: string; order_count: number; gross_yen: number; after_fee_yen: number; carried_in_yen: number; running_total_yen: number; is_transfer: boolean; transfer_done: boolean; transfer_fee_yen: number; transfer_yen: number; carried_out_yen: number; pay_date: string; is_provisional: boolean };
  type _Ledger = { customer_id: string; customer_name: string; rows: _LedgerRow[]; total_transferred_yen: number; total_scheduled_yen: number; outstanding_carry_yen: number; machines?: { device_id: string; device_name: string; qr_yen: number }[] };

  const generatePayoutStatement = useCallback(async () => {
    let ledgers: _Ledger[] = [];
    try {
      const sp = new URLSearchParams();
      if (customerFilter !== 'all') sp.set('customer_id', customerFilter);
      if (groupFilter !== 'all') sp.set('group_id', groupFilter);
      if (storeFilter !== 'all') sp.set('store_id', storeFilter);
      if (effectiveDeviceId) sp.set('device_id', effectiveDeviceId);
      const fromUtc = jstDateToUtcStart(dateFrom);
      const toUtc = jstDateToUtcEnd(dateTo);
      if (fromUtc) sp.set('date_from', fromUtc);
      if (toUtc) sp.set('date_to', toUtc);
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      ledgers = await api.get<_Ledger[]>(`/sales-events/payout-ledger${qs}`);
    } catch {
      window.alert(t.ledgerFetchFailed);
      return;
    }
    if (!ledgers || ledgers.length === 0) { window.alert(t.noSalesData); return; }
    const esc = (s: string) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const issued = new Date().toLocaleString(t.dateLocale, { timeZone: 'Asia/Tokyo' });
    const yen = (n: number) => '¥' + (n ?? 0).toLocaleString('ja-JP');
    const ymL = (v: string) => v ? t.ymLabel(v.slice(0, 4), v.slice(5, 7)) : t.dash;
    const groupName = groupFilter === 'all' ? '' : (groups.find((g) => g.id === groupFilter)?.name ?? groupFilter);
    const storeName = storeFilter === 'all' ? '' : (stores.find((s) => s.id === storeFilter)?.name ?? storeFilter);
    const machineName = effectiveDeviceId ? (devices.find((d) => d.id === effectiveDeviceId)?.name ?? effectiveDeviceId) : '';
    const periodLabel = (dateFrom || dateTo) ? t.periodRange(dateFrom || t.dash, dateTo || t.dash) : t.allPeriod;
    const condParts: string[] = [];
    void groupName; // グループは振込明細に記載しない（顧客/店舗/マシンのみ）
    if (storeName) condParts.push(t.condStore(esc(storeName)));
    if (machineName) condParts.push(t.condMachine(esc(machineName)));
    condParts.push(t.condPeriod(periodLabel));
    const condLine = condParts.length ? `<div class="cond">${t.filterPrefix}${condParts.join(' ／ ')}</div>` : '';
    const _nextMonthEnd = (ym: string) => {
      if (!ym || ym.length < 7) return '';
      const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
      const py = m === 12 ? y + 1 : y, pm = m === 12 ? 1 : m + 1;
      const last = new Date(py, pm, 0).getDate();
      return `${py}-${String(pm).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    };
    // 振込済み合計/繰越残高は「顧客スコープ」時のみ表示（グループ/店舗/マシン絞込や顧客未指定では過去別顧客ぶん累積を出さない）
    const isCustomerScope = (!isSuper || customerFilter !== 'all') && groupFilter === 'all' && storeFilter === 'all' && !effectiveDeviceId;
    const sections = ledgers.map((L) => {
      const rows = (L.rows || []).map((r) => {
        const state = r.is_provisional ? t.stateProvisional : (r.is_transfer ? (r.transfer_done ? t.stateTransferred : t.stateScheduled) : t.stateCarried);
        // 当月（暫定）でも累計が振込下限(¥10,000)以上なら翌月末の振込予定を表示
        const willPay = r.is_transfer || (r.is_provisional && (r.running_total_yen ?? 0) >= 10000);
        const feeCell = willPay ? yen(r.is_transfer ? r.transfer_fee_yen : 200) : '—';
        const amtCell = willPay ? yen(r.is_transfer ? r.transfer_yen : ((r.running_total_yen ?? 0) - 200)) : '—';
        const dateCell = r.pay_date || (willPay ? _nextMonthEnd(r.month) : '—');
        return `<tr><td>${ymL(r.month)}</td><td class="num">${(r.order_count ?? 0).toLocaleString('ja-JP')}</td><td class="num">${yen(r.gross_yen)}</td><td class="num">${yen(r.after_fee_yen)}</td><td class="num">${yen(r.carried_in_yen)}</td><td class="num">${yen(r.running_total_yen)}</td><td>${state}</td><td class="num">${feeCell}</td><td class="num strong">${amtCell}</td><td>${dateCell}</td></tr>`;
      }).join('');
      const machines = L.machines || [];
      const mrows = machines.map((m) => `<tr><td>${esc(m.device_name || m.device_id)}</td><td class="num strong">${yen(m.qr_yen)}</td></tr>`).join('');
      const mtotal = machines.reduce((a, m) => a + (m.qr_yen || 0), 0);
      const machineTable = machines.length
        ? `<div class="mtitle">${t.machineQrBreakdown}</div><table class="mtbl"><thead><tr><th>${t.colMachine}</th><th class="num">${t.colQrSales}</th></tr></thead><tbody>${mrows}<tr class="mtot"><td>${t.totalMachines(machines.length)}</td><td class="num strong">${yen(mtotal)}</td></tr></tbody></table>`
        : '';
      const nameHtml = isSuper
        ? `<span class="rcpt" contenteditable="true" spellcheck="false">${esc(L.customer_name || L.customer_id)}</span>${t.honorific}`
        : `${esc(L.customer_name || L.customer_id)}${t.honorific}`;
      const sumHtml = isCustomerScope
        ? `<div class="sum"><div>${t.transferredTotal}<strong>${yen(L.total_transferred_yen)}</strong></div>${(L.total_scheduled_yen ?? 0) > 0 ? `<div>${t.scheduledTotal}<strong>${yen(L.total_scheduled_yen)}</strong></div>` : ''}<div>${t.outstandingCarry}<strong>${yen(L.outstanding_carry_yen)}</strong></div></div>`
        : '';
      return `<div class="stmt"><div class="head"><div><div class="title">${t.statementTitle}</div><div class="sub">${nameHtml}<br>${t.issuedAt(issued)}</div>${condLine}</div><div class="corp">${t.companyName}<br>${t.payoutSub}<br>${t.invoiceNo}</div></div><div class="note">${t.payoutNote}</div><table><thead><tr><th>${t.colTargetMonth}</th><th class="num">${t.colOrderCount}</th><th class="num">${t.colTargetSales}</th><th class="num">${t.colAfterFee}</th><th class="num">${t.colCarried}</th><th class="num">${t.colRunning}</th><th>${t.colStatus}</th><th class="num">${t.colTransferFee}</th><th class="num">${t.colPayout}</th><th>${t.colPayDate}</th></tr></thead><tbody>${rows || `<tr><td colspan="10" style="text-align:center;color:#999;">${t.noTargetData}</td></tr>`}</tbody></table>${sumHtml}${machineTable}</div>`;
    }).join('');
    const toolbar = isSuper ? `<div class="toolbar no-print"><span>${t.toolbarNote}</span><button onclick="window.print()">${t.printSave}</button></div>` : '';
    const autoPrint = isSuper ? '' : '<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>';
    const html = `<!DOCTYPE html><html lang="${t.htmlLang}"><head><meta charset="utf-8"><title>${t.statementTitle}</title><style>* { font-family: "ヒラギノ角ゴ ProN", "Hiragino Kaku Gothic ProN", sans-serif; box-sizing: border-box; } body { margin:0; padding:28px 32px; color:#1a1a1a; font-size:12px; } .toolbar{position:sticky;top:0;background:#fff3cd;border:1px solid #ffe08a;padding:8px 12px;font-size:12px;margin-bottom:14px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;gap:12px;} .toolbar button{font:inherit;padding:6px 14px;border:none;border-radius:6px;background:#c0392b;color:#fff;cursor:pointer;white-space:nowrap;} .rcpt{outline:none;border-bottom:1px dashed #c0392b;padding:0 3px;min-width:140px;display:inline-block;} .rcpt:focus{background:#fff7f5;} .stmt{page-break-after:always;} .stmt:last-of-type{page-break-after:auto;} .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c0392b;padding-bottom:12px;margin-bottom:14px;} .head .title{font-size:20px;font-weight:700;} .head .sub{font-size:12px;color:#333;margin-top:6px;line-height:1.7;} .head .cond{font-size:11px;color:#c0392b;margin-top:4px;} .head .corp{text-align:right;font-size:11px;color:#444;line-height:1.6;} .note{font-size:10.5px;color:#555;line-height:1.7;margin-bottom:12px;} table{width:100%;border-collapse:collapse;margin-bottom:10px;} th,td{border:1px solid #ddd;padding:5px 8px;text-align:left;} th{background:#f5f5f5;font-weight:600;font-size:10.5px;} td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;} td.strong{font-weight:700;} .sum{display:flex;gap:28px;justify-content:flex-end;font-size:12px;margin-top:6px;} .mtitle{font-size:12px;font-weight:700;margin:14px 0 6px;padding-left:8px;border-left:4px solid #c0392b;} .mtbl{width:60%;} tr.mtot td{background:#fafafa;font-weight:700;border-top:2px solid #c0392b;} .foot{margin-top:20px;font-size:10px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:8px;} @media print{body{padding:0;} .no-print{display:none!important;} .rcpt{border-bottom:none;} @page{margin:12mm;size:A4 landscape;}}</style></head><body>${toolbar}${sections}<div class="foot">${t.payoutFoot}</div>${autoPrint}</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { window.alert(t.popupBlocked); return; }
    w.document.write(html); w.document.close();
  }, [customerFilter, groupFilter, storeFilter, effectiveDeviceId, dateFrom, dateTo, groups, stores, devices, isSuper, t]);

  if (loading) {
    return (
      <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const badgeToday = 'bg-primary/15 text-primary';
  const badgeCumulative = 'bg-sky-500/15 text-sky-400';

  return (
    <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
      {undispensed.count > 0 && (
        <button
          type="button"
          onClick={() => {
            setOnlyUndispensed(true);
            setTimeout(() => document.getElementById('sales-events-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
          }}
          className="mb-3 w-full text-left flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 hover:bg-red-500/15 transition-colors"
        >
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <span className="font-medium text-red-600 dark:text-red-400">
              {t.undispensedBanner(undispensed.count.toLocaleString(), fmtYen(undispensed.yen))}
            </span>
            <span className="ml-1 text-xs text-muted-foreground">
              {t.undispensedHint}
            </span>
          </div>
        </button>
      )}
      {onlyUndispensed && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="inline-flex items-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400 px-2.5 py-0.5 font-medium">{t.onlyUndispensed}</span>
          <button type="button" onClick={() => setOnlyUndispensed(false)} className="text-muted-foreground underline hover:text-foreground">{t.backToAll}</button>
        </div>
      )}
      <div className="flex justify-end gap-2 mb-3">
        <button onClick={() => void generatePayoutStatement()} className="h-9 px-4 rounded-md text-sm font-medium border border-primary text-primary hover:bg-primary/10 transition-colors">
          {t.payoutBtn}
        </button>
        <button onClick={() => void generateReport()} className="h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
          {t.reportBtn}
        </button>
      </div>
      {/* S224: サマリー折りたたみトグル */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground inline-flex items-center gap-2 flex-wrap">
          {t.salesSummary}
          {deviceScoped && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 px-2 py-0.5 text-[11px] font-medium">
              {t.scopedNote(scopedDeviceName)}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setSummaryOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded px-2 py-1 hover:bg-accent"
        >
          {summaryOpen ? <><ChevronUp className="h-4 w-4" />{t.close}</> : <><ChevronDown className="h-4 w-4" />{t.open}</>}
        </button>
      </div>
      {summaryOpen && (
        <>
          {/* 本日 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <SalesCard
              label={t.cardSales} badge={t.cardToday} badgeClass={badgeToday}
              totalYen={summary.today.total_yen}
              cashYen={summary.today.cash_yen}
              qrYen={summary.today.qr_yen}
              accentClass="text-primary"
            />
            <MedalCard
              label={t.cardMedalCount} badge={t.cardToday} badgeClass={badgeToday}
              count={summary.today.medal_count}
            />
          </div>
          {/* 累計 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <SalesCard
              label={t.cardPeriodSales}
              badge={(dateFrom || dateTo) ? t.periodRange(dateFrom || t.rangeFirst, dateTo || t.rangeNow) : t.allPeriod}
              badgeClass={badgeCumulative}
              totalYen={summary.cumulative.total_yen}
              cashYen={summary.cumulative.cash_yen}
              qrYen={summary.cumulative.qr_yen}
              accentClass="text-sky-400"
            />
            <MedalCard
              label={t.cardMedalTotal}
              badge={(dateFrom || dateTo) ? t.periodRange(dateFrom || t.rangeFirst, dateTo || t.rangeNow) : t.allPeriod}
              badgeClass={badgeCumulative}
              count={summary.cumulative.medal_count}
            />
          </div>
        </>
      )}

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KIND_VALUES.map((k) => (
                <SelectItem key={k} value={k}>{kindLabelOf(k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* storegroup2: QRのPSP絞り込み(PayPay/クレカ/PayPal/Square) */}
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder={t.providerPh} /></SelectTrigger>
            <SelectContent>
              {PROVIDER_VALUES.map((pv) => (
                <SelectItem key={pv} value={pv}>{pv === 'all' ? t.provAll : providerLabelOf(pv, t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSuper && (
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder={t.allCustomersPh} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.allCustomers}</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder={t.allStoresPh} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.allStores}</SelectItem>
              {stores.map((st) => (
                <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder={t.allGroupsPh} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.allGroups}</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder={t.allDevicesPh} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.allDevices}</SelectItem>
              {devices.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Input
              type="date" value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 text-xs w-[140px]"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date" value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 text-xs w-[140px]"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline"
              >{t.clear}</button>
            )}
          </div>
          {isSuper && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => {
                setResetCustomer(customerFilter !== 'all' ? customerFilter : '');
                setResetDevice('all');
                setResetConfirm('');
                setResetError(null);
                setResetResult(null);
                setResetOpen(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> {t.salesReset}
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
            {deviceScoped
              ? <>{t.scopedListCount(scopedDeviceName, total.toLocaleString())}</>
              : <>{t.listCount(total.toLocaleString())}</>}
          </div>
        </CardContent>
      </Card>

      {byDevice.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">{t.byDeviceTitle}</span>
              {search && (
                <span className="text-[11px] text-sky-500">{t.filteringBy(search, visibleByDevice.length)}</span>
              )}
              <span className="text-[11px] text-muted-foreground">{t.byDeviceNote}</span>
              <button
                type="button"
                onClick={() => setByDeviceOpen((o) => !o)}
                aria-label={byDeviceOpen ? t.closeTable : t.openTable}
                className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded px-2 py-1 hover:bg-accent"
              >
                {byDeviceOpen ? <><ChevronUp className="h-4 w-4" />{t.close}</> : <><ChevronDown className="h-4 w-4" />{t.open}</>}
              </button>
            </div>
            {byDeviceOpen && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left font-normal py-1.5 pr-3">{t.colDevice}</th>
                    <th className="text-right font-normal py-1.5 px-3">{t.col100}</th>
                    <th className="text-right font-normal py-1.5 px-3">{t.col500}</th>
                    <th className="text-right font-normal py-1.5 px-3">{t.colCashTotal}</th>
                    <th className="text-right font-normal py-1.5 px-3">{t.colCashless}</th>
                    <th className="text-right font-normal py-1.5 pl-3">{t.colCumSales}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleByDevice.length === 0 && (
                    <tr><td colSpan={6} className="py-3 text-center text-muted-foreground">{t.noMatchDevice(search)}</td></tr>
                  )}
                  {visibleByDevice.map((r) => (
                    <tr key={r.device_id} className="border-b last:border-0">
                      <td className="py-1.5 pr-3">{r.device_name || r.device_id}</td>
                      <td className="text-right tabular-nums py-1.5 px-3">
                        {r.yen100_count > 0
                          ? <><span className="text-amber-600 font-medium">{r.yen100_count}{t.coinUnit}</span> <span className="text-muted-foreground">/ {fmtYen(r.yen100_sum)}</span></>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-right tabular-nums py-1.5 px-3">
                        {r.yen500_count > 0
                          ? <>{r.yen500_count}{t.coinUnit} <span className="text-muted-foreground">/ {fmtYen(r.yen500_sum)}</span></>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-right tabular-nums py-1.5 px-3 text-amber-500">{r.cash_total > 0 ? fmtYen(r.cash_total) : '—'}</td>
                      <td className="text-right tabular-nums py-1.5 px-3 text-emerald-500">{(r.qr_total ?? 0) > 0 ? fmtYen(r.qr_total ?? 0) : '—'}</td>
                      <td className="text-right tabular-nums py-1.5 pl-3 font-semibold">{fmtYen(r.total_sales ?? (r.cash_total + (r.qr_total ?? 0)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card id="sales-events-list">
        <div className="md:hidden divide-y divide-border">
          {visible.map((e) => (
            <div key={e.event_id} className={`p-3 space-y-1.5 ${e.is_undispensed ? 'bg-red-500/5' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="mb-1"><KindBadge e={e} /></div>
                  <div className="text-xs">{e.customer_name}</div>
                  {e.group_names && e.group_names.length > 0 && (
                    <div className="text-[10px] text-muted-foreground truncate">{e.group_names.join(' / ')}</div>
                  )}
                  <div className="text-[10.5px] text-muted-foreground">{e.device_name}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular-nums text-sm font-medium">
                    {e.kind === 'token'
                      ? <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3 text-amber-400" />{e.token_count} {t.tokenUnit}</span>
                      : <span className={e.is_undispensed ? 'text-red-600 dark:text-red-400' : undefined}>{fmtYen(e.amount_yen ?? 0)}</span>}
                  </div>
                  <div className="mt-1 text-xs">
                    {e.is_undispensed
                      ? <span className="text-red-600 dark:text-red-400 font-medium">{t.undispensed}</span>
                      : e.kind === 'token'
                        ? <span className="text-muted-foreground">—</span>
                        : <span className="text-muted-foreground">{t.dispensed}</span>}
                  </div>
                  {e.is_undispensed && (
                    <div className="mt-1">
                      <Button
                        size="sm" variant="outline"
                        className="h-6 px-2 text-[11px]"
                        disabled={resolving === e.event_id}
                        onClick={() => handleResolve(e.event_id)}
                      >
                        {resolving === e.event_id ? <Loader2 className="h-3 w-3 animate-spin" /> : t.markResolved}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono truncate">{e.payment_id ? e.payment_id : '-'}</span>
                <span className="shrink-0">{fmtDate(e.occurred_at)}</span>
              </div>
            </div>
          ))}
          {visible.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">{t.noEvents}</div>
          )}
        </div>
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.colKind}</TableHead>
              <TableHead>{t.colPaymentId}</TableHead>
              <TableHead>{t.colCustomerGroup}</TableHead>
              <TableHead>{t.colDevice}</TableHead>
              <TableHead className="text-right">{t.colAmount}</TableHead>
              <TableHead>{t.colStatus}</TableHead>
              <TableHead>{t.colDatetime}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((e) => (
              <TableRow key={e.event_id} className={e.is_undispensed ? 'bg-red-500/5' : undefined}>
                <TableCell><KindBadge e={e} /></TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">
                  {e.payment_id ? e.payment_id : '-'}
                </TableCell>
                <TableCell className="text-xs">
                  {e.customer_name}
                  {e.group_names && e.group_names.length > 0 && (
                    <span className="block text-[10px] text-muted-foreground">
                      {e.group_names.join(' / ')}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs">{e.device_name}</TableCell>
                <TableCell className="text-right tabular-nums text-sm font-medium">
                  {e.kind === 'token'
                    ? <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3 text-amber-400" />{e.token_count} {t.tokenUnit}</span>
                    : <span className={e.is_undispensed ? 'text-red-600 dark:text-red-400' : undefined}>{fmtYen(e.amount_yen ?? 0)}</span>}
                </TableCell>
                <TableCell className="text-xs">
                  {e.is_undispensed
                    ? (
                      <div className="flex items-center gap-2">
                        <span className="text-red-600 dark:text-red-400 font-medium">{t.undispensed}</span>
                        <Button
                          size="sm" variant="outline"
                          className="h-6 px-2 text-[11px]"
                          disabled={resolving === e.event_id}
                          onClick={() => handleResolve(e.event_id)}
                        >
                          {resolving === e.event_id ? <Loader2 className="h-3 w-3 animate-spin" /> : t.markResolved}
                        </Button>
                      </div>
                    )
                    : e.kind === 'token'
                      ? <span className="text-muted-foreground">—</span>
                      : <span className="text-muted-foreground">{t.dispensed}</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(e.occurred_at)}
                </TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">
                  {t.noEvents}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
        {/* ページネーション */}
        <div className="border-t p-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {total === 0 ? t.zeroCount : t.listRange(rangeStart.toLocaleString(), rangeEnd.toLocaleString(), total.toLocaleString())}
            {clientFilterActive && t.matchCount(visible.length)}
            {deviceScoped && <span className="ml-2 text-sky-600 dark:text-sky-400">{t.playCountNote}</span>}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted/50"
            >
              <ChevronLeft className="h-3.5 w-3.5" />{t.prev}
            </button>
            <span className="tabular-nums">{page + 1} / {pageCount}</span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted/50"
            >
              {t.next}<ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </Card>

      {isSuper && (
        <Dialog open={resetOpen} onOpenChange={(o) => { if (!resetting) setResetOpen(o); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive">{t.resetTitle}</DialogTitle>
              <DialogDescription>
                {t.resetDesc}
              </DialogDescription>
            </DialogHeader>
            {resetResult ? (
              <div className="space-y-2 py-2 text-sm">
                <p className="text-ok font-medium">{t.resetDone}</p>
                <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t.deletedDraws}</span><span>{resetResult.deleted_draws.toLocaleString()}{t.countUnit}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t.deletedOrders}</span><span>{resetResult.deleted_orders.toLocaleString()}{t.countUnit}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t.deletedCoins}</span><span>{resetResult.deleted_coin_events.toLocaleString()}{t.countUnit}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t.resetMachines}</span><span>{resetResult.machines_reset.toLocaleString()}{t.unitMachines}</span></div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium">{t.customerLabel}<span className="text-destructive"> *</span></label>
                  <Select value={resetCustomer} onValueChange={(v) => { setResetCustomer(v); setResetDevice('all'); setResetConfirm(''); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t.selectCustomer} /></SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">{t.machineOptional}</label>
                  <Select value={resetDevice} onValueChange={setResetDevice} disabled={!resetCustomer}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t.wholeCustomer} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.wholeCustomer}</SelectItem>
                      {devices.filter((d) => !d.customer_id || d.customer_id === resetCustomer).map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">
                    {t.confirmPre}<span className="font-mono text-destructive">{resetCustomer ? resetCustomerName : 'RESET'}</span>{t.confirmPost}
                  </label>
                  <Input value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder={t.confirmPlaceholder} className="h-9" />
                </div>
                {resetError && <p className="text-xs text-destructive">{resetError}</p>}
              </div>
            )}
            <DialogFooter>
              {resetResult ? (
                <Button onClick={() => { setResetOpen(false); window.location.reload(); }}>{t.close}</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>{t.cancel}</Button>
                  <Button variant="destructive" disabled={resetting || !resetConfirmOk} onClick={doReset}>
                    {resetting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                    {t.doReset}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}
