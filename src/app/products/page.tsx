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
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';

type Product = {
  id: string;
  customer_id?: string;
  name: string;
  category: string;
  default_price_yen: number;
  thumbnail_s3_key?: string | null;
  thumbnail_url?: string | null;
  active: boolean;
  created_at?: string;
};
import { fmtYen } from '@/lib/format';
import { Plus } from 'lucide-react';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{items?: Product[]} | Product[]>('/products?limit=200');
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : (res.items ?? []);
        // Map thumbnail_s3_key to thumbnail_url if needed
        const mapped = arr.map((p) => ({
          ...p,
          thumbnail_url: p.thumbnail_url ?? (p.thumbnail_s3_key ? `https://api.xero-place.com/videos/${p.thumbnail_s3_key}` : null),
        }));
        setProducts(mapped);
      } catch (e) {
        console.error('[products] fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <AppShell title="商品マスタ" breadcrumb={['ホーム', '商品']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

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
