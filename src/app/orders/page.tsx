'use client';

import { useState, useMemo, useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
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

const STATUSES: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'すべての状態' },
  { value: 'paid', label: '支払済' },
  { value: 'pending', label: '処理中' },
  { value: 'failed', label: '失敗' },
  { value: 'refunded', label: '返金済' },
  { value: 'cancelled', label: 'キャンセル' },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{items?: Order[]} | Order[]>('/orders?limit=200');
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
  }, []);
  const [refundTarget, setRefundTarget] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('');

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
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
    });
  }, [orders, search, statusFilter, providerFilter]);

  const totals = useMemo(() => {
    const paid = filtered.filter((o) => o.status === 'paid');
    return {
      count: filtered.length,
      paidCount: paid.length,
      revenue: paid.reduce((a, o) => a + o.amount_yen, 0),
      refundedCount: filtered.filter((o) => o.status === 'refunded').length,
    };
  }, [filtered]);

  const submitRefund = () => {
    setRefundTarget(null);
    setRefundReason('');
  };

  if (loading) {
    return (
      <AppShell title="注文" breadcrumb={['ホーム', '注文']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="注文" breadcrumb={['ホーム', '注文']}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KpiCell label="表示中" value={totals.count.toString()} />
        <KpiCell label="支払済" value={totals.paidCount.toString()} accent="ok" />
        <KpiCell label="売上 (絞込分)" value={fmtYen(totals.revenue)} accent="primary" />
        <KpiCell label="返金済" value={totals.refundedCount.toString()} accent="warn" />
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="注文ID / 端末名 / PayPay payment_id ..."
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
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全決済方法</SelectItem>
              <SelectItem value="paypay">PayPay</SelectItem>
              <SelectItem value="cash">現金</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} / {orders.length} 件
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>注文ID</TableHead>
              <TableHead>店舗 / 端末</TableHead>
              <TableHead>商品</TableHead>
              <TableHead className="text-right">金額</TableHead>
              <TableHead>決済</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>支払日時</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 50).map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-[11px]">{o.id}</TableCell>
                <TableCell>
                  <div className="text-xs">{o.store_name}</div>
                  <div className="text-[10.5px] text-muted-foreground">{o.device_name}</div>
                </TableCell>
                <TableCell className="text-xs">{o.product_name}</TableCell>
                <TableCell className="text-right tabular-nums text-sm font-medium">
                  {fmtYen(o.amount_yen)}
                </TableCell>
                <TableCell className="text-xs">
                  {o.payment_provider === 'paypay' ? (
                    <div>
                      <div>PayPay</div>
                      {o.paypay_payment_id && (
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {o.paypay_payment_id}
                        </div>
                      )}
                    </div>
                  ) : (
                    '現金'
                  )}
                </TableCell>
                <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(o.paid_at)}
                </TableCell>
                <TableCell className="text-right">
                  {o.status === 'paid' && o.payment_provider === 'paypay' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setRefundTarget(o)}
                    >
                      <RotateCcw className="h-3 w-3" />返金
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">
                  該当する注文がありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {filtered.length > 50 && (
          <div className="border-t p-3 text-xs text-muted-foreground text-center">
            最初の 50 件を表示中。実 API では cursor で続きを取得します
          </div>
        )}
      </Card>

      <Dialog open={refundTarget !== null} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />手動返金
            </DialogTitle>
            <DialogDescription>
              PayPay へ返金リクエストを送信します。一度実行すると取り消せません。
            </DialogDescription>
          </DialogHeader>
          {refundTarget && (
            <div className="space-y-3 py-2">
              <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">注文ID</span><span className="font-mono">{refundTarget.id}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">商品</span><span>{refundTarget.product_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">金額</span><span className="tabular-nums font-medium">{fmtYen(refundTarget.amount_yen)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">PayPay payment_id</span><span className="font-mono text-[10px]">{refundTarget.paypay_payment_id}</span></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">返金理由 (任意・監査ログに記録)</Label>
                <Input
                  id="reason"
                  placeholder="例: 商品取出し不良"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)}>キャンセル</Button>
            <Button variant="destructive" onClick={submitRefund}>返金する</Button>
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
