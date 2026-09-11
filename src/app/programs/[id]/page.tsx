'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Plus, Send, Layers, Trash2, ChevronUp, ChevronDown, Film, Image as ImageIcon, X, Save } from 'lucide-react';
import { tokenStore } from '@/lib/token-store';
import { fmtDuration, fmtBytes } from '@/lib/format';
import { usePageT } from '@/i18n/usePageT';
import { programDetailDict } from '@/i18n/ns/programDetail';

type Asset = {
  id: string;
  name: string;
  type: 'video' | 'image' | 'gif' | 'audio' | 'html';
  url: string;
  thumbnail_url: string | null;
  size: number;
  duration_ms: number | null;
};

type Widget = {
  id: string;
  scene_id: string;
  type: string;
  asset_id: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  config: Record<string, unknown>;
};

type Scene = {
  id: string;
  program_id: string;
  name: string;
  duration_sec: number;
  order_index: number;
  background_color: string | null;
  widget_count?: number;
  widgets?: Widget[];
  primary_asset_type?: 'video' | 'image' | 'gif' | null;
  primary_thumbnail_url?: string | null;
  primary_asset_duration_ms?: number | null;
  primary_asset_name?: string | null;  // S224: セットされた素材名
};

// Session 13: 表示用の秒数を取得 (動画は実長、画像/gif は duration_sec)
function getDisplayDurationSec(sc: Scene): number {
  if (sc.primary_asset_type === 'video' && sc.primary_asset_duration_ms && sc.primary_asset_duration_ms > 0) {
    return Math.ceil(sc.primary_asset_duration_ms / 1000);
  }
  return sc.duration_sec;
}

type Program = {
  id: string;
  customer_id?: string;      // ★assetowner: 顧客分削除確認用
  customer_name?: string;    // ★assetowner: 顧客名表示用
  name: string;
  description: string | null;
  total_duration_sec: number;
  published: boolean;
  scene_count?: number;
  size_bytes?: number;
  widget_count?: number;
};

export default function ProgramDetailPage() {
  const t = usePageT(programDetailDict);
  const params = useParams();
  const router = useRouter();
  const programId = String(params.id);
  
  const [program, setProgram] = useState<Program | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddScene, setShowAddScene] = useState(false);
  const [busy, setBusy] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';

  const fetchData = useCallback(async () => {
    try {
      const token = tokenStore.getAccess();
      const headers = { Authorization: `Bearer ${token}` };
      
      const [progRes, scenesRes] = await Promise.all([
        fetch(`${apiBase}/programs/${programId}`, { headers }),
        fetch(`${apiBase}/programs/${programId}/scenes`, { headers }),
      ]);
      
      if (!progRes.ok) {
        if (progRes.status === 404) {
          router.push('/programs');
          return;
        }
        throw new Error(`HTTP ${progRes.status}`);
      }
      
      const prog = await progRes.json();
      const scenesData = scenesRes.ok ? await scenesRes.json() : [];
      
      setProgram(prog);
      setScenes(Array.isArray(scenesData) ? scenesData : (scenesData.items ?? []));
    } catch (err) {
      console.error('fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBase, programId, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteScene = async (sceneId: string, name: string) => {
    if (!confirm(t.confirmDeleteScene(name))) return;
    setBusy(true);
    try {
      const token = tokenStore.getAccess();
      const res = await fetch(`${apiBase}/programs/${programId}/scenes/${sceneId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchData();
    } catch (err) {
      alert(t.deleteFailed(String(err)));
    } finally {
      setBusy(false);
    }
  };

  const handleMoveScene = async (sceneId: string, direction: 'up' | 'down') => {
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= scenes.length) return;
    
    setBusy(true);
    try {
      const token = tokenStore.getAccess();
      // Swap order_index
      const a = scenes[idx];
      const b = scenes[newIdx];
      await Promise.all([
        fetch(`${apiBase}/programs/${programId}/scenes/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ order_index: b.order_index }),
        }),
        fetch(`${apiBase}/programs/${programId}/scenes/${b.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ order_index: a.order_index }),
        }),
      ]);
      await fetchData();
    } catch (err) {
      alert(t.reorderFailed(String(err)));
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!program) return;
    if (scenes.length === 0) {
      alert(t.addSceneFirst);
      return;
    }
    setBusy(true);
    try {
      const token = tokenStore.getAccess();
      const res = await fetch(`${apiBase}/programs/${programId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchData();
      alert(t.published);
    } catch (err) {
      alert(t.publishFailed(String(err)));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProgram = async () => {
    if (!program) return;
    // ★assetowner: 顧客のプログラムを消す時は「顧客アカウントからも消える/復元不可」を明示。
    const _u = tokenStore.getUser();
    const isCustomerItem = _u?.role === 'lv1_super' && !!program.customer_id && program.customer_id !== _u?.customer_id;
    const who = program.customer_name || program.customer_id;
    const msg = isCustomerItem
      ? t.deleteCustomerMsg(who ?? '', program.name)
      : t.deleteSelfMsg(program.name);
    if (!confirm(msg)) return;
    setBusy(true);
    const token = tokenStore.getAccess();
    // ★delguard: 使用中(409)なら詳細を見せて強制削除の再確認。force=true で上書き。
    const doDelete = (force: boolean) =>
      fetch(`${apiBase}/programs/${programId}${force ? '?force=true' : ''}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    try {
      let res = await doDelete(false);
      if (res.status === 409) {
        let detail = t.inUse;
        try { const j = await res.json(); detail = j.detail || j.title || detail; } catch {}
        if (!confirm(t.forceDeleteConfirm(detail))) { setBusy(false); return; }
        res = await doDelete(true);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push('/programs');
    } catch (err) {
      alert(t.deleteFailed(String(err)));
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AppShell title={t.loading} breadcrumb={[t.home, t.bcPrograms]}>
        <div className="text-sm text-muted-foreground p-6">{t.loading}</div>
      </AppShell>
    );
  }

  if (!program) {
    return (
      <AppShell title={t.error} breadcrumb={[t.home, t.bcPrograms]}>
        <div className="text-sm text-destructive p-6">{t.notFound}</div>
      </AppShell>
    );
  }

  const totalDuration = scenes.reduce((sum, s) => sum + getDisplayDurationSec(s), 0);

  return (
    <AppShell title={program.name} breadcrumb={[t.home, t.bcPrograms, program.id]}>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/programs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />{t.backToList}
          </Link>
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDeleteProgram} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" />{t.delete}
          </Button>
          {!program.published ? (
            <Button size="sm" className="gap-1.5" onClick={handlePublish} disabled={busy || scenes.length === 0}>
              <Send className="h-3.5 w-3.5" />{t.publish}
            </Button>
          ) : (
            <Badge className="px-3 py-1.5">{t.publishedBadge}</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4" />{t.sceneComposition(scenes.length)}
              </CardTitle>
              <Button variant="default" size="sm" className="h-8 gap-1" onClick={() => setShowAddScene(true)}>
                <Plus className="h-3.5 w-3.5" />{t.addScene}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {scenes.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {t.noScenes}
                </div>
              ) : (
(() => {
                  const n = scenes.length;
                  // S224: サムネを枠いっぱいに拡大（16:9寄りの大きめ枠＋object-cover）
                  const thumbSize =
                    n <= 4 ? 'w-40 h-24' :
                    n <= 8 ? 'w-32 h-20' :
                              'w-24 h-16';
                  const iconSize =
                    n <= 2 ? 'h-7 w-7' :
                    n <= 4 ? 'h-6 w-6' :
                    n <= 6 ? 'h-5 w-5' :
                              'h-4 w-4';
                  return scenes.map((sc, i) => (
                  <div key={sc.id} className="flex items-center gap-3 p-3 border rounded-md hover:bg-accent/40">
                    <div className="flex flex-col gap-0.5">
                      <button
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        onClick={() => handleMoveScene(sc.id, 'up')}
                        disabled={i === 0 || busy}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        onClick={() => handleMoveScene(sc.id, 'down')}
                        disabled={i === scenes.length - 1 || busy}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <div className={`relative ${thumbSize} rounded overflow-hidden bg-black/60 flex-shrink-0`}>
                      {sc.primary_thumbnail_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={sc.primary_thumbnail_url}
                          alt={sc.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: sc.background_color ?? '#475569' }}>
                          {sc.primary_asset_type === 'video' ? (
                            <Film className={`${iconSize} text-white/80`} />
                          ) : sc.primary_asset_type === 'image' || sc.primary_asset_type === 'gif' ? (
                            <ImageIcon className={`${iconSize} text-white/80`} />
                          ) : (
                            <span className="text-white font-bold">{i + 1}</span>
                          )}
                        </div>
                      )}
                      <div className="absolute top-0 left-0 bg-primary text-primary-foreground text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-br">
                        {i + 1}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/75 text-white text-[9px] text-center px-1 leading-tight">
                        {getDisplayDurationSec(sc)}s
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{sc.name}</div>
                      {sc.primary_asset_name && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate mt-0.5">
                          <Film className="h-3 w-3 shrink-0" />
                          <span className="truncate">{sc.primary_asset_name}</span>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {fmtDuration(getDisplayDurationSec(sc) * 1000)}
                        {sc.widget_count && sc.widget_count > 0 ? t.widgetSuffix(sc.widget_count) : ''}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDeleteScene(sc.id, sc.name)} disabled={busy}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ));})()
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.programInfo}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.totalTime}</span>
                <span className="font-medium">{fmtDuration(totalDuration * 1000)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.sceneCount}</span>
                <span className="font-medium">{scenes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.size}</span>
                <span className="font-medium tabular-nums">{fmtBytes(program.size_bytes ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.status}</span>
                <span className="font-medium">{program.published ? t.publishedBadge : t.draft}</span>
              </div>
              {program.description && (
                <div className="pt-2 border-t">
                  <div className="text-muted-foreground mb-1">{t.description}</div>
                  <div className="text-sm">{program.description}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {showAddScene && (
        <AddSceneModal
          apiBase={apiBase}
          programId={programId}
          nextOrderIndex={scenes.length}
          currentSizeBytes={program.size_bytes ?? 0}
          onClose={() => setShowAddScene(false)}
          onCreated={() => {
            setShowAddScene(false);
            fetchData();
          }}
        />
      )}
    </AppShell>
  );
}

function AddSceneModal({
  apiBase,
  programId,
  nextOrderIndex,
  currentSizeBytes,
  onClose,
  onCreated,
}: {
  apiBase: string;
  programId: string;
  nextOrderIndex: number;
  currentSizeBytes: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = usePageT(programDetailDict);
  const [name, setName] = useState(t.sceneNameDefault(nextOrderIndex + 1));
  const [durationSec, setDurationSec] = useState(10);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filter, setFilter] = useState<'all' | 'video' | 'image'>('all');
  const [creating, setCreating] = useState(false);

  // Session 13: 選択中の asset を取得し、種別に応じて durationSec を自動調整
  const selectedAsset = assets.find((a) => a.id === selectedAssetId) ?? null;
  const isVideo = selectedAsset?.type === 'video';
  const isImage = selectedAsset?.type === 'image' || selectedAsset?.type === 'gif';
  // 動画→実長セット, 画像/gif→10秒にリセット (前の動画値が残らないように)
  // ※ 画像から別の画像への遷移時は値を保持したいので、type の変化のみを検知
  const prevAssetTypeRef = React.useRef<string | null>(null);
  useEffect(() => {
    const curType = selectedAsset?.type ?? null;
    const prevType = prevAssetTypeRef.current;
    if (isVideo && selectedAsset?.duration_ms && selectedAsset.duration_ms > 0) {
      // 動画を選択 → 実長を set (動画 → 別動画 も毎回 set される)
      setDurationSec(Math.ceil(selectedAsset.duration_ms / 1000));
    } else if (isImage && prevType !== 'image' && prevType !== 'gif') {
      // 未選択/動画 → 画像 に切り替わった瞬間のみ 10 秒にリセット
      // 画像 → 画像 はユーザの編集値を保持
      setDurationSec(10);
    }
    prevAssetTypeRef.current = curType;
  }, [selectedAssetId, isVideo, isImage, selectedAsset?.type, selectedAsset?.duration_ms]);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const token = tokenStore.getAccess();
        const res = await fetch(`${apiBase}/assets?limit=100`, { headers: { Authorization: `Bearer ${token}` }});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setAssets(data.items ?? data ?? []);
      } catch (err) {
        console.error('Failed to fetch assets:', err);
      }
    };
    fetchAssets();
  }, [apiBase]);

  const filteredAssets = assets.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'video') return a.type === 'video';
    if (filter === 'image') return a.type === 'image' || a.type === 'gif';
    return true;
  });

  const handleCreate = async () => {
    if (!selectedAssetId) {
      alert(t.selectAssetAlert);
      return;
    }
    if (durationSec < 1) {
      alert(t.durationMinAlert);
      return;
    }
    // 容量上限ガード: プログラム合計が 1GB(1,000,000,000 bytes) を超える追加を拒否
    const PROGRAM_SIZE_LIMIT = 1_000_000_000;
    const projected = currentSizeBytes + (selectedAsset?.size ?? 0);
    if (projected > PROGRAM_SIZE_LIMIT) {
      alert(t.sizeLimitAlert(fmtBytes(projected)));
      return;
    }
    setCreating(true);
    try {
      const token = tokenStore.getAccess();
      // 1. シーン作成
      const sceneRes = await fetch(`${apiBase}/programs/${programId}/scenes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim() || t.sceneNameDefault(nextOrderIndex + 1),
          duration_sec: durationSec,
          order_index: nextOrderIndex,
        }),
      });
      if (!sceneRes.ok) throw new Error(t.sceneCreateFailed(sceneRes.status));
      const scene = await sceneRes.json();
      
      // 2. ウィジェット追加 (動画 / 画像) — selectedAsset は上で取得済み
      const widgetType = selectedAsset?.type === 'image' || selectedAsset?.type === 'gif' ? 'image' : 'video';
      
      const widgetRes = await fetch(`${apiBase}/programs/${programId}/scenes/${scene.id}/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: widgetType,
          asset_id: selectedAssetId,
          x: 0, y: 0, width: 100, height: 100, z_index: 0,
          config: {},
        }),
      });
      if (!widgetRes.ok) throw new Error(t.widgetAddFailed(widgetRes.status));

      onCreated();
    } catch (err) {
      alert(t.createFailed(String(err)));
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle className="text-base">{t.addNewScene}</CardTitle>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="scene-name">{t.sceneName}</Label>
              <Input id="scene-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="scene-duration">{t.durationLabel}</Label>
              <Input
                id="scene-duration"
                type="number"
                min={1}
                max={3600}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="mt-1.5"
                readOnly={isVideo}
                disabled={isVideo}
              />
              <div className="text-xs text-muted-foreground mt-1">
                {isVideo
                  ? t.videoFixedNote
                  : selectedAsset
                    ? t.imageDurationNote
                    : t.mixedDurationNote}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>{t.selectAsset}</Label>
              <div className="flex gap-1 text-xs">
                <button
                  className={`px-2 py-1 rounded ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                  onClick={() => setFilter('all')}
                >{t.filterAll}</button>
                <button
                  className={`px-2 py-1 rounded ${filter === 'video' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                  onClick={() => setFilter('video')}
                >{t.filterVideo}</button>
                <button
                  className={`px-2 py-1 rounded ${filter === 'image' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                  onClick={() => setFilter('image')}
                >{t.filterImage}</button>
              </div>
            </div>
            {filteredAssets.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border rounded-md">
                <div>{t.noAssets}</div>
                <Link href="/assets" className="text-primary underline text-xs mt-1 inline-block">
                  {t.uploadOnAssets}
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                {filteredAssets.map((a) => {
                  const isImage = a.type === 'image' || a.type === 'gif';
                  const isSelected = selectedAssetId === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedAssetId(a.id)}
                      className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${
                        isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-muted-foreground'
                      }`}
                    >
                      {a.thumbnail_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={a.thumbnail_url} alt={a.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          {isImage ? <ImageIcon className="h-8 w-8 text-muted-foreground" /> : <Film className="h-8 w-8 text-muted-foreground" />}
                        </div>
                      )}
                      <div className="absolute top-1 left-1 text-[9px] uppercase bg-black/70 text-white px-1.5 py-0.5 rounded">
                        {a.type}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1.5 py-1 truncate">
                        {a.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
        <div className="border-t p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={handleCreate} disabled={creating || !selectedAssetId} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {creating ? t.adding : t.addScene}
          </Button>
        </div>
      </Card>
    </div>
  );
}
