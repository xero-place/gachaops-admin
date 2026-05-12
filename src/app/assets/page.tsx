'use client';

import { useState, useMemo, useRef, useEffect, type ChangeEvent } from 'react';
import { api } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';
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
import { Search, Upload, Grid2x2, List, Image, Film, FileAudio, FileCode2, Trash2 } from 'lucide-react';
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

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedAssets, setUploadedAssets] = useState<typeof assets>([]);

  // Fetch real assets from API on mount (replaces mock fixtures)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ items?: any[]; data?: any[] } | any[]>('/assets?limit=100');
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : (res.items ?? res.data ?? []);
        if (Array.isArray(arr) && arr.length > 0) {
          setUploadedAssets(arr as any);
        }
      } catch (e) {
        console.warn('Asset fetch failed, falling back to mock data:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`「${name}」を完全に削除しますか?\n動画ファイル + サムネイル + DB レコードがすべて削除されます。\nこの操作は取り消せません。`)) return;
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';
    try {
      const token = tokenStore.getAccess();
      const res = await fetch(`${apiBase}/assets/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`削除失敗 (HTTP ${res.status})`);
      // refetch by reloading the page (simple and reliable)
      window.location.reload();
    } catch (err) {
      alert(`削除失敗: ${err}`);
    }
  };


  const handleUploadClick = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be selected again later
    e.target.value = '';

    // 1 GB limit
    const MAX_BYTES = 1024 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      window.alert(`ファイルサイズが大きすぎます (${(file.size / 1024 / 1024).toFixed(1)} MB)
最大: 1024 MB (1 GB)`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const token = tokenStore.getAccess();
      if (!token) {
        throw new Error('未ログインです。再度ログインしてください。');
      }

      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status === 201) {
            try {
              const newAsset = JSON.parse(xhr.responseText);
              setUploadedAssets((prev) => [newAsset, ...prev]);
              resolve();
            } catch (err) {
              reject(new Error('レスポンス解析失敗'));
            }
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.detail ?? err.title ?? `HTTP ${xhr.status}`));
            } catch {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          }
        };
        xhr.onerror = () => reject(new Error('ネットワークエラー'));
        xhr.ontimeout = () => reject(new Error('タイムアウト'));
        xhr.open('POST', `${apiBase}/assets/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.timeout = 30 * 60 * 1000; // 30 分

        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', file.name);
        xhr.send(formData);
      });

      window.alert(`✅ アップロード完了

ファイル: ${file.name}
サイズ: ${(file.size / 1024 / 1024).toFixed(1)} MB`);
    } catch (err: any) {
      window.alert(`❌ アップロード失敗

${err?.message ?? '不明なエラー'}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const sourceAssets = uploadedAssets.length > 0 ? uploadedAssets : assets;
  const filtered = useMemo(() => {
    return sourceAssets.filter((a) => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!a.name.toLowerCase().includes(s) && !a.tags.some((t) => t.includes(s))) return false;
      }
      return true;
    });
  }, [search, typeFilter, sourceAssets]);

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
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button size="sm" className="gap-1.5" onClick={handleUploadClick} disabled={uploading}>
            <Upload className="h-3.5 w-3.5" />
            {uploading ? `アップロード中 ${uploadProgress}%` : 'アップロード'}
          </Button>
        </CardContent>
      </Card>

      {view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((a) => {
            const Icon = TYPE_ICON[a.type];
            return (
              <Card key={a.id} className="overflow-hidden hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer group relative">
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
                  <button
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-destructive/90 hover:bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(a.id, a.name);
                    }}
                    title="削除"
                    aria-label="削除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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
