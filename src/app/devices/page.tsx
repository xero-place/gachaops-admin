'use client';

import { useState, useMemo, useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Volume2, Power, Camera, Search, Zap, Undo2, X, Loader2 } from 'lucide-react';
import {
  DeviceStatusBadge,
  PlayModeBadge,
} from '@/components/domain/status-badges';
import { LiveControlSheet } from '@/components/domain/live-control-sheet';
import { api } from '@/lib/api';
import type { Device, Store } from '@/types/domain';
import { useLiveStore, applyOverridesToDevices } from '@/stores/live-control-store';
import { fmtRelative } from '@/lib/format';
import Link from 'next/link';
import type { DeviceStatus } from '@/types/domain';

interface ListResponse<T> { items?: T[]; data?: T[]; total?: number }

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [devR, strR] = await Promise.all([
          api.get<ListResponse<Device> | Device[]>('/devices?limit=200'),
          api.get<ListResponse<Store> | Store[]>('/stores?limit=200'),
        ]);
        if (cancelled) return;
        const dArr = Array.isArray(devR) ? devR : (devR.items ?? devR.data ?? []);
        const sArr = Array.isArray(strR) ? strR : (strR.items ?? strR.data ?? []);
        setDevices(dArr);
        setStores(sArr);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const overrides = useLiveStore((s) => s.overrides);
  const restorePlan = useLiveStore((s) => s.restorePlan);

  // Apply overrides on top of base fixture so play_mode / current_program reflect switches
  const effectiveDevices = useMemo(() => applyOverridesToDevices(devices, overrides), [devices, overrides]);

  const filtered = useMemo(() => {
    return effectiveDevices.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (storeFilter !== 'all' && d.store_id !== storeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!d.name.toLowerCase().includes(s) && !d.serial.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [search, statusFilter, storeFilter, effectiveDevices]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllVisible = () => {
    setSelected((prev) => {
      const visibleOnline = filtered.filter((d) => d.status === 'online');
      const allChecked = visibleOnline.every((d) => prev.has(d.id));
      if (allChecked) {
        const next = new Set(prev);
        for (const d of visibleOnline) next.delete(d.id);
        return next;
      }
      const next = new Set(prev);
      for (const d of visibleOnline) next.add(d.id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  // Number of selected devices that have manual override applied (eligible for restore)
  const selectedManualCount = useMemo(() =>
    Array.from(selected).filter((id) => !!overrides[id]).length, [selected, overrides]);

  const counts = useMemo(() => {
    return {
      all: devices.length,
      online: devices.filter((d) => d.status === 'online').length,
      offline: devices.filter((d) => d.status === 'offline').length,
      maintenance: devices.filter((d) => d.status === 'maintenance').length,
    };
  }, [devices]);

  if (loading) {
    return (
      <AppShell title="端末" breadcrumb={['ホーム', '端末']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="端末" breadcrumb={['ホーム', '端末']}>
      {loadError && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          データ取得エラー: {loadError}
        </div>
      )}
      {/* Stat strip */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCell label="全端末" value={counts.all} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        <StatCell label="オンライン" value={counts.online} accent="ok" active={statusFilter === 'online'} onClick={() => setStatusFilter('online')} />
        <StatCell label="オフライン" value={counts.offline} accent="destructive" active={statusFilter === 'offline'} onClick={() => setStatusFilter('offline')} />
        <StatCell label="保守中" value={counts.maintenance} accent="warn" active={statusFilter === 'maintenance'} onClick={() => setStatusFilter('maintenance')} />
      </div>

      {/* Filter bar */}
      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="名前またはシリアルで検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="店舗" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての店舗</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} / {devices.length} 件
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              const ids = filtered.filter((d) => d.status === 'online').map((d) => d.id);
              setSelected(new Set(ids));
            }}
            disabled={filtered.filter((d) => d.status === 'online').length === 0}
          >
            <Zap className="h-3.5 w-3.5" />絞込中の全端末を選択
          </Button>
        </CardContent>
      </Card>

      {/* Device table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    filtered.filter((d) => d.status === 'online').length > 0 &&
                    filtered.filter((d) => d.status === 'online').every((d) => selected.has(d.id))
                      ? true
                      : Array.from(selected).some((id) => filtered.find((d) => d.id === id))
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={toggleAllVisible}
                  aria-label="表示中の全オンライン端末を選択"
                />
              </TableHead>
              <TableHead>端末</TableHead>
              <TableHead>店舗</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>モード</TableHead>
              <TableHead>再生中</TableHead>
              <TableHead>音量</TableHead>
              <TableHead>最終接続</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((d) => (
              <TableRow key={d.id} data-state={selected.has(d.id) ? 'selected' : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(d.id)}
                    onCheckedChange={() => toggleOne(d.id)}
                    disabled={d.status !== 'online'}
                    aria-label={`${d.name} を選択`}
                  />
                </TableCell>
                <TableCell>
                  <Link href={`/devices/${d.id}`} className="hover:underline">
                    <div className="text-sm">{d.name}</div>
                    <div className="text-[10.5px] font-mono text-muted-foreground">{d.serial}</div>
                  </Link>
                </TableCell>
                <TableCell className="text-xs">{d.store_name}</TableCell>
                <TableCell><DeviceStatusBadge status={d.status as DeviceStatus} /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <PlayModeBadge mode={d.play_mode} />
                    {overrides[d.id] && <Zap className="h-3 w-3 text-warn" />}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {d.current_program_name ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="h-3 w-3 text-muted-foreground" />
                    {d.volume}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtRelative(d.last_heartbeat_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={d.status !== 'online'}>
                    <Camera className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={d.status !== 'online'}>
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-12">
                  条件に一致する端末がありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Floating selection bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 rounded-lg border bg-card shadow-2xl px-4 py-3 flex items-center gap-3 backdrop-blur">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearSelection}>
            <X className="h-3.5 w-3.5" />
          </Button>
          <div className="text-sm">
            <span className="font-semibold tabular-nums">{selected.size}</span>
            <span className="text-muted-foreground"> 台を選択中</span>
          </div>
          <div className="h-5 w-px bg-border" />
          {selectedManualCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                const ids = Array.from(selected).filter((id) => !!overrides[id]);
                restorePlan({
                  device_ids: ids,
                  scope_label: `選択端末 ${ids.length}台`,
                  applied_by: 'admin@gachaops.example',
                });
              }}
            >
              <Undo2 className="h-3.5 w-3.5" />計画モードに戻す ({selectedManualCount})
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setSheetOpen(true)}>
            <Zap className="h-3.5 w-3.5" />選択端末で映像を切替
          </Button>
        </div>
      )}

      <LiveControlSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        scope={
          selected.size > 0
            ? {
                device_ids: Array.from(selected),
                label: `選択した ${selected.size} 台`,
              }
            : null
        }
      />
    </AppShell>
  );
}

function StatCell({
  label,
  value,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent?: 'ok' | 'destructive' | 'warn';
  active?: boolean;
  onClick: () => void;
}) {
  const colors = accent === 'ok' ? 'text-ok' : accent === 'destructive' ? 'text-destructive' : accent === 'warn' ? 'text-warn' : 'text-foreground';
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border bg-card p-4 transition-colors ${active ? 'ring-2 ring-primary border-primary' : 'hover:bg-accent'}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${colors}`}>{value}</div>
    </button>
  );
}
