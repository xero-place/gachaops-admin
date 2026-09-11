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
import { tokenStore } from '@/lib/token-store';
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
import { usePageT } from '@/i18n/usePageT';
import { apkDict } from '@/i18n/ns/apk';

const CHANNEL_VARIANT: Record<string, 'ok' | 'warn' | 'muted'> = {
  Production: 'ok',
  Beta: 'warn',
  Dev: 'muted',
};

// app_version 文字列(例 "0.3.97-v44 (vc358)")から versionCode を数値抽出(最大)。
function apkVcOf(appver?: string | null): number | null {
  const nums = [...(appver ?? '').matchAll(/\(vc(\d+)\)/g)].map((x) => Number(x[1]));
  return nums.length ? Math.max(...nums) : null;
}

export default function ApkPage() {
  const t = usePageT(apkDict);
  // S225: OTA配信は運営(lv1_super)専用。顧客アカウントは直リンクでも閲覧不可。
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { setRole(tokenStore.getUser()?.role ?? null); }, []);
  const isSuper = role === 'lv1_super';
  const [apkReleases, setApkReleases] = useState<ApkRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [distributeTarget, setDistributeTarget] = useState<ApkRelease | null>(null);
  const [distributeMode, setDistributeMode] = useState('device');
  const [groupIdInput, setGroupIdInput] = useState('');
  // S146: 配信先をチェックボックス/グループ選択で選べるように
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [apkDevices, setApkDevices] = useState<{id:string; name?:string; status?:string; app_version?:string|null}[]>([]);
  const [apkGroups, setApkGroups] = useState<{id:string; name:string; customer_id?:string; members?:{device_id:string}[]}[]>([]);
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
    if (!upFile) { setUploadError(t.selectApkFile); return; }
    const vname = upVersionName.trim();
    const vcodeNum = parseInt(upVersionCode.trim(), 10);
    if (!vname) { setUploadError(t.enterVersionName); return; }
    if (!Number.isInteger(vcodeNum) || vcodeNum < 1) { setUploadError(t.enterVersionCode); return; }
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
      alert(t.uploadedMsg(vname, vcodeNum, upChannel));
      window.location.reload();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      setUploadError(t.uploadFailedMsg(msg));
      setUploading(false);
    }
  }

  async function handleRollback(apk: ApkRelease) {
    const ok = window.confirm(t.rollbackConfirm(apk.version_name));
    if (!ok) return;
    try {
      const res = await api.post<{ task_id: string; rollback_to_release_id: string; target_count: number }>(
        `/apk/releases/${apk.id}/rollback`,
        { target: { device_ids: ['dev_test_101'] } },
      );
      alert(t.rollbackCreated(res.target_count, res.rollback_to_release_id));
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      alert(t.rollbackFailed(msg));
    }
  }

  async function handleDistribute() {
    if (!distributeTarget) return;
    let target: Record<string, unknown>;
    if (distributeMode === 'all') {
      target = { all: true };
    } else if (distributeMode === 'group') {
      const gid = groupIdInput.trim();
      if (!gid) { setDistributeError(t.enterGroupId); return; }
      target = { group_id: gid };
    } else if (distributeMode === 'online_outdated') {
      // オンライン かつ このAPK未適用(versionCode未満 or 不明)の端末に一括
      const tvc = distributeTarget.version_code;
      const ids = apkDevices
        .filter((d) => d.status === 'online')
        .filter((d) => { const vc = apkVcOf(d.app_version); return vc === null || vc < tvc; })
        .map((d) => d.id);
      if (ids.length === 0) { setDistributeError(t.noOnlineOutdated); return; }
      target = { device_ids: ids };
    } else {
      if (selectedDeviceIds.length === 0) { setDistributeError(t.selectAtLeastOne); return; }
      target = { device_ids: selectedDeviceIds };
    }
    setDistributing(true);
    setDistributeError(null);
    try {
      const res = await api.post<{ task_id: string; target_count: number }>(
        `/apk/releases/${distributeTarget.id}/distribute`,
        { target },
      );
      alert(t.distributeCreated(res.target_count));
      setDistributeTarget(null);
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      setDistributeError(t.distributeFailed(msg));
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
        // S146: アップロード日時の新しい順（降順）に並べる
        arr.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
        setApkReleases(arr);
        // S146: 配信先選択用に端末・グループ取得
        try {
          const dr = await api.get<{items?: typeof apkDevices} | typeof apkDevices>('/devices?limit=200');
          const darr = Array.isArray(dr) ? dr : (dr.items ?? []);
          if (!cancelled) setApkDevices(darr);
          const gr = await api.get<{items?: typeof apkGroups} | typeof apkGroups>('/device-groups?limit=200');
          const garr = Array.isArray(gr) ? gr : (gr.items ?? []);
          if (!cancelled) setApkGroups((garr as typeof apkGroups).map((g) => ({ ...g, members: g.members ?? [] })));
        } catch (e2) { console.error('[apk] devices/groups fetch failed:', e2); }
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
      <AppShell title={t.loadingTitle} breadcrumb={[t.home, t.apkBc]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (role !== null && !isSuper) {
    return (
      <AppShell title={t.title} breadcrumb={[t.home, t.apkBc]}>
        <div className="py-20 text-center text-sm text-muted-foreground">
          {t.accessDenied}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t.title} breadcrumb={[t.home, t.apkBc]}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{t.releaseCount(apkReleases.length)}</p>
        <Button size="sm" className="gap-1.5" onClick={() => { setUploadError(null); setUploadOpen(true); }}>
          <Upload className="h-3.5 w-3.5" />{t.newUpload}
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
                      {isLatest && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm shadow-violet-500/40 ring-1 ring-violet-300/50">
                          {t.latestBadge}
                        </span>
                      )}
                      {apk.signed && (
                        <Badge variant="ok" className="gap-1 text-[10px]">
                          <CheckCircle2 className="h-2.5 w-2.5" />{t.signedBadge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      versionCode {apk.version_code} · {fmtBytes(apk.size)} · {apk.uploaded_by}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDistributeTarget(apk)}>
                      <Send className="h-3.5 w-3.5" />{t.distribute}
                    </Button>
                    {!isLatest && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleRollback(apk)}>
                        <RotateCcw className="h-3.5 w-3.5" />{t.rollback}
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
                  {(() => {
                    const targets = apk.delivery_targets ?? [];
                    const done = targets.filter((tg) => tg.status === 'completed').length;
                    const stMap: Record<string, { label: string; cls: string }> = {
                      completed: { label: t.stCompleted, cls: 'bg-emerald-500/15 text-emerald-500' },
                      installing: { label: t.stInstalling, cls: 'bg-blue-500/15 text-blue-500' },
                      pending: { label: t.stPending, cls: 'bg-amber-500/15 text-amber-500' },
                      failed: { label: t.stFailed, cls: 'bg-red-500/15 text-red-500' },
                    };
                    return (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t.deliveryTargets}</span>
                          {targets.length > 0 ? (
                            <span className="text-[10.5px] font-medium tabular-nums text-muted-foreground">{t.doneCount(done, targets.length)}</span>
                          ) : (
                            <span className="text-[10.5px] text-muted-foreground">{t.notDistributed}</span>
                          )}
                        </div>
                        {targets.length > 0 && (
                          <div className="max-h-36 overflow-y-auto rounded-md border divide-y">
                            {targets.map((tg) => {
                              const st = stMap[tg.status] ?? { label: tg.status, cls: 'bg-muted text-muted-foreground' };
                              return (
                                <div key={tg.device_id} className="flex items-center gap-1.5 px-2 py-1.5">
                                  <span className="font-medium truncate">{tg.device_name ?? tg.device_id}</span>
                                  {/* S230: customer_id(cust_demo等)は不要なので非表示 */}
                                  <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${st.cls}`}>{st.label}</span>
                                  {tg.status === 'failed' && tg.error_message && (
                                    <span className="shrink-0 font-mono text-[9px] text-red-400/90 truncate max-w-[160px]" title={tg.error_message}>{tg.error_message}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex items-center justify-between text-muted-foreground pt-1">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.uploadLabel}</span>
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
            <DialogTitle>{t.distributeDialogTitle}</DialogTitle>
            <DialogDescription>
              {t.distributeDialogDesc}
            </DialogDescription>
          </DialogHeader>
          {distributeTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <div className="font-medium">{distributeTarget.version_name}</div>
                <div className="text-muted-foreground">versionCode {distributeTarget.version_code} · {fmtBytes(distributeTarget.size)}</div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">{t.distributeModeLabel}</label>
                <Select value={distributeMode} onValueChange={(v) => { setDistributeMode(v); setDistributeError(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="device">{t.modeDevice}</SelectItem>
                    <SelectItem value="online_outdated">{t.modeOnlineOutdated}</SelectItem>
                    <SelectItem value="group">{t.modeGroup}</SelectItem>
                    <SelectItem value="all">{t.modeAll}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {distributeMode === 'device' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium">{t.selectDevices}</label>
                    <div className="flex gap-2">
                      <button type="button" className="text-[10.5px] text-primary hover:underline"
                        onClick={() => setSelectedDeviceIds(apkDevices.map((d) => d.id))}>{t.selectAll}</button>
                      <button type="button" className="text-[10.5px] text-primary hover:underline"
                        onClick={() => setSelectedDeviceIds(apkDevices.filter((d) => d.status === 'online').map((d) => d.id))}>{t.onlineOnly}</button>
                      <button type="button" className="text-[10.5px] text-muted-foreground hover:underline"
                        onClick={() => setSelectedDeviceIds([])}>{t.deselect}</button>
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
                    {apkDevices.length === 0 && (
                      <div className="px-3 py-2 text-[10.5px] text-muted-foreground">{t.noDevices}</div>
                    )}
                    {[...apkDevices].sort((a, b) => (a.status === 'online' ? 0 : 1) - (b.status === 'online' ? 0 : 1)).map((d) => {
                      const checked = selectedDeviceIds.includes(d.id);
                      const online = d.status === 'online';
                      const vc = apkVcOf(d.app_version);
                      const outdated = distributeTarget != null && (vc === null || vc < distributeTarget.version_code);
                      return (
                        <label key={d.id} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-accent">
                          <input type="checkbox" checked={checked}
                            onChange={(e) => setSelectedDeviceIds((prev) =>
                              e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id))} />
                          <span className={online ? 'text-emerald-500' : 'text-muted-foreground'}>{online ? '●' : '○'}</span>
                          <span className="font-medium">{d.name ?? d.id}</span>
                          {outdated
                            ? <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-medium">{t.needsUpdate}</span>
                            : <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 text-[9px] font-medium">{t.upToDate}</span>}
                          <span className="ml-auto font-mono text-[10px] text-muted-foreground">{d.id}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[10.5px] text-muted-foreground">{t.selectedCount(selectedDeviceIds.length)}</p>
                </div>
              )}

              {distributeMode === 'online_outdated' && (() => {
                const targets = [...apkDevices]
                  .filter((d) => d.status === 'online')
                  .filter((d) => { const vc = apkVcOf(d.app_version); return distributeTarget != null && (vc === null || vc < distributeTarget.version_code); });
                return (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">{t.onlineOutdatedTargets}</label>
                    <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
                      {targets.length === 0 && (
                        <div className="px-3 py-2 text-[10.5px] text-muted-foreground">{t.noOnlineOutdatedInline}</div>
                      )}
                      {targets.map((d) => (
                        <div key={d.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                          <span className="text-emerald-500">●</span>
                          <span className="font-medium">{d.name ?? d.id}</span>
                          <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-medium">{t.needsUpdate}</span>
                          <span className="ml-auto font-mono text-[10px] text-muted-foreground">{d.id}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10.5px] text-muted-foreground">{t.willDistributeOnline(targets.length)}</p>
                  </div>
                );
              })()}

              {distributeMode === 'group' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">{t.selectGroup}</label>
                  <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
                    {apkGroups.length === 0 && (
                      <div className="px-3 py-2 text-[10.5px] text-muted-foreground">{t.noGroups}</div>
                    )}
                    {apkGroups.map((g) => {
                      const sel = groupIdInput === g.id;
                      const memberCount = g.members?.length ?? 0;
                      return (
                        <label key={g.id} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-accent">
                          <input type="radio" name="apk-group" checked={sel}
                            onChange={() => setGroupIdInput(g.id)} />
                          <span className="font-medium">{g.name}</span>
                          {g.customer_id && (
                            <span className="font-mono text-[10px] text-amber-500/80">{g.customer_id}</span>
                          )}
                          <span className="ml-auto text-[10px] text-muted-foreground">{t.memberCount(memberCount)}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[10.5px] text-muted-foreground">{t.groupDistributeNote}</p>
                </div>
              )}

              {distributeMode === 'all' && (
                <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                  {t.allWarning}
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
            <Button variant="outline" onClick={() => { setDistributeTarget(null); setDistributeError(null); }} disabled={distributing}>{t.cancel}</Button>
            <Button onClick={handleDistribute} disabled={distributing} className="gap-1.5">
              {distributing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t.createDistributeTask}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!uploading) { setUploadOpen(o); if (!o) setUploadError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.uploadDialogTitle}</DialogTitle>
            <DialogDescription>
              {t.uploadDialogDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t.apkFile}</label>
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
              <label className="text-xs font-medium">{t.channel}</label>
              <Select value={upChannel} onValueChange={setUpChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staging">{t.chStaging}</SelectItem>
                  <SelectItem value="beta">beta</SelectItem>
                  <SelectItem value="production">{t.chProduction}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t.releaseNotes}</label>
              <textarea
                value={upNotes}
                onChange={(e) => setUpNotes(e.target.value)}
                rows={2}
                placeholder={t.notesPlaceholder}
                className="w-full rounded-md border bg-background px-3 py-2 text-xs"
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={upSigned} onChange={(e) => setUpSigned(e.target.checked)} />
              {t.markSigned}
            </label>
            {uploadError && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {uploadError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadOpen(false); setUploadError(null); }} disabled={uploading}>{t.cancel}</Button>
            <Button onClick={handleUpload} disabled={uploading} className="gap-1.5">
              {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t.upload}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
