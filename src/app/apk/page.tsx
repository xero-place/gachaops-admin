'use client';

import { useState, useEffect } from 'react';
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
import { api, ApiError } from '@/lib/api';
import { Loader2 } from 'lucide-react';
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
  const [apkReleases, setApkReleases] = useState<ApkRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [distributeTarget, setDistributeTarget] = useState<ApkRelease | null>(null);
  const [distributeMode, setDistributeMode] = useState('device');
  const [deviceIdsInput, setDeviceIdsInput] = useState('dev_test_101');
  const [groupIdInput, setGroupIdInput] = useState('');
  const [distributing, setDistributing] = useState(false);
  const [distributeError, setDistributeError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [upFile, setUpFile] = useState<File | null>(null);
  const [upVersionName, setUpVersionName] = useState('');
  const [upVersionCode, setUpVersionCode] = useState('');
  const [upChannel, setUpChannel] = useState('staging');
  const [upNotes, setUpNotes] = useState('');
  const [upSigned, setUpSigned] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleUpload() {
    if (!upFile) { setUploadError('APKファイルを選択してください'); return; }
    const vname = upVersionName.trim();
    const vcodeNum = parseInt(upVersionCode.trim(), 10);
    if (!vname) { setUploadError('versionName を入力してください'); return; }
    if (!Number.isInteger(vcodeNum) || vcodeNum < 1) { setUploadError('versionCode は1以上の整数で入力してください'); return; }
    const fd = new FormData();
    fd.append('file', upFile);
    fd.append('version_name', vname);
    fd.append('version_code', String(vcodeNum));
    fd.append('channel', upChannel);
    if (upNotes.trim()) fd.append('notes', upNotes.trim());
    fd.append('signed', String(upSigned));
    setUploading(true);
    setUploadError(null);
    try {
      await api.post('/apk/releases/upload', fd);
      alert(`アップロードしました（${vname} / vc${vcodeNum} / ${upChannel}）`);
      window.location.reload();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      setUploadError(`アップロードに失敗しました: ${msg}`);
      setUploading(false);
    }
  }

  async function handleRollback(apk: ApkRelease) {
    const ok = window.confirm(
      `「${apk.version_name}」を1つ前のバージョンに戻します。\n` +
      `戻り先はサーバが同チャンネルの直前バージョンを自動選択します（force install）。\n` +
      `対象端末: dev_test_101\n\n実行しますか？`
    );
    if (!ok) return;
    try {
      const res = await api.post<{ task_id: string; rollback_to_release_id: string; target_count: number }>(
        `/apk/releases/${apk.id}/rollback`,
        { target: { device_ids: ['dev_test_101'] } },
      );
      alert(`ロールバックタスクを作成しました（対象 ${res.target_count} 台 / 戻り先 ${res.rollback_to_release_id}）`);
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      alert(`ロールバックに失敗しました: ${msg}`);
    }
  }

  async function handleDistribute() {
    if (!distributeTarget) return;
    let target: Record<string, unknown>;
    if (distributeMode === 'all') {
      target = { all: true };
    } else if (distributeMode === 'group') {
      const gid = groupIdInput.trim();
      if (!gid) { setDistributeError('グループIDを入力してください'); return; }
      target = { group_id: gid };
    } else {
      const ids = deviceIdsInput.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) { setDistributeError('端末IDを1つ以上入力してください'); return; }
      target = { device_ids: ids };
    }
    setDistributing(true);
    setDistributeError(null);
    try {
      const res = await api.post<{ task_id: string; target_count: number }>(
        `/apk/releases/${distributeTarget.id}/distribute`,
        { target },
      );
      alert(`配信タスクを作成しました（対象 ${res.target_count} 台）`);
      setDistributeTarget(null);
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      setDistributeError(`配信に失敗しました: ${msg}`);
    } finally {
      setDistributing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{items?: ApkRelease[]} | ApkRelease[]>('/apk/releases?limit=100');
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : (res.items ?? []);
        setApkReleases(arr);
      } catch (e) {
        console.error('[apk] fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <AppShell title="APK 配布" breadcrumb={['ホーム', 'APK']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="APK リリース" breadcrumb={['ホーム', 'APK']}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{apkReleases.length} リリース</p>
        <Button size="sm" className="gap-1.5" onClick={() => { setUploadError(null); setUploadOpen(true); }}>
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
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleRollback(apk)}>
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
                <Select value={distributeMode} onValueChange={(v) => { setDistributeMode(v); setDistributeError(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="device">特定端末（端末ID指定）</SelectItem>
                    <SelectItem value="group">特定グループ</SelectItem>
                    <SelectItem value="all">全端末に即時配信</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {distributeMode === 'device' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">端末ID（カンマ区切りで複数可）</label>
                  <input
                    type="text"
                    value={deviceIdsInput}
                    onChange={(e) => setDeviceIdsInput(e.target.value)}
                    placeholder="dev_test_101"
                    className="w-full rounded-md border bg-background px-3 py-2 text-xs"
                  />
                  <p className="text-[10.5px] text-muted-foreground">例: dev_test_101, dev_test_102</p>
                </div>
              )}

              {distributeMode === 'group' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">グループID</label>
                  <input
                    type="text"
                    value={groupIdInput}
                    onChange={(e) => setGroupIdInput(e.target.value)}
                    placeholder="grp_..."
                    className="w-full rounded-md border bg-background px-3 py-2 text-xs"
                  />
                </div>
              )}

              {distributeMode === 'all' && (
                <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                  ⚠️ 全登録端末に即時配信されます。端末ごとの現行バージョンや稼働状況に関わらず一斉に上書きOTAが走ります。本当に全端末で良いか確認してください。
                </div>
              )}

              {distributeError && (
                <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                  {distributeError}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDistributeTarget(null); setDistributeError(null); }} disabled={distributing}>キャンセル</Button>
            <Button onClick={handleDistribute} disabled={distributing} className="gap-1.5">
              {distributing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              配信タスクを作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!uploading) { setUploadOpen(o); if (!o) setUploadError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>APK 新規アップロード</DialogTitle>
            <DialogDescription>
              APKバイナリとメタ情報を登録します。versionCode は重複できません。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">APKファイル</label>
              <input
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                onChange={(e) => setUpFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:text-primary-foreground"
              />
              {upFile && (
                <p className="text-[10.5px] text-muted-foreground">
                  {upFile.name} · {fmtBytes(upFile.size)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">versionName</label>
                <input
                  type="text"
                  value={upVersionName}
                  onChange={(e) => setUpVersionName(e.target.value)}
                  placeholder="0.3.35-v13.0-alpha-patch95"
                  className="w-full rounded-md border bg-background px-3 py-2 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">versionCode</label>
                <input
                  type="number"
                  min={1}
                  value={upVersionCode}
                  onChange={(e) => setUpVersionCode(e.target.value)}
                  placeholder="96"
                  className="w-full rounded-md border bg-background px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">チャンネル</label>
              <Select value={upChannel} onValueChange={setUpChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staging">staging（検証用・推奨）</SelectItem>
                  <SelectItem value="beta">beta</SelectItem>
                  <SelectItem value="production">production（本番）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">リリースノート（任意）</label>
              <textarea
                value={upNotes}
                onChange={(e) => setUpNotes(e.target.value)}
                rows={2}
                placeholder="変更点の概要"
                className="w-full rounded-md border bg-background px-3 py-2 text-xs"
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={upSigned} onChange={(e) => setUpSigned(e.target.checked)} />
              署名済み（signed）としてマークする
            </label>
            {uploadError && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {uploadError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadOpen(false); setUploadError(null); }} disabled={uploading}>キャンセル</Button>
            <Button onClick={handleUpload} disabled={uploading} className="gap-1.5">
              {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              アップロード
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
