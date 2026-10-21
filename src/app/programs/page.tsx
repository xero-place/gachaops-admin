'use client';

/**
 * S262q: 「映像」— 旧「映像（プログラム）」と「映像の素材」を1つの画面にまとめた。
 *
 * 使う呼び出しはすべて既存のもの（中身も同じ）:
 *   - 一覧        GET /programs?limit=100[&owner=self|customer]   … 旧 programs/page.tsx の raw fetch
 *                 GET /assets?limit=100[&owner=self|customer]     … 旧 assets/page.tsx
 *   - アップロード POST /assets/upload (multipart: file, name)      … 旧 assets/page.tsx の XHR（30分タイムアウト・1.4GiB上限）をそのまま
 *   - 削除        DELETE /assets/{id}[?force=true]                  … 旧 assets/page.tsx（使用中409→確認→force）
 *   - ★S269: アップロード後に自動で「流せる映像」を作る: POST /programs/from-asset {asset_id}（1回・失敗時は何も残らない）
 *   - （旧）流せるようにする（1本の映像から）:
 *       POST /programs {name, description}                         … programs/new/page.tsx
 *       POST /programs/{id}/scenes {name, duration_sec, order_index:0} … programs/[id] AddSceneModal
 *       POST /programs/{id}/scenes/{sid}/widgets {type, asset_id, x:0,y:0,width:100,height:100,z_index:0,config:{}} … 同上
 *       POST /programs/{id}/publish                                 … programs/[id] handlePublish
 *   - 準備中の映像を流せるようにする: POST /programs/{id}/publish   … 同上
 * データの形（公開/下書き）は変えていない。画面では「公開」「下書き」という言葉を出さない。
 */
import Link from 'next/link';
import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { fmtDuration, fmtBytes, fmtRelative } from '@/lib/format';
import { Film, Image as ImageIcon, Loader2, Upload, Layers, Play } from 'lucide-react';
import { tokenStore } from '@/lib/token-store';
import { SearchBox } from '@/components/domain/wizard';
import { cn } from '@/lib/utils';
import type { Asset } from '@/types/domain';
import { PlayDialog } from '@/components/domain/play-wizard';

type ScenePreview = {
  scene_id: string;
  order_index: number;
  duration_sec: number;
  asset_type: 'video' | 'image' | 'gif' | null;
  thumbnail_url: string | null;
  asset_duration_ms?: number | null;
  asset_name?: string | null;
};

function getDisplayDurationSec(sp: ScenePreview): number {
  if (sp.asset_type === 'video' && sp.asset_duration_ms && sp.asset_duration_ms > 0) {
    return Math.ceil(sp.asset_duration_ms / 1000);
  }
  return sp.duration_sec;
}
function getProgramTotalSec(scenePreviews?: ScenePreview[], fallback?: number): number {
  if (!scenePreviews || scenePreviews.length === 0) return fallback ?? 0;
  return scenePreviews.reduce((sum, sp) => sum + getDisplayDurationSec(sp), 0);
}

type Program = {
  id: string;
  customer_id: string;
  customer_name?: string;
  name: string;
  description: string | null;
  total_duration_sec: number;
  published: boolean;
  scene_count?: number;
  size_bytes?: number;
  scene_previews?: ScenePreview[];
  processing?: boolean; // ★S270: 中の動画がマシン向けに変換中（準備中）。終わるまで流せない
  has_media?: boolean; // ★S271: 動画・画像が入っているか（false なら流せない）
  created_at: string;
  updated_at: string;
};

const MAX_BYTES = 1503238553; // 1.4 GiB（旧「映像の素材」と同じ。backend の MAX_UPLOAD_BYTES と一致）
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';

const baseName = (n: string) => n.replace(/\.[^.]+$/, '');

export default function VideosPage() {
  const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';
  const myCid = tokenStore.getUser()?.customer_id;
  const [ownerTab, setOwnerTab] = useState<'self' | 'customer'>('self');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const reqSeq = useRef(0);

  // upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [justUploaded, setJustUploaded] = useState<Asset | null>(null);
  // make playable
  const [making, setMaking] = useState<string | null>(null); // asset id or program id
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // ★S271: いま追加した映像（準備が終わったら「この映像をマシンで流す」を出す）
  const [lastMade, setLastMade] = useState<{ id: string; name: string } | null>(null);
  // ★S271: この画面のまま「マシンで流す」（null=閉じている / ''=映像を選ぶところから / id=その映像を選んだ状態で）
  const [playFor, setPlayFor] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const seq = ++reqSeq.current;
    try {
      const token = tokenStore.getAccess();
      const ownerParam = isSuperAdmin ? `&owner=${ownerTab}` : '';
      const headers = { Authorization: `Bearer ${token}` };
      const [pr, ar] = await Promise.all([
        fetch(`${apiBase}/programs?limit=100${ownerParam}`, { headers }),
        fetch(`${apiBase}/assets?limit=100${ownerParam}`, { headers }),
      ]);
      const pj = pr.ok ? await pr.json() : { items: [] };
      const aj = ar.ok ? await ar.json() : { items: [] };
      if (seq !== reqSeq.current) return;
      setPrograms(pj.items ?? pj ?? []);
      const al = aj.items ?? aj.data ?? aj ?? [];
      setAssets(Array.isArray(al) ? al : []);
    } catch (err) {
      console.error('[videos] fetch failed:', err);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [ownerTab, isSuperAdmin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ★S270: 変換中（準備中）のものがある間は、5秒ごとに一覧を読み直す（終われば自動で「マシンで流せます」に変わる）
  const anyProcessing = programs.some((p) => p.processing) || assets.some((a) => a.processing);
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(() => { fetchAll(); }, 5000);
    return () => clearInterval(t);
  }, [anyProcessing, fetchAll]);

  // ── アップロード（旧 assets/page.tsx と同じ XHR） ──
  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadError(null);
    setJustUploaded(null);
    setNotice(null);
    if (file.size > MAX_BYTES) {
      setUploadError(`ファイルが大きすぎます（${(file.size / 1024 / 1024).toFixed(1)} MB）。1.4GBまでのファイルを選んでください。`);
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const token = tokenStore.getAccess();
      if (!token) throw new Error('ログインし直してください。');
      const created = await new Promise<Asset>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status === 201) {
            try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('結果を読み取れませんでした。')); }
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.detail ?? err.title ?? `HTTP ${xhr.status}`));
            } catch {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          }
        };
        xhr.onerror = () => reject(new Error('通信できませんでした。'));
        xhr.ontimeout = () => reject(new Error('時間がかかりすぎたため止まりました。'));
        xhr.open('POST', `${apiBase}/assets/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.timeout = 30 * 60 * 1000;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', file.name);
        xhr.send(formData);
      });
      setAssets((prev) => [created, ...prev]);
      // ★S269: 追加したら、そのままマシンで流せる映像にする（ボタンを押す手間なし）
      if (created.type === 'video' || created.type === 'image' || created.type === 'gif') {
        await makePlayable(created);
      } else {
        setJustUploaded(created);
      }
    } catch (err) {
      setUploadError(`追加できませんでした：${err instanceof Error ? err.message : '原因がわかりません'}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ── 1本の映像から、マシンで流せる映像を作る ──
  //   ★S269: サーバーの1回の呼び出し（POST /programs/from-asset）で作る。途中で失敗しても空の映像は残らない。
  const makePlayable = async (a: Asset) => {
    setMaking(a.id);
    setActionError(null);
    setNotice(null);
    try {
      const token = tokenStore.getAccess();
      const res = await fetch(`${apiBase}/programs/from-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ asset_id: a.id }),
      });
      if (!res.ok) {
        let d = `HTTP ${res.status}`;
        try { const j = await res.json(); d = j.detail || j.title || d; } catch { /* noop */ }
        throw new Error(d);
      }
      try {
        const made = await res.json();
        if (made?.id) setLastMade({ id: made.id, name: made.name || baseName(a.name) });
      } catch { /* 一覧の読み直しで出る */ }
      setJustUploaded(null);
      await fetchAll();
    } catch (err) {
      setActionError(`「${baseName(a.name)}」は追加しましたが、マシンで流せる映像にできませんでした（${err instanceof Error ? err.message : ''}）。下の一覧の「マシンで流せる映像にする」を押してください。`);
    } finally {
      setMaking(null);
    }
  };

  // 削除（旧 assets/page.tsx と同じ流れ）
  const deleteAsset = async (a: Asset) => {
    const isCustomerItem = isSuperAdmin && a.customer_id !== myCid;
    const who = a.customer_name || a.customer_id;
    const msg = isCustomerItem
      ? `顧客「${who}」の映像ファイル「${a.name}」を削除します。顧客の画面からも消え、元に戻せません。よろしいですか？`
      : `映像ファイル「${a.name}」を削除します。元に戻せません。よろしいですか？`;
    const usage = (a.used_in_program_count ?? 0) > 0 ? `\n\nこのファイルは ${a.used_in_program_count} 本の映像で使われています。削除するとその映像が正しく流れなくなります。` : '';
    if (!confirm(msg + usage)) return;
    const token = tokenStore.getAccess();
    const doDelete = (force: boolean) =>
      fetch(`${apiBase}/assets/${a.id}${force ? '?force=true' : ''}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    try {
      let res = await doDelete(false);
      if (res.status === 409) {
        let detail = 'このファイルは使われています。';
        try { const j = await res.json(); detail = j.detail || j.title || detail; } catch { /* noop */ }
        // ★S269: マシンで流している最中のファイルは消せない（サーバーが拒否する）。確認を出さずに理由だけ伝える。
        if (detail.includes('マシンで流している')) { alert(detail); return; }
        if (!confirm(`${detail}\n\n使っている映像が正しく流れなくなりますが、削除しますか？`)) return;
        res = await doDelete(true);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAssets((prev) => prev.filter((x) => x.id !== a.id));
    } catch (err) {
      alert(`削除できませんでした（${String(err)}）`);
    }
  };

  const q = search.trim().toLowerCase();
  const fp = useMemo(() => programs.filter((p) => !q || p.name.toLowerCase().includes(q)), [programs, q]);
  const fa = useMemo(() => assets.filter((a) => !q || a.name.toLowerCase().includes(q)), [assets, q]);
  const ownerLabel = (cid: string, name?: string) => (isSuperAdmin && cid !== myCid ? (name || cid) : null);

  return (
    <AppShell title="映像">
      <div className="flex w-full max-w-[1200px] flex-col gap-6">
        {/* 映像を追加する */}
        <section className="flex flex-col gap-4 rounded-card border bg-card p-5 sm:p-[22px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-[17px] font-bold">映像を追加する</h2>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                パソコンの動画・画像ファイルを選ぶと、そのままマシンで流せる映像になります（1.4GBまで）。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={fileInputRef} type="file" accept="video/*,image/*" onChange={handleFileSelect} className="hidden" />
              <Button onClick={() => !uploading && fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                {uploading ? `追加しています… ${uploadProgress}%` : 'ファイルを選んで追加する'}
              </Button>
              <Button asChild variant="outline">
                <Link href="/programs/new"><Layers />複数の映像をつなげて1本にする</Link>
              </Button>
              <Button variant="outline" onClick={() => setPlayFor('')}>
                <Play />マシンで流す
              </Button>
            </div>
          </div>
          {uploading && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
              <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
          {uploadError && <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive">{uploadError}</div>}
          {justUploaded && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-primary/40 bg-primary/5 px-4 py-3.5">
              <span className="text-[15px] font-bold">「{justUploaded.name}」を追加しました。（この種類のファイルはマシンでは流せません）</span>
            </div>
          )}
          {notice && (
            <div role="status" className="rounded-[10px] border border-ok/30 bg-ok/5 px-4 py-3 text-sm font-bold text-ok">{notice}</div>
          )}
          {lastMade && (() => {
            // ★S271: 準備中はボタンを出さない。準備が終わったら「この映像をマシンで流す」を出す
            const lp = programs.find((x) => x.id === lastMade.id);
            const ready = !!lp && !lp.processing && lp.has_media !== false;
            return ready ? (
              <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-ok/40 bg-ok/5 px-4 py-3.5">
                <span className="text-[15px] font-bold text-ok">「{lastMade.name}」の準備ができました。マシンで流せます。</span>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setPlayFor(lastMade.id)}><Play />この映像をマシンで流す</Button>
                  <Button variant="ghost" onClick={() => setLastMade(null)}>あとで</Button>
                </div>
              </div>
            ) : (
              <div role="status" className="flex items-center gap-2.5 rounded-[10px] border border-warn/30 bg-warn/5 px-4 py-3.5 text-[15px] font-bold text-warn">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                「{lastMade.name}」を追加しました。いまマシン向けに変換しています（30秒ほど）。終わると、ここに「マシンで流す」ボタンが出ます。
              </div>
            );
          })()}
          {actionError && <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive">{actionError}</div>}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[240px] flex-1 sm:max-w-md">
            <SearchBox value={search} onChange={setSearch} placeholder="映像の名前で探す" />
          </div>
          {isSuperAdmin && (
            <div className="inline-flex rounded-[10px] border bg-card p-1" role="group" aria-label="表示する映像">
              {(['self', 'customer'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOwnerTab(k)}
                  aria-pressed={ownerTab === k}
                  className={cn('min-h-[40px] rounded-lg px-4 text-sm font-bold', ownerTab === k ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
                >
                  {k === 'self' ? '自社' : '顧客'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* マシンで流せる映像 */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-bold">マシンで流す映像（{fp.length}本）</h2>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />読み込んでいます…</div>
          ) : fp.length === 0 ? (
            <div className="rounded-card border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
              {programs.length === 0 ? 'まだ映像がありません。上の「ファイルを選んで追加する」から始めてください。' : `「${search}」に当てはまる映像はありません。`}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fp.map((p) => {
                const owner = ownerLabel(p.customer_id, p.customer_name);
                const thumbs = p.scene_previews ?? [];
                const files = [...new Set(thumbs.map((s) => s.asset_name).filter(Boolean))];
                return (
                  <li key={p.id} className="flex flex-col overflow-hidden rounded-card border bg-card">
                    <Link href={`/programs/${p.id}`} className="relative block aspect-video bg-[#111111]">
                      {thumbs.length > 0 ? (
                        <div className="absolute inset-0 flex">
                          {thumbs.map((scene, i) => (
                            <div key={scene.scene_id} className="relative h-full min-w-0 flex-1 border-r border-black/30 last:border-r-0">
                              {scene.thumbnail_url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={scene.thumbnail_url} alt={`${i + 1}つ目`} className="absolute inset-0 h-full w-full object-cover" />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-white/50">
                                  {scene.asset_type === 'video' ? <Film className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60">映像がまだ入っていません</div>
                      )}
                    </Link>
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <Link href={`/programs/${p.id}`} className="text-[15px] font-bold leading-snug hover:underline">{p.name}</Link>
                      {owner && <span className="text-[13px] text-muted-foreground">{owner}</span>}
                      <span className="text-[13px] text-muted-foreground">
                        {fmtDuration(getProgramTotalSec(p.scene_previews, p.total_duration_sec) * 1000)}
                        {(p.scene_count ?? 0) > 1 && `・${p.scene_count}本をつなげた映像`}
                        {files.length > 0 && (p.scene_count ?? 0) <= 1 && `・${files.join('、')}`}
                      </span>
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                        {p.has_media === false ? (
                          <span className="text-[13px] font-bold text-destructive">映像が入っていません（流せません）</span>
                        ) : p.published && p.processing ? (
                          <span className="inline-flex items-center gap-1 text-[13px] font-bold text-warn">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />準備中（30秒ほど）
                          </span>
                        ) : p.published ? (
                          <Button size="sm" onClick={() => setPlayFor(p.id)}><Play />マシンで流す</Button>
                        ) : (
                          <span className="text-[13px] text-muted-foreground">作成中（まだ流せません）</span>
                        )}
                        {!p.published && (p.scene_count ?? thumbs.length) > 0 && (
                          <Link href={`/programs/${p.id}`} className="text-sm font-bold underline-offset-4 hover:underline">開いて仕上げる →</Link>
                        )}
                        {!p.published && (p.scene_count ?? thumbs.length) === 0 && (
                          <Link href={`/programs/${p.id}`} className="text-sm font-bold underline-offset-4 hover:underline">開いて映像を入れる →</Link>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 追加した映像ファイル */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-[17px] font-bold">追加した映像ファイル（{fa.length}件）</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">追加したファイルは、そのまま上の「マシンで流す映像」に加わります。マシンで流している映像のファイルは削除できません。</p>
          </div>
          {!loading && fa.length === 0 ? (
            <div className="rounded-card border bg-card px-6 py-8 text-center text-sm text-muted-foreground">追加したファイルはまだありません。</div>
          ) : (
            <ul className="flex flex-col divide-y rounded-card border bg-card">
              {fa.map((a) => {
                const owner = ownerLabel(a.customer_id, a.customer_name);
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#111111]">
                      {a.thumbnail_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={a.thumbnail_url} alt="" className="h-full w-full object-cover" />
                      ) : a.type === 'video' ? <Film className="h-5 w-5 text-white/50" /> : <ImageIcon className="h-5 w-5 text-white/50" />}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="break-all text-[15px] font-bold">{a.name}</span>
                      <span className="text-[13px] text-muted-foreground">
                        {a.type === 'video' ? '動画' : a.type === 'image' || a.type === 'gif' ? '画像' : a.type}
                        ・{fmtBytes(a.size)}{a.duration_ms ? `・${fmtDuration(a.duration_ms)}` : ''}
                        {owner ? `・${owner}` : ''}
                        ・{a.used_in_program_count > 0 ? `${a.used_in_program_count}本の映像で使用中` : 'まだ使われていません'}
                        ・{fmtRelative(a.created_at)}
                        {a.processing && <span className="font-bold text-warn">・準備中（30秒ほど）</span>}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {(a.type === 'video' || a.type === 'image' || a.type === 'gif') && (a.used_in_program_count ?? 0) === 0 && (
                        <Button variant="outline" onClick={() => makePlayable(a)} disabled={making === a.id}>
                          {making === a.id && <Loader2 className="animate-spin" />}
                          マシンで流せる映像にする
                        </Button>
                      )}
                      <button
                        type="button"
                        className="min-h-[44px] rounded-[10px] px-3 text-sm text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
                        onClick={() => deleteAsset(a)}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ★S271: この画面のまま、映像を選んでマシンで流す（中身は /play と同じ手順） */}
      {playFor !== null && (
        <PlayDialog
          programId={playFor || undefined}
          onClose={() => { if (playFor) setLastMade(null); setPlayFor(null); fetchAll(); }}
        />
      )}
    </AppShell>
  );
}
