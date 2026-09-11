'use client';

import { useState, useMemo, useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { tokenStore } from '@/lib/token-store';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { OrderStatusBadge } from '@/components/domain/status-badges';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';
import { fmtYen, fmtDate } from '@/lib/format';
import { Search, Receipt, RotateCcw } from 'lucide-react';
import type { Order, OrderStatus } from '@/types/domain';
import { usePageT } from '@/i18n/usePageT';
import { ordersDict } from '@/i18n/ns/orders';

const STATUS_VALUES: (OrderStatus | 'all')[] = ['all', 'paid', 'pending', 'failed', 'refunded', 'cancelled'];

type OrdersT = (typeof ordersDict)['ja'] | (typeof ordersDict)['en'];

// ★storegroup: 決済PSPの種別をラベル化。unset=QR表示のみで客が未選択(=未決済)。
function providerLabel(p: string, t: OrdersT): string {
  switch ((p || '').toLowerCase()) {
    case 'paypay': return 'PayPay';
    case 'veritrans': return 'PayPay(DGFT)';
    case 'paypal': return 'PayPal';
    case 'stripe': return t.provStripe;
    case 'square': return 'Square';
    case 'unset': return t.provUnset;
    default: return t.provQr;
  }
}

// ★refundgate: バックエンドが「自動返金」を実装済みの provider のみ。
//   これ以外(veritrans=PayPay(DGFT)/paypay/square 等)は押しても必ずエラーになるため、
//   ボタンを出さず「PSPで手動返金」を案内する(効かないボタンの排除)。backend の許可集合と一致させること。
const AUTO_REFUNDABLE_PROVIDERS = new Set(['paypal', 'stripe']);

export default function OrdersPage() {
  const t = usePageT(ordersDict);
  const statusLabelOf = (v: string) => (v === 'all' ? t.statusAll : v === 'paid' ? t.statusPaid : v === 'pending' ? t.statusPending : v === 'failed' ? t.statusFailed : v === 'refunded' ? t.statusRefunded : v === 'cancelled' ? t.statusCancelled : v);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  // ★qr-placeholder: QR表示だけの空注文(未決済/選択待ち)を既定で隠す
  const [hidePlaceholders, setHidePlaceholders] = useState(true);

  // ★orderswindow: 取得をサーバ側フィルタ駆動にする。空注文を除外すると取得ウィンドウ(limit)が
  //   実注文だけで埋まり、古い「支払済」が枠外に押し出されて消える問題を根絶する。
  //   状態/空注文チェックを変えたら取り直す。limit も 200→500 に引き上げ。
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const qs = new URLSearchParams({ limit: '500' });
        if (statusFilter !== 'all') qs.set('status', statusFilter);
        if (hidePlaceholders) qs.set('include_placeholders', 'false');
        const res = await api.get<{items?: Order[]} | Order[]>(`/orders?${qs.toString()}`);
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : (res.items ?? []);
        setOrders(arr);
      } catch (e) {
        console.error('[orders] fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [statusFilter, hidePlaceholders]);
  const [refundTarget, setRefundTarget] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      // ★qr-placeholder: payment_provider="unset" かつ pending は「QRを表示しただけ/客が未選択」の
      //   空注文(WS再接続毎に自動生成される)。実取引ではないため既定で非表示。状態で『未決済』を
      //   選ぶか下のチェックを外すと表示できる。
      if (hidePlaceholders && statusFilter === 'all'
          && o.status === 'pending' && o.payment_provider === 'unset') return false;
      if (providerFilter !== 'all' && o.payment_provider !== providerFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !o.id.toLowerCase().includes(s) &&
          !o.device_name.toLowerCase().includes(s) &&
          !o.product_name.toLowerCase().includes(s) &&
          !(o.paypay_payment_id ?? '').includes(s)
        )
          return false;
      }
      return true;
    }).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [orders, search, statusFilter, providerFilter, hidePlaceholders]);

  const totals = useMemo(() => {
    const paid = filtered.filter((o) => o.status === 'paid');
    return {
      count: filtered.length,
      paidCount: paid.length,
      revenue: paid.reduce((a, o) => a + o.amount_yen, 0),
      refundedCount: filtered.filter((o) => o.status === 'refunded').length,
    };
  }, [filtered]);

  const submitRefund = async () => {
    if (!refundTarget || refunding) return;
    setRefunding(true);
    setRefundError(null);
    try {
      const updated = await api.post<Order>(`/orders/${refundTarget.id}/refund`, {
        reason: refundReason || null,
      });
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setRefundTarget(null);
      setRefundReason('');
    } catch (e) {
      setRefundError((e as Error)?.message || t.refundFailed);
    } finally {
      setRefunding(false);
    }
  };

  // ★orders-lock: 注文ページ(返金含む)は運営(lv1_super)のみ操作可。顧客がURL直打ちで
  //   到達しても操作させない。サイドバー非表示に加えたクライアント側ガード(+backendでも
  //   返金API実装時に lv1_super ゲートを付けること)。
  const _isSuper = tokenStore.getUser()?.role === 'lv1_super';
  if (!_isSuper) {
    return (
      <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          {t.operatorOnly}
        </div>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KpiCell label={t.kpiShown} value={totals.count.toString()} />
        <KpiCell label={t.kpiPaid} value={totals.paidCount.toString()} accent="ok" />
        <KpiCell label={t.kpiRevenue} value={fmtYen(totals.revenue)} accent="primary" />
        <KpiCell label={t.kpiRefunded} value={totals.refundedCount.toString()} accent="warn" />
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_VALUES.map((s) => (
                <SelectItem key={s} value={s}>{statusLabelOf(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.allProviders}</SelectItem>
              <SelectItem value="paypay">PayPay</SelectItem>
              <SelectItem value="cash">{t.cash}</SelectItem>
            </SelectContent>
          </Select>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hidePlaceholders}
              onChange={(e) => setHidePlaceholders(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            {t.hidePlaceholders}
          </label>
          <div className="text-xs text-muted-foreground">
            {t.itemCount(filtered.length, orders.length)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="md:hidden divide-y divide-border">
          {filtered.slice(0, 200).map((o) => (
            <div key={o.id} className="p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs">{o.store_name}</div>
                  {o.group_names && o.group_names.length > 0 && (
                    <div className="text-[10px] text-muted-foreground truncate">{o.group_names.join(' / ')}</div>
                  )}
                  <div className="text-[10.5px] text-muted-foreground">{o.device_name}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular-nums text-sm font-medium">{fmtYen(o.amount_yen)}</div>
                  <div className="mt-1"><OrderStatusBadge status={o.status} /></div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{providerLabel(o.payment_provider, t)}{o.paypay_payment_id ? ` · ${o.paypay_payment_id}` : ''}</span>
                <span className="shrink-0">{o.paid_at ? fmtDate(o.paid_at) : <span>{fmtDate(o.created_at)} <span className="opacity-60">{t.created}</span></span>}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-muted-foreground truncate">{o.id}</span>
                {o.status === 'paid' && (
                  AUTO_REFUNDABLE_PROVIDERS.has((o.payment_provider || '').toLowerCase()) ? (
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={() => setRefundTarget(o)}>
                      <RotateCcw className="h-3 w-3" />{t.refund}
                    </Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground shrink-0">{t.manualRefund}</span>
                  )
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">{t.noOrders}</div>
          )}
        </div>
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.colOrderId}</TableHead>
              <TableHead>{t.colStoreGroupDevice}</TableHead>
              <TableHead className="text-right">{t.colAmount}</TableHead>
              <TableHead>{t.colPayment}</TableHead>
              <TableHead>{t.colStatus}</TableHead>
              <TableHead>{t.colDatetime}</TableHead>
              <TableHead className="text-right">{t.colAction}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 200).map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-[11px]">{o.id}</TableCell>
                <TableCell>
                  <div className="text-xs">{o.store_name}</div>
                  {o.group_names && o.group_names.length > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      {o.group_names.join(' / ')}
                    </div>
                  )}
                  <div className="text-[10.5px] text-muted-foreground">{o.device_name}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm font-medium">
                  {fmtYen(o.amount_yen)}
                </TableCell>
                <TableCell className="text-xs">
                  <div>{providerLabel(o.payment_provider, t)}</div>
                  {o.paypay_payment_id && (
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {o.paypay_payment_id}
                    </div>
                  )}
                </TableCell>
                <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {o.paid_at
                    ? fmtDate(o.paid_at)
                    : <span>{fmtDate(o.created_at)}<span className="ml-1 text-[10px] opacity-60">{t.created}</span></span>}
                </TableCell>
                <TableCell className="text-right">
                  {o.status === 'paid' && (
                    AUTO_REFUNDABLE_PROVIDERS.has((o.payment_provider || '').toLowerCase()) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => setRefundTarget(o)}
                      >
                        <RotateCcw className="h-3 w-3" />{t.refund}
                      </Button>
                    ) : (
                      <span
                        className="text-[10px] text-muted-foreground"
                        title={t.manualRefundTip}
                      >
                        {t.manualRefund}
                      </span>
                    )
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">
                  {t.noOrders}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
        {filtered.length > 50 && (
          <div className="border-t p-3 text-xs text-muted-foreground text-center">
            {t.first50Note}
          </div>
        )}
      </Card>

      <Dialog open={refundTarget !== null} onOpenChange={(o) => { if (!o) { setRefundTarget(null); setRefundError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />{t.refundTitle}
            </DialogTitle>
            <DialogDescription>
              {t.refundDesc}
            </DialogDescription>
          </DialogHeader>
          {refundTarget && (
            <div className="space-y-3 py-2">
              <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">{t.fieldOrderId}</span><span className="font-mono">{refundTarget.id}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t.fieldProduct}</span><span>{refundTarget.product_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t.fieldAmount}</span><span className="tabular-nums font-medium">{fmtYen(refundTarget.amount_yen)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t.fieldPaymentId}</span><span className="font-mono text-[10px]">{refundTarget.paypay_payment_id}</span></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">{t.reasonLabel}</Label>
                <Input
                  id="reason"
                  placeholder={t.reasonPlaceholder}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
              </div>
            </div>
          )}
          {refundError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{refundError}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)} disabled={refunding}>{t.cancel}</Button>
            <Button variant="destructive" onClick={submitRefund} disabled={refunding}>{refunding ? t.refunding : t.doRefund}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function KpiCell({ label, value, accent }: { label: string; value: string; accent?: 'ok' | 'warn' | 'primary' }) {
  const c = accent === 'ok' ? 'text-ok' : accent === 'warn' ? 'text-warn' : accent === 'primary' ? 'text-primary' : 'text-foreground';
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold tabular-nums mt-1 ${c}`}>{value}</div>
    </div>
  );
}
