'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { products } from '@/mocks/fixtures';
import { fmtYen } from '@/lib/format';
import { Plus } from 'lucide-react';

export default function ProductsPage() {
  return (
    <AppShell title="商品マスタ" breadcrumb={['ホーム', '商品']}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{products.length} 商品</p>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />商品を追加
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>商品</TableHead>
              <TableHead>カテゴリ</TableHead>
              <TableHead className="text-right">標準価格</TableHead>
              <TableHead>状態</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-md bg-muted overflow-hidden flex items-center justify-center">
                      {p.thumbnail_url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={p.thumbnail_url} alt="" className="h-full w-full object-contain p-0.5" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-[10.5px] font-mono text-muted-foreground">{p.id}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell><Badge variant="muted">{p.category}</Badge></TableCell>
                <TableCell className="text-right tabular-nums text-base font-medium">{fmtYen(p.default_price_yen)}</TableCell>
                <TableCell>
                  {p.active ? <Badge variant="ok">販売中</Badge> : <Badge variant="muted">停止中</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="h-7 text-xs">編集</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
