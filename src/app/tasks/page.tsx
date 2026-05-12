'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TaskStatusBadge } from '@/components/domain/status-badges';
import { tasks } from '@/mocks/fixtures';
import { fmtDate, fmtRelative } from '@/lib/format';
import { Search, Activity, Plus } from 'lucide-react';

export default function TasksPage() {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return tasks;
    const s = search.toLowerCase();
    return tasks.filter(
      (t) =>
        t.name.toLowerCase().includes(s) ||
        t.payload_ref_name.toLowerCase().includes(s),
    );
  }, [search]);

  return (
    <AppShell title="配信タスク" breadcrumb={['ホーム', '配信タスク']}>
      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="タスク名またはペイロード名で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="ml-auto" />
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />新規タスク
          </Button>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>タスク</TableHead>
              <TableHead>ペイロード</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>進捗</TableHead>
              <TableHead>予定/開始</TableHead>
              <TableHead>作成者</TableHead>
              <TableHead className="text-right">作成</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => {
              const progress = t.total === 0 ? 0 : Math.round(((t.succeeded + t.failed) / t.total) * 100);
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/tasks/${t.id}`} className="hover:underline">
                      <div className="text-sm">{t.name}</div>
                      <div className="text-[10.5px] font-mono text-muted-foreground">{t.id}</div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                      {t.payload_ref_name}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 uppercase">{t.payload_type}</div>
                  </TableCell>
                  <TableCell><TaskStatusBadge status={t.status} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[200px]">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${t.failed > 0 && t.status !== 'distributing' ? 'bg-warn' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-[11px] tabular-nums text-muted-foreground w-20 text-right">
                        {t.succeeded + t.failed}/{t.total}
                      </span>
                    </div>
                    {(t.failed > 0 || t.in_progress > 0) && (
                      <div className="flex gap-2 mt-1 text-[10px]">
                        {t.in_progress > 0 && <span className="text-blue-400">⇄ {t.in_progress}</span>}
                        {t.failed > 0 && <span className="text-destructive">✕ {t.failed}</span>}
                        {t.pending > 0 && <span className="text-muted-foreground">… {t.pending}</span>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(t.scheduled_at)}</TableCell>
                  <TableCell className="text-xs">{t.created_by}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{fmtRelative(t.created_at)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
