import { notFound } from 'next/navigation';
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
import { tasks, taskDeviceRuns } from '@/mocks/fixtures';
import { fmtDate, fmtRelative } from '@/lib/format';
import { ArrowLeft, Pause, RotateCcw, Activity } from 'lucide-react';
import Link from 'next/link';

const RUN_VARIANT: Record<string, 'ok' | 'destructive' | 'default' | 'muted'> = {
  completed: 'ok',
  failed: 'destructive',
  in_progress: 'default',
  pending: 'muted',
};
const RUN_LABEL: Record<string, string> = {
  completed: '完了',
  failed: '失敗',
  in_progress: '配信中',
  pending: '待機',
};

export default function TaskDetailPage({ params }: { params: { id: string } }) {
  const task = tasks.find((t) => t.id === params.id);
  if (!task) notFound();
  const runs = taskDeviceRuns(task.id);

  const progress = task.total === 0 ? 0 : Math.round(((task.succeeded + task.failed) / task.total) * 100);

  return (
    <AppShell title={task.name} breadcrumb={['ホーム', '配信タスク', task.id]}>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/tasks"><ArrowLeft className="h-3.5 w-3.5 mr-1" />一覧へ戻る</Link>
        </Button>
        <div className="ml-auto flex gap-2">
          {task.status === 'distributing' && (
            <Button variant="outline" size="sm" className="gap-1.5">
              <Pause className="h-3.5 w-3.5" />中止
            </Button>
          )}
          {(task.status === 'failed' || task.status === 'partial_success') && (
            <Button variant="outline" size="sm" className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />失敗端末を再配信
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{task.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{task.id}</p>
                </div>
                <TaskStatusBadge status={task.status} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <RunStat label="成功" value={task.succeeded} accent="ok" />
                <RunStat label="失敗" value={task.failed} accent="destructive" />
                <RunStat label="配信中" value={task.in_progress} accent="primary" />
                <RunStat label="待機" value={task.pending} accent="muted" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">全体進捗</span>
                  <span className="tabular-nums">{progress}% ({task.succeeded + task.failed} / {task.total})</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">端末別配信ステータス</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>端末</TableHead>
                    <TableHead>状態</TableHead>
                    <TableHead>開始</TableHead>
                    <TableHead>完了</TableHead>
                    <TableHead>エラー</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.device_id}>
                      <TableCell className="text-xs">{r.device_name}</TableCell>
                      <TableCell>
                        <Badge variant={RUN_VARIANT[r.status]}>{RUN_LABEL[r.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtRelative(r.started_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtRelative(r.completed_at)}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[200px] truncate">{r.error_message ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                  {runs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                        対象端末がありません
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">タスク情報</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-xs">
              <KV label="ペイロード種別" value={task.payload_type.toUpperCase()} mono />
              <KV label="ペイロード" value={task.payload_ref_name} />
              <KV label="参照ID" value={task.payload_ref_id} mono />
              <KV label="予定実行" value={fmtDate(task.scheduled_at)} />
              <KV label="作成日時" value={fmtDate(task.created_at)} />
              <KV label="作成者" value={task.created_by} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-3.5 w-3.5" />リアルタイム</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                配信中タスクは WebSocket で進捗が自動更新されます。Step D の `task.progress` イベントで端末ごとの完了通知を受信。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function RunStat({ label, value, accent }: { label: string; value: number; accent: 'ok' | 'destructive' | 'primary' | 'muted' }) {
  const c = accent === 'ok' ? 'text-ok' : accent === 'destructive' ? 'text-destructive' : accent === 'primary' ? 'text-primary' : 'text-muted-foreground';
  return (
    <div className="rounded-md border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold tabular-nums mt-1 ${c}`}>{value}</div>
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
    </div>
  );
}
