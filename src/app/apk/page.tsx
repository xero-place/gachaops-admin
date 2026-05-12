'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apkReleases } from '@/mocks/fixtures';
import { fmtBytes, fmtDate, fmtRelative } from '@/lib/format';
import {
  Smartphone,
  Send,
  RotateCcw,
  Upload,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { ApkRelease } from '@/types/domain';

const CHANNEL_VARIANT: Record<string, 'ok' | 'warn' | 'muted'> = {
  Production: 'ok',
  Beta: 'warn',
  Dev: 'muted',
};

export default function ApkPage() {
  const [distributeTarget, setDistributeTarget] = useState<ApkRelease | null>(null);
  const [distributeMode, setDistributeMode] = useState('staged');

  return (
    <AppShell title="APK リリース" breadcrumb={['ホーム', 'APK']}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{apkReleases.length} リリース</p>
        <Button size="sm" className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />新規アップロード
        </Button>
      </div>

      <div className="space-y-4">
        {apkReleases.map((apk, i) => {
          const isLatest = i === 0;
          return (
            <Card key={apk.id} className={isLatest ? 'border-primary/50' : ''}>
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
                    <Smartphone className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">{apk.version_name}</CardTitle>
                      <Badge variant={CHANNEL_VARIANT[apk.channel]}>{apk.channel}</Badge>
                      {isLatest && <Badge variant="default" className="text-[10px]">最新</Badge>}
                      {apk.signed && (
                        <Badge variant="ok" className="gap-1 text-[10px]">
                          <CheckCircle2 className="h-2.5 w-2.5" />署名済
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      versionCode {apk.version_code} · {fmtBytes(apk.size)} · {apk.uploaded_by}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDistributeTarget(apk)}>
                      <Send className="h-3.5 w-3.5" />配信
                    </Button>
                    {!isLatest && (
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5" />ロールバック
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  {apk.notes && (
                    <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-sans bg-muted/40 rounded-md p-3">
                      {apk.notes}
                    </pre>
                  )}
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">アクティブ端末</span>
                    <span className="text-base font-semibold tabular-nums text-primary">{apk.active_install_count}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />アップロード</span>
                    <span>{fmtRelative(apk.uploaded_at)}</span>
                  </div>
                  <div className="text-[10.5px] text-muted-foreground">
                    {fmtDate(apk.uploaded_at)}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={distributeTarget !== null} onOpenChange={(o) => !o && setDistributeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>APK 配信</DialogTitle>
            <DialogDescription>
              端末への配信タスクを作成します。実際の配信は端末のアイドル時に順次行われます。
            </DialogDescription>
          </DialogHeader>
          {distributeTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <div className="font-medium">{distributeTarget.version_name}</div>
                <div className="text-muted-foreground">versionCode {distributeTarget.version_code} · {fmtBytes(distributeTarget.size)}</div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">配信モード</label>
                <Select value={distributeMode} onValueChange={setDistributeMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staged">段階配信 (10% → 50% → 100%)</SelectItem>
                    <SelectItem value="all">全端末に即時配信</SelectItem>
                    <SelectItem value="group">特定グループのみ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDistributeTarget(null)}>キャンセル</Button>
            <Button onClick={() => setDistributeTarget(null)}>配信タスクを作成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
