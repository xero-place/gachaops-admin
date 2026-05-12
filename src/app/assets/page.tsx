'use client';

import { useState, useMemo } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { assets } from '@/mocks/fixtures';
import { fmtBytes, fmtDuration, fmtRelative } from '@/lib/format';
import { Search, Upload, Grid2x2, List, Image, Film, FileAudio, FileCode2 } from 'lucide-react';
import type { AssetType } from '@/types/domain';

const TYPE_ICON: Record<AssetType, React.ComponentType<{ className?: string }>> = {
  image: Image,
  video: Film,
  gif: Image,
  audio: FileAudio,
  html: FileCode2,
};

export default function AssetsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!a.name.toLowerCase().includes(s) && !a.tags.some((t) => t.includes(s))) return false;
      }
      return true;
    });
  }, [search, typeFilter]);

  const totalSize = filtered.reduce((a, x) => a + x.size, 0);

  return (
    <AppShell title="素材" breadcrumb={['ホーム', '素材']}>
      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="ファイル名 / タグで検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全ての種別</SelectItem>
              <SelectItem value="image">画像</SelectItem>
              <SelectItem value="video">動画</SelectItem>
              <SelectItem value="gif">GIF</SelectItem>
              <SelectItem value="audio">音声</SelectItem>
              <SelectItem value="html">HTML</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex border rounded-md">
            <Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="sm" className="h-8 rounded-r-none" onClick={() => setView('grid')}>
              <Grid2x2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" className="h-8 rounded-l-none border-l" onClick={() => setView('list')}>
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} 件 / {fmtBytes(totalSize)}
          </div>
          <Button size="sm" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />アップロード
          </Button>
        </CardContent>
      </Card>

      {view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((a) => {
            const Icon = TYPE_ICON[a.type];
            return (
              <Card key={a.id} className="overflow-hidden hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer">
                <div className="aspect-square bg-muted flex items-center justify-center relative">
                  {a.thumbnail_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={a.thumbnail_url} alt={a.name} className="w-full h-full object-cover" />
                  ) : (
                    <Icon className="h-12 w-12 text-muted-foreground" />
                  )}
                  <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] uppercase">
                    {a.type}
                  </Badge>
                </div>
                <div className="p-3">
                  <div className="text-xs font-medium truncate" title={a.name}>{a.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex justify-between">
                    <span>{fmtBytes(a.size)}</span>
                    {a.duration_ms && <span>{fmtDuration(a.duration_ms)}</span>}
                  </div>
                  {a.used_in_program_count > 0 && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      使用中: {a.used_in_program_count} プログラム
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center text-sm text-muted-foreground py-12">
              該当する素材がありません
            </div>
          )}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名前</TableHead>
                <TableHead>種別</TableHead>
                <TableHead className="text-right">サイズ</TableHead>
                <TableHead>解像度</TableHead>
                <TableHead>長さ</TableHead>
                <TableHead>タグ</TableHead>
                <TableHead>使用</TableHead>
                <TableHead>作成</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded bg-muted overflow-hidden flex items-center justify-center">
                        {a.thumbnail_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={a.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <FileAudio className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <span className="text-sm">{a.name}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="muted" className="text-[10px] uppercase">{a.type}</Badge></TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtBytes(a.size)}</TableCell>
                  <TableCell className="text-xs tabular-nums">{a.width && a.height ? `${a.width}×${a.height}` : '—'}</TableCell>
                  <TableCell className="text-xs tabular-nums">{fmtDuration(a.duration_ms)}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{a.tags.map((t) => <Badge key={t} variant="muted" className="text-[10px]">{t}</Badge>)}</div></TableCell>
                  <TableCell className="text-xs">{a.used_in_program_count > 0 ? `${a.used_in_program_count} プログラム` : '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtRelative(a.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </AppShell>
  );
}
