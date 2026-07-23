'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fmtRelative, fmtDuration, fmtBytes } from '@/lib/format';
import { Search, Plus, Layers, HardDrive, Clock, Eye, Film, Image as ImageIcon } from 'lucide-react';
import { tokenStore } from '@/lib/token-store';

type ScenePreview = {
  scene_id: string;
  order_index: number;
  duration_sec: number;
  asset_type: 'video' | 'image' | 'gif' | null;
  thumbnail_url: string | null;
  asset_duration_ms?: number | null;
  asset_name?: string | null;  // S224: セットされた素材名
};

// Session 13: 表示用の秒数を取得 (動画は実長、画像/gif は duration_sec)
function getDisplayDurationSec(sp: ScenePreview): number {
  if (sp.asset_type === 'video' && sp.asset_duration_ms && sp.asset_duration_ms > 0) {
    return Math.ceil(sp.asset_duration_ms / 1000);
  }
  return sp.duration_sec;
}

// Session 13: プログラム全体の合計秒数 (動画は実長、画像/gif は duration_sec)
function getProgramTotalSec(scenePreviews?: ScenePreview[], fallback?: number): number {
  if (!scenePreviews || scenePreviews.length === 0) return fallback ?? 0;
  return scenePreviews.reduce((sum, sp) => sum + getDisplayDurationSec(sp), 0);
}

type Program = {
  id: string;
  customer_id: string;
  name: string;
  description: string | null;
  total_duration_sec: number;
  published: boolean;
  scene_count?: number;
  size_bytes?: number;
  widget_count?: number;
  thumbnail_url?: string | null;
  scene_previews?: ScenePreview[];
  created_at: string;
  updated_at: string;
};

export default function ProgramsPage() {
  const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';  // S145
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showUnpublished, setShowUnpublished] = useState(true);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';

  const fetchPrograms = useCallback(async () => {
    try {
      const token = tokenStore.getAccess();
      const res = await fetch(`${apiBase}/programs?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPrograms(data.items ?? data ?? []);
    } catch (err) {
      console.error('Failed to fetch programs:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const filtered = useMemo(() => {
    return programs.filter((p) => {
      if (!showUnpublished && !p.published) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!p.name.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [programs, search, showUnpublished]);

  return (
    <AppShell title="プログラム" breadcrumb={['ホーム', 'プログラム']}>
      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="プログラム名で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Button
            variant={showUnpublished ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowUnpublished(!showUnpublished)}
            className="h-8 text-xs"
          >
            下書きを含む
          </Button>
          <div className="ml-auto" />
          <Button size="sm" className="gap-1.5" asChild>
            <Link href="/programs/new">
              <Plus className="h-3.5 w-3.5" />新規作成
            </Link>
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center text-sm text-muted-foreground py-12">
          読み込み中...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <Card key={p.id} className="overflow-hidden hover:ring-2 hover:ring-primary/30 transition-all">
              <Link href={`/programs/${p.id}`}>
                <div className="aspect-video bg-muted relative overflow-hidden">
                  {/* S224: サムネを枠いっぱいに(object-cover)。単一シーンは全面、複数は均等分割で全高表示 */}
                  {p.scene_previews && p.scene_previews.length > 0 ? (() => {
                    const n = p.scene_previews.length;
                    return (
                      <div className="absolute inset-0 flex">
                        {p.scene_previews.map((scene, i) => (
                          <div key={scene.scene_id} className="relative flex-1 min-w-0 h-full bg-black/60 border-r border-black/25 last:border-r-0">
                            {scene.thumbnail_url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={scene.thumbnail_url}
                                alt={`シーン ${i + 1}`}
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                {scene.asset_type === 'video' ? (
                                  <Film className="h-7 w-7 text-muted-foreground" />
                                ) : (
                                  <ImageIcon className="h-7 w-7 text-muted-foreground" />
                                )}
                              </div>
                            )}
                            {n > 1 && (
                              <div className="absolute bottom-0 left-0 bg-primary/90 text-primary-foreground font-bold text-[9px] px-1 rounded-tr">
                                {i + 1}
                              </div>
                            )}
                            <div className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] px-1 leading-tight">
                              {getDisplayDurationSec(scene)}s
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })() : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">シーンなし</div>
                  )}
                  {!p.published && (
                    <Badge variant="warn" className="absolute top-2 left-2">下書き</Badge>
                  )}
                  {p.published && (
                    <Badge className="absolute top-2 left-2">公開中</Badge>
                  )}
                  <Badge variant="secondary" className="absolute top-2 right-2 gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtDuration(getProgramTotalSec(p.scene_previews, p.total_duration_sec) * 1000)}
                  </Badge>
                </div>
              </Link>
              <div className="p-4">
                <Link href={`/programs/${p.id}`} className="hover:underline">
                  <h3 className="font-medium text-sm">{p.name}</h3>
                </Link>
                {isSuperAdmin && p.customer_id && (
                  <span className="text-[10px] font-mono text-amber-500/80">{p.customer_id}</span>
                )}
                {/* S224: セットされた素材名 */}
                {(() => {
                  const mats = [...new Set((p.scene_previews ?? []).map((s) => s.asset_name).filter(Boolean))];
                  return mats.length > 0 ? (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Film className="h-3 w-3 shrink-0" />
                      <span className="truncate">{mats.join(' / ')}</span>
                    </div>
                  ) : null;
                })()}
                {p.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                )}
                <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />{p.scene_count ?? 0} シーン
                  </span>
                  <span className="flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />{fmtBytes(p.size_bytes ?? 0)}
                  </span>
                  <span className="ml-auto">{fmtRelative(p.updated_at)}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="h-7 text-xs flex-1 gap-1" asChild>
                    <Link href={`/programs/${p.id}`}>
                      <Eye className="h-3 w-3" />開く
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center text-sm text-muted-foreground py-12">
              {programs.length === 0 ? (
                <>
                  <div>プログラムがまだありません</div>
                  <Button size="sm" className="mt-3 gap-1.5" asChild>
                    <Link href="/programs/new">
                      <Plus className="h-3.5 w-3.5" />最初のプログラムを作成
                    </Link>
                  </Button>
                </>
              ) : (
                '該当するプログラムがありません'
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
