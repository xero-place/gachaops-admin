import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { programs } from '@/mocks/fixtures';
import { fmtDate, fmtDuration } from '@/lib/format';
import { ArrowLeft, Plus, Copy, Send, Layers, Image, Type, Clock, CloudSun } from 'lucide-react';

export default function ProgramDetailPage({ params }: { params: { id: string } }) {
  const program = programs.find((p) => p.id === params.id);
  if (!program) notFound();

  // Mock scenes — derived from program shape
  const scenes = Array.from({ length: program.scene_count }, (_, i) => ({
    id: `scn_${program.id}_${i + 1}`,
    name: `シーン ${i + 1}`,
    duration_sec: Math.floor(program.total_duration_sec / program.scene_count),
    background_color: ['#0f172a', '#7c2d12', '#581c87', '#0e7490', '#365314'][i % 5],
    widget_count: 2 + (i % 3),
  }));

  return (
    <AppShell title={program.name} breadcrumb={['ホーム', 'プログラム', program.id]}>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/programs"><ArrowLeft className="h-3.5 w-3.5 mr-1" />一覧へ戻る</Link>
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Copy className="h-3.5 w-3.5" />複製
          </Button>
          {!program.published ? (
            <Button size="sm" className="gap-1.5">
              <Send className="h-3.5 w-3.5" />公開して配信
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5">
              <Send className="h-3.5 w-3.5" />配信タスク作成
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
                  <CardTitle className="text-base">{program.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{program.description ?? '説明なし'}</p>
                </div>
                {program.published ? (
                  <Badge variant="ok">公開中</Badge>
                ) : (
                  <Badge variant="warn">下書き</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-muted rounded-md overflow-hidden mb-4">
                {program.thumbnail_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={program.thumbnail_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="総再生時間" value={fmtDuration(program.total_duration_sec * 1000)} />
                <Stat label="シーン数" value={String(program.scene_count)} />
                <Stat label="ウィジェット数" value={String(program.widget_count)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row justify-between items-start space-y-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="h-3.5 w-3.5" />シーン構成
              </CardTitle>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" />シーン追加
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {scenes.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 p-3 border rounded-md hover:bg-accent">
                  <div
                    className="h-12 w-20 rounded shrink-0 border"
                    style={{ background: s.background_color ?? undefined }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">#{i + 1}</span>
                      <span className="text-sm font-medium">{s.name}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex gap-3">
                      <span>{fmtDuration(s.duration_sec * 1000)}</span>
                      <span>{s.widget_count} ウィジェット</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {/* Widget type icons */}
                    <Badge variant="muted" className="h-5 w-5 p-0 justify-center"><Image className="h-2.5 w-2.5" /></Badge>
                    <Badge variant="muted" className="h-5 w-5 p-0 justify-center"><Type className="h-2.5 w-2.5" /></Badge>
                    {i % 2 === 0 && <Badge variant="muted" className="h-5 w-5 p-0 justify-center"><Clock className="h-2.5 w-2.5" /></Badge>}
                    {i === 0 && <Badge variant="muted" className="h-5 w-5 p-0 justify-center"><CloudSun className="h-2.5 w-2.5" /></Badge>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">プログラム情報</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-xs">
              <KV label="ID" value={program.id} mono />
              <KV label="作成" value={fmtDate(program.created_at)} />
              <KV label="最終更新" value={fmtDate(program.updated_at)} />
              <KV label="状態" value={program.published ? '公開中' : '下書き'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">配信状況</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                このプログラムを配信中の端末数:
              </p>
              <div className="text-2xl font-semibold tabular-nums text-primary">{program.published ? 8 : 0}</div>
              <p className="text-[11px] text-muted-foreground mt-1">{program.published ? '/ 全 44 端末' : '未配信'}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums mt-1">{value}</div>
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
