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
import { api } from '@/lib/api';
import { Loader2, Search, Coins, ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtYen, fmtDate } from '@/lib/format';
import type { SalesEvent } from '@/types/domain';

interface CustomerLite { id: string; name: string }
interface DeviceLite { id: string; name: string }

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
interface ListResp {
  items: SalesEvent[];
  total: number;
  offset: number;
  limit: number;
}

const PAGE_SIZE = 200;

const KINDS: { value: string; label: string }[] = [
  { value: 'all', label: '全決済種別' },
  { value: 'qr', label: 'QR決済' },
  { value: 'cash', label: '現金' },
  { value: 'token', label: 'トークンメダル' },
];

const EMPTY_BUCKET: SummaryBucket = { cash_yen: 0, qr_yen: 0, total_yen: 0, medal_count: 0 };

function fmtBreakdown(bd?: Record<string, number> | null): string | null {
  if (!bd) return null;
  const parts = Object.entries(bd)
    .filter(([, n]) => n > 0)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([yen, n]) => `${yen}円×${n}`);
  return parts.length ? parts.join(', ') : null;
}

function KindBadge({ kind }: { kind: SalesEvent['kind'] }) {
  if (kind === 'qr') return <Badge variant="ok">QR決済</Badge>;
  if (kind === 'cash') return <Badge variant="warn">現金</Badge>;
  return <Badge variant="muted">トークンメダル</Badge>;
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
            <span className="text-muted-foreground">現金売上分</span>
            <span className="tabular-nums text-amber-400 font-medium">{fmtYen(cashYen)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">QR売上分</span>
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
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-muted-foreground">{label}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeClass}`}>{badge}</span>
        </div>
        <div className="text-2xl font-bold tabular-nums text-amber-400 inline-flex items-center gap-1.5">
          <Coins className="h-5 w-5" />{count.toLocaleString()} <span className="text-base font-medium">枚</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SalesEventsPage() {
  const [events, setEvents] = useState<SalesEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [devices, setDevices] = useState<DeviceLite[]>([]);
  const [summary, setSummary] = useState<SummaryResp>({ today: EMPTY_BUCKET, cumulative: EMPTY_BUCKET });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);

  // フィルタ → クエリ文字列（summary と list で共通）
  const buildParams = useCallback((includePaging: boolean): string => {
    const p = new URLSearchParams();
    if (kindFilter !== 'all') p.set('payment_method', kindFilter);
    if (customerFilter !== 'all') p.set('customer_id', customerFilter);
    if (deviceFilter !== 'all') p.set('device_id', deviceFilter);
    const fromUtc = jstDateToUtcStart(dateFrom);
    const toUtc = jstDateToUtcEnd(dateTo);
    if (fromUtc) p.set('date_from', fromUtc);
    if (toUtc) p.set('date_to', toUtc);
    if (includePaging) {
      p.set('limit', String(PAGE_SIZE));
      p.set('offset', String(page * PAGE_SIZE));
    }
    return p.toString();
  }, [kindFilter, customerFilter, deviceFilter, dateFrom, dateTo, page]);

  // 初回：顧客・端末リスト
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cu, dv] = await Promise.all([
          api.get<{ items?: CustomerLite[] } | CustomerLite[]>('/customers?limit=200').catch(() => []),
          api.get<{ items?: DeviceLite[] } | DeviceLite[]>('/devices?limit=200').catch(() => []),
        ]);
        if (cancelled) return;
        setCustomers(Array.isArray(cu) ? cu : (cu.items ?? []));
        setDevices(Array.isArray(dv) ? dv : (dv.items ?? []));
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
    if (deviceFilter !== 'all') p.set('device_id', deviceFilter);
    const fromUtc = jstDateToUtcStart(dateFrom);
    const toUtc = jstDateToUtcEnd(dateTo);
    if (fromUtc) p.set('date_from', fromUtc);
    if (toUtc) p.set('date_to', toUtc);
    return p.toString();
  }, [kindFilter, customerFilter, deviceFilter, dateFrom, dateTo]);

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

  // list（テーブル用）：フィルタ or ページ変更で再フェッチ
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRefreshing(true);
      try {
        const qs = buildParams(true);
        const resp = await api.get<ListResp | SalesEvent[]>(`/sales-events?${qs}`);
        if (cancelled) return;
        if (Array.isArray(resp)) {
          setEvents(resp);
          setTotal(resp.length);
        } else {
          setEvents(resp.items ?? []);
          setTotal(resp.total ?? (resp.items?.length ?? 0));
        }
      } catch (e) {
        console.error('[sales-events] list fetch failed:', e);
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [buildParams]);

  // フィルタを変えたら1ページ目へ戻す
  useEffect(() => { setPage(0); }, [kindFilter, customerFilter, deviceFilter, dateFrom, dateTo]);

  // 検索はクライアント側（現ページ内の絞り込み）
  const visible = useMemo(() => {
    if (!search) return events;
    const s = search.toLowerCase();
    return events.filter((e) =>
      e.device_name.toLowerCase().includes(s) ||
      e.customer_name.toLowerCase().includes(s) ||
      (e.payment_id ?? '').toLowerCase().includes(s)
    );
  }, [events, search]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

  if (loading) {
    return (
      <AppShell title="売上管理" breadcrumb={['ホーム', '売上管理']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const badgeToday = 'bg-primary/15 text-primary';
  const badgeCumulative = 'bg-sky-500/15 text-sky-400';

  return (
    <AppShell title="売上管理" breadcrumb={['ホーム', '売上管理']}>
      {/* 本日 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <SalesCard
          label="売上" badge="本日" badgeClass={badgeToday}
          totalYen={summary.today.total_yen}
          cashYen={summary.today.cash_yen}
          qrYen={summary.today.qr_yen}
          accentClass="text-primary"
        />
        <MedalCard
          label="メダル投入数" badge="本日" badgeClass={badgeToday}
          count={summary.today.medal_count}
        />
      </div>
      {/* 累計 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <SalesCard
          label="総売上" badge="累計" badgeClass={badgeCumulative}
          totalYen={summary.cumulative.total_yen}
          cashYen={summary.cumulative.cash_yen}
          qrYen={summary.cumulative.qr_yen}
          accentClass="text-sky-400"
        />
        <MedalCard
          label="メダル投入総数" badge="累計" badgeClass={badgeCumulative}
          count={summary.cumulative.medal_count}
        />
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="端末名 / 顧客名 / 決済ID ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="全顧客" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全ての顧客</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="全端末" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全ての端末</SelectItem>
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
            <span className="text-xs text-muted-foreground">〜</span>
            <Input
              type="date" value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 text-xs w-[140px]"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline"
              >クリア</button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
            全 {total.toLocaleString()} 件
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>決済種別</TableHead>
              <TableHead>決済ID</TableHead>
              <TableHead>顧客</TableHead>
              <TableHead>端末</TableHead>
              <TableHead className="text-right">金額 / 枚数</TableHead>
              <TableHead>日時</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((e) => (
              <TableRow key={e.event_id}>
                <TableCell><KindBadge kind={e.kind} /></TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">
                  {e.kind === 'qr' && e.payment_id ? e.payment_id : '-'}
                </TableCell>
                <TableCell className="text-xs">{e.customer_name}</TableCell>
                <TableCell className="text-xs">{e.device_name}</TableCell>
                <TableCell className="text-right tabular-nums text-sm font-medium">
                  {e.kind === 'token'
                    ? <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3 text-amber-400" />{e.token_count} 枚</span>
                    : (
                      <div className="flex flex-col items-end leading-tight">
                        <span>{fmtYen(e.amount_yen ?? 0)}</span>
                        {e.kind === 'cash' && fmtBreakdown(e.metadata?.breakdown) && (
                          <span className="text-[10px] font-normal text-muted-foreground tabular-nums">
                            {fmtBreakdown(e.metadata?.breakdown)}
                          </span>
                        )}
                      </div>
                    )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(e.occurred_at)}
                </TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-12">
                  該当する売上イベントがありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {/* ページネーション */}
        <div className="border-t p-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {total === 0 ? '0 件' : `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} / ${total.toLocaleString()} 件`}
            {search && `（うち検索一致 ${visible.length} 件）`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted/50"
            >
              <ChevronLeft className="h-3.5 w-3.5" />前へ
            </button>
            <span className="tabular-nums">{page + 1} / {pageCount}</span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted/50"
            >
              次へ<ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
