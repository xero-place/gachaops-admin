'use client';

import { useState, useMemo } from 'react';
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
import { Search, Boxes, Package, AlertTriangle } from 'lucide-react';
import { inventories, stores } from '@/mocks/fixtures';
import { fmtRelative } from '@/lib/format';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Inventory } from '@/types/domain';

export default function InventoriesPage() {
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [replenishTarget, setReplenishTarget] = useState<Inventory | null>(null);
  const [replenishCount, setReplenishCount] = useState<number>(0);

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
  }, [search, storeFilter, lowOnly]);

  const stats = useMemo(() => ({
    total: inventories.length,
    low: inventories.filter((i) => i.current_count <= i.low_threshold).length,
    empty: inventories.filter((i) => i.current_count === 0).length,
  }), []);

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
