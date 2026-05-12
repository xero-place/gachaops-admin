'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fmtRelative, fmtDuration } from '@/lib/format';
import { Search, Plus, Layers, Clock, Eye } from 'lucide-react';
import { tokenStore } from '@/lib/token-store';

type Program = {
  id: string;
  customer_id: string;
  name: string;
  description: string | null;
  total_duration_sec: number;
  published: boolean;
  scene_count?: number;
  widget_count?: number;
  thumbnail_url?: string | null;
  created_at: string;
  updated_at: string;
};

export default function ProgramsPage() {
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
                <div className="aspect-video bg-muted relative">
                  {p.thumbnail_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover" />
                  )}
                  {!p.published && (
                    <Badge variant="warn" className="absolute top-2 left-2">下書き</Badge>
                  )}
                  {p.published && (
                    <Badge className="absolute top-2 left-2">公開中</Badge>
                  )}
                  <Badge variant="secondary" className="absolute top-2 right-2 gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtDuration(p.total_duration_sec * 1000)}
                  </Badge>
                </div>
              </Link>
              <div className="p-4">
                <Link href={`/programs/${p.id}`} className="hover:underline">
                  <h3 className="font-medium text-sm">{p.name}</h3>
                </Link>
                {p.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                )}
                <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />{p.scene_count ?? 0} シーン
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
