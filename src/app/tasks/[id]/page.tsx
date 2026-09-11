'use client';

import { useState, useEffect } from 'react';
import { notFound, useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TaskStatusBadge } from '@/components/domain/status-badges';
import { api } from '@/lib/api';
import { fmtDate, fmtRelative } from '@/lib/format';
import { ArrowLeft, Activity, Loader2 } from 'lucide-react';
import type { TaskStatus } from '@/types/domain';
import { usePageT } from '@/i18n/usePageT';
import { tasksDict } from '@/i18n/ns/tasks';

type Task = {
  id: string;
  name: string;
  status: TaskStatus;
  payload_type: string;
  payload_ref_id: string;
  payload_ref_name: string;
  scheduled_at: string | null;
  total: number;
  succeeded: number;
  failed: number;
  in_progress: number;
  pending: number;
  created_by: string | null;
  created_at: string;
};

type TaskRun = {
  id: string;
  task_id: string;
  device_id: string;
  device_name?: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  attempts?: number;
};

const RUN_VARIANT: Record<string, 'ok' | 'destructive' | 'default' | 'muted'> = {
  completed: 'ok',
  failed: 'destructive',
  in_progress: 'default',
  pending: 'muted',
};
export default function TaskDetailPage() {
  const t = usePageT(tasksDict);
  const RUN_LABEL = t.runLabels;
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [task, setTask] = useState<Task | null>(null);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await api.get<Task>(`/tasks/${id}`);
        if (cancelled) return;
        setTask(t);
        try {
          const r = await api.get<{items?: TaskRun[]} | TaskRun[]>(`/tasks/${id}/runs?limit=200`);
          const rArr = Array.isArray(r) ? r : (r.items ?? []);
          if (!cancelled) setRuns(rArr);
        } catch {
          // runs endpoint may not exist - that's fine
          if (!cancelled) setRuns([]);
        }
      } catch (e) {
        console.error('[tasks/[id]] fetch failed:', e);
        if (!cancelled) setNotFoundFlag(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <AppShell title={t.detailTitle} breadcrumb={[t.home, t.bcTask, id]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (notFoundFlag || !task) {
    notFound();
  }

  const progress = task.total === 0 ? 0 : Math.round(((task.succeeded + task.failed) / task.total) * 100);

  return (
    <AppShell title={task.name} breadcrumb={[t.home, t.bcTask, task.name]}>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/tasks"><ArrowLeft className="h-3.5 w-3.5 mr-1" />{t.backToList}</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" />{t.deliveryProgress}
              </CardTitle>
              <TaskStatusBadge status={task.status} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-sm font-mono text-muted-foreground tabular-nums">{task.succeeded + task.failed}/{task.total} ({progress}%)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><div className="text-muted-foreground">{t.succeeded}</div><div className="text-base font-semibold text-ok">{task.succeeded}</div></div>
              <div><div className="text-muted-foreground">{t.failed}</div><div className="text-base font-semibold text-destructive">{task.failed}</div></div>
              <div><div className="text-muted-foreground">{t.distributing}</div><div className="text-base font-semibold text-primary">{task.in_progress}</div></div>
              <div><div className="text-muted-foreground">{t.pending}</div><div className="text-base font-semibold text-muted-foreground">{task.pending}</div></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">{t.taskInfo}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div><span className="text-muted-foreground">ID</span><div className="font-mono">{task.id}</div></div>
            <div><span className="text-muted-foreground">{t.infoType}</span><div className="font-mono">{task.payload_type}</div></div>
            <div><span className="text-muted-foreground">{t.infoTarget}</span><div>{task.payload_ref_name || task.payload_ref_id}</div></div>
            <div><span className="text-muted-foreground">{t.infoReserved}</span><div>{task.scheduled_at ? fmtDate(task.scheduled_at) : t.none}</div></div>
            <div><span className="text-muted-foreground">{t.infoCreated}</span><div>{fmtRelative(task.created_at)}</div></div>
          </CardContent>
        </Card>
      </div>

      {runs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">{t.deliveryResults(runs.length)}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.colDevice}</TableHead>
                  <TableHead>{t.colStatus}</TableHead>
                  <TableHead>{t.colStarted}</TableHead>
                  <TableHead>{t.colCompleted}</TableHead>
                  <TableHead>{t.colAttempts}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.device_name || r.device_id}</TableCell>
                    <TableCell><Badge variant={RUN_VARIANT[r.status] ?? 'muted'}>{RUN_LABEL[r.status] ?? r.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.started_at ? fmtRelative(r.started_at) : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.completed_at ? fmtRelative(r.completed_at) : '—'}</TableCell>
                    <TableCell className="text-xs">{r.attempts ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
