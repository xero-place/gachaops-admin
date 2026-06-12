
'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { Loader2, Search, Coins } from 'lucide-react';
import { fmtYen, fmtDate } from '@/lib/format';
import type { SalesEvent } from '@/types/domain';

interface CustomerLite { id: string; name: string }
interface DeviceLite { id: string; name: string }

const KINDS: { value: string; label: string }[] = [
  { value: 'all', label: '全決済種別' },
  { value: 'qr', label: 'QR決済' },
  { value: 'cash', label: '現金' },
  { value: 'token', label: 'トークンメダル' },
];

function KindBadge({ kind }: { kind: SalesEvent['kind'] }) {
  if (kind === 'qr') return <Badge variant="ok">QR決済</Badge>;
  if (kind === 'cash') return <Badge variant="warn">現金</Badge>;
  return <Badge variant="muted">トークンメダル</Badge>;
}

function KpiCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const color =
    accent === 'primary' ? 'text-primary'
    : accent === 'ok' ? 'text-emerald-400'
    : accent === 'warn' ? 'text-amber-400' : '';
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
        <div className={`text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

export default function SalesEventsPage() {
  const [events, setEvents] = useState<SalesEvent[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [devices, setDevices] = useState<DeviceLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [deviceFilter, setDeviceFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ev, cu, dv] = await Promise.all([
          api.get<{ items?: SalesEvent[] } | SalesEvent[]>('/sales-events?limit=500'),
          api.get<{ items?: CustomerLite[] } | CustomerLite[]>('/customers?limit=200').catch(() => []),
          api.get<{ items?: DeviceLite[] } | DeviceLite[]>('/devices?limit=200').catch(() => []),
        ]);
        if (cancelled) return;
        setEvents(Array.isArray(ev) ? ev : (ev.items ?? []));
        setCustomers(Array.isArray(cu) ? cu : (cu.items ?? []));
        setDevices(Array.isArray(dv) ? dv : (dv.items ?? []));
      } catch (e) {
        console.error('[sales-events] fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (kindFilter !== 'all' && e.kind !== kindFilter) return false;
      if (customerFilter !== 'all' && e.customer_id !== customerFilter) return false;
      if (deviceFilter !== 'all' && e.device_id !== deviceFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !e.device_name.toLowerCase().includes(s) &&
          !e.customer_name.toLowerCase().includes(s) &&
          !(e.payment_id ?? '').toLowerCase().includes(s)
        ) return false;
      }
      return true;
    });
  }, [events, search, kindFilter, customerFilter, deviceFilter]);

  const totals = useMemo(() => {
    const yen = filtered
      .filter((e) => e.kind === 'qr' || e.kind === 'cash')
      .reduce((a, e) => a + (e.amount_yen ?? 0), 0);
    const tokens = filtered
      .filter((e) => e.kind === 'token')
      .reduce((a, e) => a + (e.token_count ?? 0), 0);
    return { count: filtered.length, yen, tokens };
  }, [filtered]);

  if (loading) {
    return (
      <AppShell title="売上管理" breadcrumb={['ホーム', '売上管理']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="売上管理" breadcrumb={['ホーム', '売上管理']}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KpiCell label="表示中" value={totals.count.toString()} />
        <KpiCell label="売上 (現金+QR・絞込分)" value={fmtYen(totals.yen)} accent="primary" />
        <KpiCell label="メダル投入 (絞込分)" value={`${totals.tokens} 枚`} accent="warn" />
        <KpiCell label="全顧客横断" value="運営" accent="ok" />
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="端末名 / 顧客名 / 決済ID ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="全顧客" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全ての顧客</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="全端末" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全ての端末</SelectItem>
              {devices.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} / {events.length} 件
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
            {filtered.slice(0, 200).map((e) => (
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
                    : fmtYen(e.amount_yen ?? 0)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(e.occurred_at)}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-12">
                  該当する売上イベントがありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {filtered.length > 200 && (
          <div className="border-t p-3 text-xs text-muted-foreground text-center">
            最初の 200 件を表示中
          </div>
        )}
      </Card>
    </AppShell>
  );
}
