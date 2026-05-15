'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Plus, Send, Layers, Trash2, ChevronUp, ChevronDown, Film, Image as ImageIcon, X, Edit3, Save } from 'lucide-react';
import { tokenStore } from '@/lib/token-store';
import { fmtDuration } from '@/lib/format';

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
  name: string;
  description: string | null;
  total_duration_sec: number;
  published: boolean;
  scene_count?: number;
  widget_count?: number;
};

export default function ProgramDetailPage() {
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
    if (!confirm(`シーン「${name}」を削除しますか?`)) return;
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
      alert(`削除失敗: ${err}`);
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
      alert(`順序変更失敗: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!program) return;
    if (scenes.length === 0) {
      alert('公開前にシーンを少なくとも 1 つ追加してください');
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
      alert('プログラムを公開しました');
    } catch (err) {
      alert(`公開失敗: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProgram = async () => {
    if (!program) return;
    if (!confirm(`プログラム「${program.name}」を完全に削除しますか?\nシーン・ウィジェットも全て削除されます。\nこの操作は取り消せません。`)) return;
    setBusy(true);
    try {
      const token = tokenStore.getAccess();
      const res = await fetch(`${apiBase}/programs/${programId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push('/programs');
    } catch (err) {
      alert(`削除失敗: ${err}`);
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="読み込み中..." breadcrumb={['ホーム', 'プログラム']}>
        <div className="text-sm text-muted-foreground p-6">読み込み中...</div>
      </AppShell>
    );
  }

  if (!program) {
    return (
      <AppShell title="エラー" breadcrumb={['ホーム', 'プログラム']}>
        <div className="text-sm text-destructive p-6">プログラムが見つかりません</div>
      </AppShell>
    );
  }

  const totalDuration = scenes.reduce((sum, s) => sum + getDisplayDurationSec(s), 0);

  return (
    <AppShell title={program.name} breadcrumb={['ホーム', 'プログラム', program.id]}>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/programs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />一覧へ戻る
          </Link>
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDeleteProgram} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" />削除
          </Button>
          {!program.published ? (
            <Button size="sm" className="gap-1.5" onClick={handlePublish} disabled={busy || scenes.length === 0}>
              <Send className="h-3.5 w-3.5" />公開する
            </Button>
          ) : (
            <Badge className="px-3 py-1.5">公開中</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4" />シーン構成 ({scenes.length})
              </CardTitle>
              <Button variant="default" size="sm" className="h-8 gap-1" onClick={() => setShowAddScene(true)}>
                <Plus className="h-3.5 w-3.5" />シーン追加
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {scenes.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  シーンがまだありません。「シーン追加」ボタンから動画/画像を追加してください。
                </div>
              ) : (
(() => {
                  const n = scenes.length;
                  const thumbSize =
                    n <= 2 ? 'w-24 h-24' :
                    n <= 4 ? 'w-20 h-20' :
                    n <= 6 ? 'w-16 h-16' :
                    n <= 8 ? 'w-14 h-14' :
                              'w-12 h-12';
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
                          className="w-full h-full object-contain"
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
                      <div className="text-xs text-muted-foreground">
                        {fmtDuration(getDisplayDurationSec(sc) * 1000)}
                        {sc.widget_count && sc.widget_count > 0 ? ` · ${sc.widget_count} ウィジェット` : ''}
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
              <CardTitle className="text-base">プログラム情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">合計時間</span>
                <span className="font-medium">{fmtDuration(totalDuration * 1000)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">シーン数</span>
                <span className="font-medium">{scenes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ステータス</span>
                <span className="font-medium">{program.published ? '公開中' : '下書き'}</span>
              </div>
              {program.description && (
                <div className="pt-2 border-t">
                  <div className="text-muted-foreground mb-1">説明</div>
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
  onClose,
  onCreated,
}: {
  apiBase: string;
  programId: string;
  nextOrderIndex: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(`シーン ${nextOrderIndex + 1}`);
  const [durationSec, setDurationSec] = useState(10);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filter, setFilter] = useState<'all' | 'video' | 'image'>('all');
  const [creating, setCreating] = useState(false);

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
      alert('動画 / 画像を選択してください');
      return;
    }
    if (durationSec < 1) {
      alert('表示時間は 1 秒以上にしてください');
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
          name: name.trim() || `シーン ${nextOrderIndex + 1}`,
          duration_sec: durationSec,
          order_index: nextOrderIndex,
        }),
      });
      if (!sceneRes.ok) throw new Error(`シーン作成失敗 (HTTP ${sceneRes.status})`);
      const scene = await sceneRes.json();
      
      // 2. ウィジェット追加 (動画 / 画像)
      const selectedAsset = assets.find((a) => a.id === selectedAssetId);
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
      if (!widgetRes.ok) throw new Error(`ウィジェット追加失敗 (HTTP ${widgetRes.status})`);
      
      onCreated();
    } catch (err) {
      alert(`作成失敗: ${err}`);
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle className="text-base">新しいシーンを追加</CardTitle>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="scene-name">シーン名</Label>
              <Input id="scene-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="scene-duration">表示時間 (秒)</Label>
              <Input
                id="scene-duration"
                type="number"
                min={1}
                max={3600}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="mt-1.5"
              />
              <div className="text-xs text-muted-foreground mt-1">
                動画はファイル全体、画像は指定秒数表示します
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>素材選択 *</Label>
              <div className="flex gap-1 text-xs">
                <button
                  className={`px-2 py-1 rounded ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                  onClick={() => setFilter('all')}
                >全て</button>
                <button
                  className={`px-2 py-1 rounded ${filter === 'video' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                  onClick={() => setFilter('video')}
                >動画</button>
                <button
                  className={`px-2 py-1 rounded ${filter === 'image' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                  onClick={() => setFilter('image')}
                >画像</button>
              </div>
            </div>
            {filteredAssets.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border rounded-md">
                <div>素材がアップロードされていません</div>
                <Link href="/assets" className="text-primary underline text-xs mt-1 inline-block">
                  素材ページでアップロード
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
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={handleCreate} disabled={creating || !selectedAssetId} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {creating ? '追加中...' : 'シーン追加'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
