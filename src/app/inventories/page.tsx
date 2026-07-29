'use client';

import { useState, useMemo, useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Search, Boxes, Package, AlertTriangle, ChevronRight, ChevronDown, ArrowUpDown } from 'lucide-react';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';

type Store = {
  id: string;
  name: string;
};
import { fmtRelative, fmtDate, fmtYen } from '@/lib/format';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Inventory } from '@/types/domain';

export default function InventoriesPage() {
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [replenishTarget, setReplenishTarget] = useState<Inventory | null>(null);
  const [replenishCount, setReplenishCount] = useState<number>(0);

  // 在庫変動履歴（販売＋補充を時系列・折りたたみ）
  type Movement = {
    ts: string; device_id: string; device_name: string;
    kind: string; delta: number; payment_method: string | null;
    amount: number | null; note: string | null;
  };
  const [showHistory, setShowHistory] = useState(false);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movLoading, setMovLoading] = useState(false);
  const [movLoaded, setMovLoaded] = useState(false);
  const [movSortKey, setMovSortKey] = useState<'ts' | 'payment_method' | 'amount'>('ts');
  const [movSortDir, setMovSortDir] = useState<'asc' | 'desc'>('desc');

  const loadMovements = async () => {
    if (movLoaded || movLoading) return;
    setMovLoading(true);
    try {
      const res = await api.get<{ items?: Movement[] } | Movement[]>('/inventories/movements?limit=500');
      const arr = Array.isArray(res) ? res : (res.items ?? []);
      setMovements(arr);
      setMovLoaded(true);
    } catch (e) {
      console.error('[inventories] movements fetch failed:', e);
    } finally {
      setMovLoading(false);
    }
  };

  const toggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next) loadMovements();
  };

  const setSort = (key: 'ts' | 'payment_method' | 'amount') => {
    if (movSortKey === key) setMovSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setMovSortKey(key); setMovSortDir('desc'); }
  };

  const sortedMovements = useMemo(() => {
    const arr = [...movements];
    const dir = movSortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let av: number | string; let bv: number | string;
      if (movSortKey === 'amount') { av = a.amount ?? -1; bv = b.amount ?? -1; }
      else if (movSortKey === 'payment_method') { av = a.payment_method ?? ''; bv = b.payment_method ?? ''; }
      else { av = a.ts; bv = b.ts; }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [movements, movSortKey, movSortDir]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [iRes, sRes] = await Promise.all([
          api.get<{items?: Inventory[]} | Inventory[]>('/inventories?limit=500'),
          api.get<{items?: Store[]} | Store[]>('/stores?limit=200'),
        ]);
        if (cancelled) return;
        const iArr = Array.isArray(iRes) ? iRes : (iRes.items ?? []);
        const sArr = Array.isArray(sRes) ? sRes : (sRes.items ?? []);
        // Augment inventories with store_name from devices (best-effort)
        const augmented = iArr.map((inv) => ({ ...inv, store_name: inv.store_name ?? '' }));
        setInventories(augmented);
        setStores(sArr);
      } catch (e) {
        console.error('[inventories] fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    return inventories.filter((i) => {
      if (lowOnly && i.current_count > i.low_threshold) return false;
      if (storeFilter !== 'all' && !i.store_name.includes(stores.find((s) => s.id === storeFilter)?.name ?? '___')) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !i.device_name.toLowerCase().includes(s) &&
          !i.product_name.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [inventories, search, storeFilter, lowOnly]);

  const stats = useMemo(() => ({
    total: inventories.length,
    low: inventories.filter((i) => i.current_count <= i.low_threshold).length,
    empty: inventories.filter((i) => i.current_count === 0).length,
  }), []);

  if (loading) {
    return (
      <AppShell title="在庫" breadcrumb={['ホーム', '在庫']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="在庫" breadcrumb={['ホーム', '在庫']}>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <KpiCell label="全スロット" value={stats.total.toString()} icon={<Boxes className="h-4 w-4" />} />
        <KpiCell label="低在庫" value={stats.low.toString()} accent="warn" icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCell label="売り切れ" value={stats.empty.toString()} accent="destructive" icon={<Package className="h-4 w-4" />} />
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="端末名 / 商品名 ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="店舗" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての店舗</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch id="low-only" checked={lowOnly} onCheckedChange={setLowOnly} />
            <Label htmlFor="low-only" className="text-xs cursor-pointer">低在庫のみ</Label>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">{filtered.length} 件</div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>端末</TableHead>
              <TableHead>店舗</TableHead>
              <TableHead>スロット</TableHead>
              <TableHead>商品</TableHead>
              <TableHead>在庫</TableHead>
              <TableHead>最終補充</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 100).map((inv) => {
              const ratio = inv.current_count / inv.capacity;
              const low = inv.current_count <= inv.low_threshold;
              return (
                <TableRow key={inv.id}>
                  <TableCell className="text-sm">{inv.device_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{inv.store_name}</TableCell>
                  <TableCell className="text-xs font-mono">#{inv.slot_index + 1}</TableCell>
                  <TableCell className="text-sm">{inv.product_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[180px]">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${inv.current_count === 0 ? 'bg-destructive' : low ? 'bg-warn' : 'bg-ok'}`}
                          style={{ width: `${Math.max(2, ratio * 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs tabular-nums w-14 text-right ${low ? 'text-warn font-medium' : ''}`}>
                        {inv.current_count}/{inv.capacity}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtRelative(inv.last_replenished_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={low ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setReplenishTarget(inv);
                        setReplenishCount(inv.capacity - inv.current_count);
                      }}
                    >
                      補充記録
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">
                  該当する在庫がありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* 在庫変動履歴（折りたたみ・日付/決済手段/金額でソート可） */}
      <Card className="mt-4">
        <button
          onClick={toggleHistory}
          className="w-full flex items-center gap-2 p-3 text-sm font-medium hover:bg-muted/40 transition-colors"
        >
          {showHistory ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          在庫変動履歴（販売・補充）
          <span className="text-xs text-muted-foreground font-normal">
            {movLoaded ? `${movements.length} 件` : 'クリックで表示'}
          </span>
        </button>
        {showHistory && (
          <div className="border-t">
            {movLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead label="日時" active={movSortKey === 'ts'} dir={movSortDir} onClick={() => setSort('ts')} />
                    <TableHead>端末</TableHead>
                    <TableHead>種別</TableHead>
                    <TableHead className="text-right">変動</TableHead>
                    <SortHead label="決済手段" active={movSortKey === 'payment_method'} dir={movSortDir} onClick={() => setSort('payment_method')} />
                    <SortHead label="金額" active={movSortKey === 'amount'} dir={movSortDir} onClick={() => setSort('amount')} className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMovements.slice(0, 500).map((m, idx) => (
                    <TableRow key={`${m.device_id}-${m.ts}-${idx}`}>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(m.ts)}</TableCell>
                      <TableCell className="text-sm">{m.device_name}</TableCell>
                      <TableCell>
                        {m.kind === 'sale'
                          ? <Badge variant="ok">販売</Badge>
                          : m.kind === 'replenish'
                          ? <Badge variant="muted">補充</Badge>
                          : <Badge variant="warn">調整</Badge>}
                      </TableCell>
                      <TableCell className={`text-right text-xs tabular-nums font-medium ${m.delta < 0 ? 'text-destructive' : 'text-ok'}`}>
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.payment_method === 'cash' ? '現金'
                          : m.payment_method === 'qr' ? 'QR決済'
                          : m.payment_method === 'token' ? 'トークン'
                          : m.payment_method ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {m.amount != null ? fmtYen(m.amount) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {movLoaded && sortedMovements.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                        変動履歴がありません
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </Card>

      <Dialog open={replenishTarget !== null} onOpenChange={(o) => !o && setReplenishTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>在庫補充の記録</DialogTitle>
            <DialogDescription>
              現場での補充作業をシステムに記録します。実際の補充作業後に行ってください。
            </DialogDescription>
          </DialogHeader>
          {replenishTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">端末</span><span>{replenishTarget.device_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">スロット</span><span>#{replenishTarget.slot_index + 1}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">商品</span><span>{replenishTarget.product_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">補充前</span>
                  <Badge variant={replenishTarget.current_count <= replenishTarget.low_threshold ? 'warn' : 'muted'}>
                    {replenishTarget.current_count} / {replenishTarget.capacity}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="count">補充個数</Label>
                <Input
                  id="count"
                  type="number"
                  min={0}
                  max={replenishTarget.capacity - replenishTarget.current_count}
                  value={replenishCount}
                  onChange={(e) => setReplenishCount(parseInt(e.target.value) || 0)}
                />
                <p className="text-[11px] text-muted-foreground">
                  最大 {replenishTarget.capacity - replenishTarget.current_count} 個まで
                  (補充後合計: {Math.min(replenishTarget.current_count + replenishCount, replenishTarget.capacity)} 個)
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplenishTarget(null)}>キャンセル</Button>
            <Button onClick={() => setReplenishTarget(null)}>記録する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SortHead({ label, active, dir, onClick, className }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; className?: string }) {
  return (
    <TableHead className={className}>
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? 'text-foreground' : 'text-muted-foreground/50'}`} />
        {active && <span className="text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </TableHead>
  );
}

function KpiCell({ label, value, accent, icon }: { label: string; value: string; accent?: 'warn' | 'destructive'; icon?: React.ReactNode }) {
  const c = accent === 'warn' ? 'text-warn' : accent === 'destructive' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold tabular-nums mt-1 ${c}`}>{value}</div>
      </div>
      <div className="text-muted-foreground">{icon}</div>
    </div>
  );
}
