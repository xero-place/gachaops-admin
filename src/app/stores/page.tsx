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
import { stores, devices } from '@/mocks/fixtures';
import { fmtDate } from '@/lib/format';
import { Plus, Building2, Phone, MapPin } from 'lucide-react';
import Link from 'next/link';

export default function StoresPage() {
  return (
    <AppShell title="店舗" breadcrumb={['ホーム', '店舗']}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{stores.length} 店舗</p>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />店舗を追加
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>店舗名</TableHead>
              <TableHead>所在地</TableHead>
              <TableHead>連絡先</TableHead>
              <TableHead>端末</TableHead>
              <TableHead>登録日</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.map((s) => {
              const sdev = devices.filter((d) => d.store_id === s.id);
              const online = sdev.filter((d) => d.status === 'online').length;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-md bg-primary/15 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{s.name}</div>
                        <div className="text-[11px] text-muted-foreground">{s.prefecture}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {s.address}
                    </div>
                    {s.postal_code && <div className="text-[10.5px] text-muted-foreground mt-0.5">〒{s.postal_code}</div>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.phone && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {s.phone}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="ok">オン {online}</Badge>
                    {sdev.length - online > 0 && (
                      <Badge variant="muted" className="ml-1">他 {sdev.length - online}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(s.created_at, false)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link href={`/devices?store_id=${s.id}`}>端末を表示</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
