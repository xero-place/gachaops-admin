'use client';

// S251: ライブ配信のリンク再生（KADOKAWA 依頼）
//   リンクを登録 → サーバーが受信して HLS に → 選んだマシンで同期再生。
//   「1台ずつ」と「連結（複数台で1つの映像）」の2通り。既存の番組・素材には触れない。

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { ChevronLeft, Loader2, Plus } from 'lucide-react';
import { usePageT } from '@/i18n/usePageT';
import { liveDict } from '@/i18n/ns/live';
import { useCurrentUser } from '@/lib/use-current-user';

type Target = {
  device_id: string; device_name: string | null; mode: 'each' | 'wall';
  rows: number; cols: number; row: number; col: number; bezel_px: number;
};
type LiveStream = {
  id: string; customer_id: string; name: string; kind?: Kind; source_url: string; has_cookies: boolean;
  desired_state: 'running' | 'stopped'; delay_ms: number; hls_url: string;
  relay: { state: string; message: string; updated_at_ms: number | null };
  targets: Target[];
};
// S253: 種類（ライブ配信 / 動画URL＝素材に取り込み / YouTube＝マシンが直接再生）
type Kind = 'live' | 'video' | 'youtube';
type ImportJob = { job_id: string; state: string; message?: string | null; asset_id?: string | null };
type DeviceLite = { id: string; name: string; app_version?: string | null; customer_name?: string; group_names?: string[] };
type GroupLite = { id: string; name: string; members?: { device_id: string }[] };
type ListResponse<T> = { items?: T[] };

const GRID = [1, 2, 3, 4, 5, 6];

function errMsg(e: unknown): string {
  return e instanceof ApiError ? (e.problem.detail || e.problem.title || '') : (e as Error).message;
}

export default function LivePage() {
  const t = usePageT(liveDict);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [devices, setDevices] = useState<DeviceLite[]>([]);
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 登録フォーム
  const [kind, setKind] = useState<Kind>('live');
  const [job, setJob] = useState<ImportJob | null>(null);
  const jobTimer = useRef<number | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [delaySec, setDelaySec] = useState('15');
  const [cookies, setCookies] = useState('');

  // 再生先
  const [mode, setMode] = useState<'each' | 'wall'>('each');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(2);
  const [bezel, setBezel] = useState('0');
  const [cells, setCells] = useState<Record<string, string>>({});
  const [playMsg, setPlayMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, d, g] = await Promise.all([
        api.get<LiveStream[]>('/live/streams'),
        api.get<ListResponse<DeviceLite> | DeviceLite[]>('/devices?limit=500'),
        api.get<ListResponse<GroupLite> | GroupLite[]>('/device-groups?limit=200').catch(() => [] as GroupLite[]),
      ]);
      const gArr = Array.isArray(g) ? g : (g.items ?? []);
      setGroups(gArr.filter((x) => (x.members ?? []).length > 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true })));
      setStreams(s);
      const dArr = Array.isArray(d) ? d : (d.items ?? []);
      setDevices([...dArr].sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true })));
    } catch (e) {
      console.error('[live] fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // S262p: 一覧の「流しているマシン」に、マシン名・顧客名（スタッフのみ）・グループ名を出す（表示だけ）
  const { isStaff } = useCurrentUser();
  const targetsLabel = (st: LiveStream): string => {
    if (st.targets.length === 0) return t.targetsCount(0);
    const ds = st.targets.map((tg) => ({ tg, d: devices.find((x) => x.id === tg.device_id) }));
    const names = ds.map(({ tg, d }) => d?.name ?? tg.device_name ?? tg.device_id).join('・');
    const custs = Array.from(new Set(ds.map(({ d }) => d?.customer_name).filter((x): x is string => !!x)));
    const grps = Array.from(new Set(ds.flatMap(({ d }) => d?.group_names ?? [])));
    const extra: string[] = [];
    if (isStaff && custs.length > 0) extra.push(custs.join('、'));
    if (grps.length > 0) extra.push(`グループ：${grps.join('、')}`);
    return extra.length > 0 ? `${names}（${extra.join('／')}）` : names;
  };

  // 受信状態は数秒おきに更新
  useEffect(() => {
    const id = window.setInterval(() => {
      api.get<LiveStream[]>('/live/streams').then(setStreams).catch(() => {});
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const stream = useMemo(() => streams.find((s) => s.id === selectedId), [streams, selectedId]);
  const streamKind: Kind = (stream?.kind as Kind) || 'live';
  // S258: 画面は「一覧」「新しく登録」「1件の詳細」の3つ
  const view: 'list' | 'new' | 'detail' = isNew ? 'new' : (stream ? 'detail' : 'list');
  const openStream = (id: string) => {
    setIsNew(false); setSelectedId(id); setMsg(null); setPlayMsg(null);
    setPicked(new Set()); setCells({});
  };
  const backToList = () => {
    setIsNew(false); setSelectedId(''); setMsg(null); setPlayMsg(null); setJob(null);
  };
  const formKind: Kind = isNew ? kind : streamKind;

  // 取り込みの進み具合を数秒おきに確認
  useEffect(() => () => { if (jobTimer.current) window.clearInterval(jobTimer.current); }, []);
  const watchJob = (jobId: string) => {
    if (jobTimer.current) window.clearInterval(jobTimer.current);
    jobTimer.current = window.setInterval(async () => {
      try {
        const j = await api.get<ImportJob>(`/live/import/${jobId}`);
        setJob(j);
        if (j.state === 'done' || j.state === 'error') {
          if (jobTimer.current) window.clearInterval(jobTimer.current);
          jobTimer.current = null;
        }
      } catch { /* 次回に再試行 */ }
    }, 3000);
  };

  useEffect(() => {
    if (isNew || !stream) return;
    setName(stream.name);
    setUrl(stream.source_url);
    setDelaySec(String(Math.round(stream.delay_ms / 1000)));
    setCookies('');
  }, [stream?.id, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNew = () => {
    setIsNew(true); setSelectedId(''); setName(''); setUrl(''); setDelaySec('15'); setCookies(''); setMsg(null);
    setKind('live'); setJob(null);
  };

  // 動画URL：素材として取り込む（配信の登録はしない）
  const startImport = async () => {
    if (!url.trim()) { setMsg(t.enterNameUrl); return; }
    setBusy(true); setMsg(null); setJob(null);
    try {
      const j = await api.post<ImportJob>('/live/import', { url: url.trim(), name: name.trim() });
      setJob(j);
      watchJob(j.job_id);
    } catch (e) {
      setMsg(t.failed(errMsg(e)));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (isNew && kind === 'video') { await startImport(); return; }
    if (!name.trim() || !url.trim()) { setMsg(t.enterNameUrl); return; }
    setBusy(true); setMsg(null);
    const body: Record<string, unknown> = { name: name.trim(), source_url: url.trim() };
    if (formKind === 'live') {
      body.delay_ms = Math.round(Number(delaySec || '15') * 1000);
      if (cookies.trim()) body.cookies_txt = cookies;
    }
    if (isNew) body.kind = kind;
    try {
      if (isNew) {
        const s = await api.post<LiveStream>('/live/streams', body);
        setIsNew(false); setSelectedId(s.id); setMsg(t.created);
      } else if (stream) {
        await api.patch(`/live/streams/${stream.id}`, body);
        setMsg(t.saved);
      }
      setCookies('');
      await reload();
    } catch (e) {
      setMsg(t.failed(errMsg(e)));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!stream || !window.confirm(t.confirmDelete(stream.name))) return;
    setBusy(true);
    try {
      await api.delete(`/live/streams/${stream.id}`);
      setSelectedId(''); setMsg(t.deleted);
      await reload();
    } catch (e) {
      setMsg(t.failed(errMsg(e)));
    } finally {
      setBusy(false);
    }
  };

  const relay = async (action: 'start' | 'stop') => {
    if (!stream) return;
    setBusy(true);
    try {
      await api.post(`/live/streams/${stream.id}/relay/${action}`);
      await reload();
    } catch (e) {
      setMsg(t.failed(errMsg(e)));
    } finally {
      setBusy(false);
    }
  };

  const play = async () => {
    if (!stream) return;
    setBusy(true); setPlayMsg(null);
    const body = (mode === 'each' || streamKind === 'youtube')
      ? { mode: 'each', device_ids: Array.from(picked) }
      : {
        mode, rows, cols, bezel_px: Math.max(0, Math.round(Number(bezel || '0'))),
        tiles: Object.entries(cells)
          .filter(([, d]) => !!d)
          .map(([k, d]) => { const [r, c] = k.split('-').map(Number); return { row: r, col: c, device_id: d }; })
          .filter((x) => x.row < rows && x.col < cols),
      };
    try {
      const res = await api.post<{ sent: string[]; unsupported: { device_name: string | null; device_id: string }[] }>(
        `/live/streams/${stream.id}/play`, body,
      );
      let m = t.sent(res.sent.length);
      if (res.unsupported.length) {
        m += ` ${t.unsupported} ${res.unsupported.map((u) => u.device_name || u.device_id).join('、')}`;
      }
      setPlayMsg(m);
      await reload();
    } catch (e) {
      setPlayMsg(t.failed(errMsg(e)));
    } finally {
      setBusy(false);
    }
  };

  const stopPlay = async (deviceIds?: string[]) => {
    if (!stream) return;
    setBusy(true);
    try {
      const res = await api.post<{ stopped: string[] }>(
        `/live/streams/${stream.id}/stop_play`, { device_ids: deviceIds ?? null },
      );
      setPlayMsg(t.backDone(res.stopped.length));
      await reload();
    } catch (e) {
      setPlayMsg(t.failed(errMsg(e)));
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? devices.filter((d) => d.name.toLowerCase().includes(q) || d.id.includes(q)) : devices;
  }, [devices, query]);

  const usedInWall = new Set(Object.values(cells).filter(Boolean));

  // グループのメンバーを、マシン番号（名前）順に並べて返す
  const groupMembers = (gid: string): string[] => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return [];
    const ids = new Set((g.members ?? []).map((m) => m.device_id));
    return devices.filter((d) => ids.has(d.id)).map((d) => d.id);
  };
  const addGroup = (gid: string) => {
    const ids = groupMembers(gid);
    setPicked((prev) => { const n = new Set(prev); ids.forEach((i) => n.add(i)); return n; });
  };
  // 連結：グループのメンバーを左上から右へ、行ごとに順に枠へ入れる
  const fillWallFromGroup = (gid: string) => {
    const ids = groupMembers(gid);
    const next: Record<string, string> = {};
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        next[`${r}-${c}`] = ids[i] ?? '';
        i++;
      }
    }
    setCells(next);
  };

  if (loading) {
    return (
      <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const relayLabel = stream ? (t.relayState[stream.relay.state] ?? stream.relay.state) : '';
  const relayTone = stream?.relay.state === 'running'
    ? 'text-emerald-600 dark:text-emerald-400'
    : stream?.relay.state === 'error' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
      {view === 'list' ? (
        <div className="flex items-start gap-4 mb-4">
          <p className="text-xs text-muted-foreground pt-2">{t.intro}</p>
          <div className="ml-auto shrink-0">
            <Button size="sm" className="gap-1.5" onClick={startNew}>
              <Plus className="h-3.5 w-3.5" />{t.newRegister}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <button type="button" onClick={backToList}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" />{t.backToList}
          </button>
        </div>
      )}

      {view === 'list' && (
        <Card>
          <CardHeader><CardTitle className="text-sm">{t.listTitle}</CardTitle></CardHeader>
          <CardContent>
            {streams.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noStreams}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 pr-4 font-normal whitespace-nowrap">{t.colKind}</th>
                      <th className="py-2 pr-4 font-normal">{t.colName}</th>
                      <th className="py-2 pr-4 font-normal">{t.colUrl}</th>
                      <th className="py-2 pr-4 font-normal whitespace-nowrap">{t.colTargets}</th>
                      <th className="py-2 pr-4 font-normal whitespace-nowrap">{t.colStatus}</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {streams.map((s) => {
                      const k = (s.kind || 'live') as Kind;
                      return (
                        <tr key={s.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openStream(s.id)}>
                          <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">{t.kindLabel[k]}</td>
                          <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                          <td className="py-2.5 pr-4 text-xs text-muted-foreground max-w-[360px] truncate">{s.source_url}</td>
                          <td className="py-2.5 pr-4 text-sm">{targetsLabel(s)}</td>
                          <td className="py-2.5 pr-4 whitespace-nowrap text-xs text-muted-foreground">
                            {k === 'live' ? (t.relayState[s.relay.state] ?? s.relay.state) : '—'}
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            <span className="text-xs text-muted-foreground underline underline-offset-2">{t.openRow}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {view === 'new' && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{t.newNote}</p>
            <Card>
              <CardHeader><CardTitle className="text-sm">{isNew ? t.newTitle : t.editTitle}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1 max-w-xs">
                  <Label className="text-xs">{t.kind}</Label>
                  <Select value={formKind} disabled={!isNew}
                    onValueChange={(v) => { setKind(v as Kind); setJob(null); setMsg(null); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['live', 'video', 'youtube'] as const).map((k) => (
                        <SelectItem key={k} value={k}>{t.kindLabel[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground">{t.kindNote[formKind]}</p>
                <div className={`grid gap-4 ${formKind === 'live' ? 'sm:grid-cols-[1fr_2fr_120px]' : 'sm:grid-cols-[1fr_2fr]'}`}>
                  <div className="space-y-1">
                    <Label className="text-xs">{t.name}</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePlaceholder} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t.url}</Label>
                    <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t.urlPlaceholderKind[formKind]} />
                  </div>
                  {formKind === 'live' && (
                    <div className="space-y-1">
                      <Label className="text-xs">{t.delay}</Label>
                      <Input type="number" min={6} max={60} value={delaySec} onChange={(e) => setDelaySec(e.target.value)} />
                    </div>
                  )}
                </div>
                {formKind === 'live' && <p className="text-[11px] text-muted-foreground">{t.delayNote}</p>}

                {formKind === 'live' && (
                <details className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <summary className="text-xs cursor-pointer select-none">
                    {t.cookies}{stream?.has_cookies ? `（${t.cookiesSet}）` : ''}
                  </summary>
                  <p className="text-[11px] text-muted-foreground mt-2">{t.cookiesNote}</p>
                  <textarea
                    value={cookies}
                    onChange={(e) => setCookies(e.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono"
                  />
                </details>
                )}

                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={busy || (isNew && kind === 'video' && !!job && job.state !== 'done' && job.state !== 'error')} onClick={save}>
                    {isNew && kind === 'video'
                      ? (busy ? t.importing : t.importBtn)
                      : (busy ? t.saving : (isNew ? t.create : t.save))}
                  </Button>
                  {!isNew && stream && (
                    <Button variant="outline" size="sm" disabled={busy} onClick={remove} className="text-destructive">{t.delete}</Button>
                  )}
                  {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
                </div>

                {isNew && kind === 'video' && job && (
                  <div className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      {job.state !== 'done' && job.state !== 'error' && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                      <span className={job.state === 'error' ? 'text-destructive font-medium' : job.state === 'done' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'font-medium'}>
                        {t.importState[job.state] ?? job.state}
                      </span>
                    </div>
                    {job.state === 'error' && job.message && (
                      <p className="text-muted-foreground break-all">{job.message}</p>
                    )}
                    {job.state === 'done' && (
                      <p className="text-muted-foreground">
                        {t.importDoneNote}{' '}
                        <Link href="/programs" className="underline underline-offset-2 hover:text-foreground">{t.openAssets}</Link>
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
        </div>
      )}

      {view === 'detail' && stream && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">{stream.name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t.kindLabel[streamKind]}　{stream.source_url}</p>
          </div>
              {/* 受信の状態（ライブ配信のみ） */}
              {streamKind === 'live' && (
              <Card>
                <CardHeader><CardTitle className="text-sm">{t.relayTitle}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`text-sm font-medium ${relayTone}`}>{relayLabel}</span>
                    {stream.relay.message && stream.relay.state !== 'running' && (
                      <span className="text-xs text-muted-foreground break-all">{stream.relay.message}</span>
                    )}
                    <div className="ml-auto flex gap-2">
                      {stream.desired_state === 'running' ? (
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => relay('stop')}>{t.relayStop}</Button>
                      ) : (
                        <Button size="sm" disabled={busy} onClick={() => relay('start')}>{t.relayStart}</Button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground break-all">{t.hlsNote}：{stream.hls_url}</p>
                </CardContent>
              </Card>
              )}

              {/* マシンで流す */}
              <Card>
                <CardHeader><CardTitle className="text-sm">{t.playTitle}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {streamKind === 'youtube' ? (
                    <p className="text-xs text-muted-foreground">{t.youtubeEachOnly}</p>
                  ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(['each', 'wall'] as const).map((m) => (
                      <label key={m}
                        className={`flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer transition-colors ${mode === m ? 'border-primary bg-primary/5' : 'border-slate-300 dark:border-slate-700'}`}>
                        <input type="radio" name="live-mode" className="mt-0.5" checked={mode === m} onChange={() => setMode(m)} />
                        <span>
                          <span className="block font-medium">{m === 'each' ? t.modeEach : t.modeWall}</span>
                          <span className="block text-xs text-muted-foreground">{m === 'each' ? t.modeEachNote : t.modeWallNote}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  )}

                  {(mode === 'each' || streamKind === 'youtube') ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <Select value="none" onValueChange={(v) => { if (v !== 'none') addGroup(v); }}>
                          <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder={t.fromGroup} /></SelectTrigger>
                          <SelectContent className="max-h-60">
                            <SelectItem value="none">{t.fromGroup}</SelectItem>
                            {groups.map((g) => (
                              <SelectItem key={g.id} value={g.id}>{t.groupOption(g.name, (g.members ?? []).length)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input className="h-8 max-w-xs text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchDevice} />
                        <span className="text-xs text-muted-foreground">{t.selectedCount(picked.size)}</span>
                        {picked.size > 0 && (
                          <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                            onClick={() => setPicked(new Set())}>{t.clearSelection}</button>
                        )}
                      </div>
                      <div className="grid gap-1 sm:grid-cols-3 lg:grid-cols-4 max-h-72 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 p-2">
                        {filtered.map((d) => (
                          <label key={d.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50 cursor-pointer">
                            <Checkbox
                              checked={picked.has(d.id)}
                              onCheckedChange={(v) => setPicked((prev) => {
                                const n = new Set(prev);
                                if (v) n.add(d.id); else n.delete(d.id);
                                return n;
                              })}
                            />
                            <span className="truncate">{d.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-[120px_120px_160px]">
                        <div className="space-y-1">
                          <Label className="text-xs">{t.rows}</Label>
                          <Select value={String(rows)} onValueChange={(v) => setRows(Number(v))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{GRID.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t.cols}</Label>
                          <Select value={String(cols)} onValueChange={(v) => setCols(Number(v))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{GRID.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t.bezel}</Label>
                          <Input type="number" min={0} max={400} value={bezel} onChange={(e) => setBezel(e.target.value)} />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{t.bezelNote}</p>
                      <div className="flex flex-wrap items-center gap-3">
                        <Select value="none" onValueChange={(v) => { if (v !== 'none') fillWallFromGroup(v); }}>
                          <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder={t.fillFromGroup} /></SelectTrigger>
                          <SelectContent className="max-h-60">
                            <SelectItem value="none">{t.fillFromGroup}</SelectItem>
                            {groups.map((g) => (
                              <SelectItem key={g.id} value={g.id}>{t.groupOption(g.name, (g.members ?? []).length)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-[11px] text-muted-foreground">{t.fillNote}</span>
                      </div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                        {Array.from({ length: rows }).flatMap((_, r) => Array.from({ length: cols }).map((__, c) => {
                          const key = `${r}-${c}`;
                          const val = cells[key] || '';
                          return (
                            <div key={key} className="rounded-md border border-slate-200 dark:border-slate-700 p-2 space-y-1 aspect-[4/5] flex flex-col justify-center">
                              <span className="text-[11px] text-muted-foreground">{t.cell(r, c)}</span>
                              <Select value={val || 'none'} onValueChange={(v) => setCells((p) => ({ ...p, [key]: v === 'none' ? '' : v }))}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="max-h-60">
                                  <SelectItem value="none">{t.unassigned}</SelectItem>
                                  {devices.filter((d) => d.id === val || !usedInWall.has(d.id)).map((d) => (
                                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        }))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <Button size="sm" disabled={busy} onClick={play}>{busy ? t.playing : t.playBtn}</Button>
                    {playMsg && <p className="text-xs text-muted-foreground">{playMsg}</p>}
                  </div>
                </CardContent>
              </Card>

              {/* 流しているマシン */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm">{t.targetsTitle}</CardTitle>
                  {stream.targets.length > 0 && (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => stopPlay()}>{t.backAll}</Button>
                  )}
                </CardHeader>
                <CardContent>
                  {stream.targets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t.noTargets}</p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {stream.targets.map((tg) => (
                        <div key={tg.device_id} className="flex items-center gap-3 py-2 text-sm">
                          <span className="font-medium">{tg.device_name || tg.device_id}</span>
                          <span className="text-xs text-muted-foreground">
                            {tg.mode === 'wall' ? t.wallPos(tg.rows, tg.cols, tg.row, tg.col) : t.each}
                          </span>
                          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" disabled={busy}
                            onClick={() => stopPlay([tg.device_id])}>{t.backOne}</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

          {/* 名前・リンクの編集（普段は閉じておく） */}
          <details className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card">
            <summary className="cursor-pointer select-none px-6 py-4 text-sm font-medium">{t.editTitle}</summary>
            <div className="px-0 pb-0">
          <Card className="border-0 shadow-none bg-transparent">
            
            <CardContent className="space-y-4">
              <div className="space-y-1 max-w-xs">
                <Label className="text-xs">{t.kind}</Label>
                <Select value={formKind} disabled={!isNew}
                  onValueChange={(v) => { setKind(v as Kind); setJob(null); setMsg(null); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['live', 'video', 'youtube'] as const).map((k) => (
                      <SelectItem key={k} value={k}>{t.kindLabel[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground">{t.kindNote[formKind]}</p>
              <div className={`grid gap-4 ${formKind === 'live' ? 'sm:grid-cols-[1fr_2fr_120px]' : 'sm:grid-cols-[1fr_2fr]'}`}>
                <div className="space-y-1">
                  <Label className="text-xs">{t.name}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePlaceholder} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t.url}</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t.urlPlaceholderKind[formKind]} />
                </div>
                {formKind === 'live' && (
                  <div className="space-y-1">
                    <Label className="text-xs">{t.delay}</Label>
                    <Input type="number" min={6} max={60} value={delaySec} onChange={(e) => setDelaySec(e.target.value)} />
                  </div>
                )}
              </div>
              {formKind === 'live' && <p className="text-[11px] text-muted-foreground">{t.delayNote}</p>}

              {formKind === 'live' && (
              <details className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2">
                <summary className="text-xs cursor-pointer select-none">
                  {t.cookies}{stream?.has_cookies ? `（${t.cookiesSet}）` : ''}
                </summary>
                <p className="text-[11px] text-muted-foreground mt-2">{t.cookiesNote}</p>
                <textarea
                  value={cookies}
                  onChange={(e) => setCookies(e.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono"
                />
              </details>
              )}

              <div className="flex items-center gap-2">
                <Button size="sm" disabled={busy || (isNew && kind === 'video' && !!job && job.state !== 'done' && job.state !== 'error')} onClick={save}>
                  {isNew && kind === 'video'
                    ? (busy ? t.importing : t.importBtn)
                    : (busy ? t.saving : (isNew ? t.create : t.save))}
                </Button>
                {!isNew && stream && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={remove} className="text-destructive">{t.delete}</Button>
                )}
                {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
              </div>

              {isNew && kind === 'video' && job && (
                <div className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    {job.state !== 'done' && job.state !== 'error' && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                    <span className={job.state === 'error' ? 'text-destructive font-medium' : job.state === 'done' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'font-medium'}>
                      {t.importState[job.state] ?? job.state}
                    </span>
                  </div>
                  {job.state === 'error' && job.message && (
                    <p className="text-muted-foreground break-all">{job.message}</p>
                  )}
                  {job.state === 'done' && (
                    <p className="text-muted-foreground">
                      {t.importDoneNote}{' '}
                      <Link href="/programs" className="underline underline-offset-2 hover:text-foreground">{t.openAssets}</Link>
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
            </div>
          </details>
        </div>
      )}
    </AppShell>
  );
}
