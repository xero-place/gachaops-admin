'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { usePlaybackStream } from '@/hooks/use-playback-stream';
import { PlaybackStatus } from '@/components/domain/playback-status';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Volume2, Search, Zap, Undo2, X, Loader2, Plus, ExternalLink, CalendarClock, Pencil } from 'lucide-react';
import {
  DeviceStatusBadge,
} from '@/components/domain/status-badges';
import { LiveControlSheet } from '@/components/domain/live-control-sheet';
import { DeviceCreateDialog } from '@/components/domain/device-create-dialog';
import { api, ApiError } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';  // S145: lv1_super判定
import type { Device, Store } from '@/types/domain';
import { useLiveStore, applyOverridesToDevices } from '@/stores/live-control-store';
import { fmtRelative } from '@/lib/format';
import { getUpcomingReservation, fmtReservation, type PlanScheduleLite } from '@/lib/plan-reservation';
import Link from 'next/link';
import type { DeviceStatus } from '@/types/domain';
import { usePageT } from '@/i18n/usePageT';
import { devicesDict } from '@/i18n/ns/devices';

interface ListResponse<T> { items?: T[]; data?: T[]; total?: number }

export default function DevicesPage() {
  const t = usePageT(devicesDict);
  const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';  // S145: 顧客名表示の出し分け
  const { states: playbackStates } = usePlaybackStream();
  const [videoDevice, setVideoDevice] = useState<Device | null>(null);
  // S146: 端末名変更
  const [renameDevice, setRenameDevice] = useState<Device | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [planSchedules, setPlanSchedules] = useState<PlanScheduleLite[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, { remaining_balls: number; total_balls: number; low_stock_threshold: number; is_low: boolean; free_mode?: boolean }>>({});
  const [latestApkCode, setLatestApkCode] = useState<number | null>(null);  // 最新APKのversionCode(最大)

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [devR, strR, planR, machR, apkR] = await Promise.all([
          api.get<ListResponse<Device> | Device[]>('/devices?limit=200'),
          api.get<ListResponse<Store> | Store[]>('/stores?limit=200'),
          api.get<ListResponse<PlanScheduleLite> | PlanScheduleLite[]>('/plan-schedules?limit=100'),
          api.get<{ device_id: string; remaining_balls: number; total_balls: number; low_stock_threshold: number; is_low: boolean; free_mode?: boolean }[]>('/gacha/machines').catch(() => []),
          api.get<{ items?: { version_code: number; uploaded_at: string }[] } | { version_code: number; uploaded_at: string }[]>('/apk/releases?limit=100').catch(() => []),
        ]);
        if (cancelled) return;
        const dArr = Array.isArray(devR) ? devR : (devR.items ?? devR.data ?? []);
        const sArr = Array.isArray(strR) ? strR : (strR.items ?? strR.data ?? []);
        const pArr = Array.isArray(planR) ? planR : (planR.items ?? planR.data ?? []);
        setDevices(dArr);
        setStores(sArr);
        setPlanSchedules(pArr);
        const mArr = Array.isArray(machR) ? machR : [];
        const mMap: Record<string, { remaining_balls: number; total_balls: number; low_stock_threshold: number; is_low: boolean; free_mode?: boolean }> = {};
        for (const m of mArr) { mMap[m.device_id] = { remaining_balls: m.remaining_balls, total_balls: m.total_balls, low_stock_threshold: m.low_stock_threshold, is_low: m.is_low, free_mode: m.free_mode }; }
        setStockMap(mMap);
        const apkArr = Array.isArray(apkR) ? apkR : (apkR.items ?? []);
        // 「最新」= APKページと同じ定義（最新アップロード日時のリリース）。max(version_code)だと
        // 過去にvc358より大きい番号のテスト版があると全機が要更新になるため、uploaded_at基準にする。
        const latestRel = [...apkArr].sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0];
        setLatestApkCode(latestRel ? latestRel.version_code : null);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleRename() {
    if (!renameDevice) return;
    const newName = renameValue.trim();
    if (!newName) { setRenameError(t.enterName); return; }
    setRenaming(true);
    setRenameError(null);
    try {
      await api.patch(`/devices/${renameDevice.id}`, { name: newName });
      setDevices((prev) => prev.map((d) => d.id === renameDevice.id ? { ...d, name: newName } : d));
      setRenameDevice(null);
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      setRenameError(t.renameFailed(msg));
    } finally {
      setRenaming(false);
    }
  }

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');  // S209: group filter
  // S200: remember list filters across navigation (device detail → back).
  // Restore after mount (hydration-safe); skip the first persist so the saved
  // value is never overwritten by the initial defaults.
  const filtersHydrated = useRef(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('gachaops_devices_filter');
      if (raw) {
        const f = JSON.parse(raw) as { search?: string; statusFilter?: string; storeFilter?: string; groupFilter?: string };
        if (typeof f.search === 'string') setSearch(f.search);
        if (typeof f.statusFilter === 'string') setStatusFilter(f.statusFilter);
        if (typeof f.storeFilter === 'string') setStoreFilter(f.storeFilter);
        if (typeof f.groupFilter === 'string') setGroupFilter(f.groupFilter);
      }
    } catch {
      // ignore corrupt / unavailable storage
    }
  }, []);
  // 「店舗」ページの「端末を表示」から ?store_id=... で来たら、その店舗のみに絞り込む。
  // sessionStorage 復元(上の effect)より後に実行されるため URL 指定が優先される。
  useEffect(() => {
    try {
      const sid = new URLSearchParams(window.location.search).get('store_id');
      if (sid) {
        setStoreFilter(sid);
        setStatusFilter('all');
        setGroupFilter('all');
        setSearch('');
      }
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    if (!filtersHydrated.current) {
      filtersHydrated.current = true;
      return;
    }
    try {
      sessionStorage.setItem(
        'gachaops_devices_filter',
        JSON.stringify({ search, statusFilter, storeFilter, groupFilter }),
      );
    } catch {
      // ignore storage failures (private mode etc.)
    }
  }, [search, statusFilter, storeFilter, groupFilter]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const overrides = useLiveStore((s) => s.overrides);
  const restorePlan = useLiveStore((s) => s.restorePlan);

  const effectiveDevices = useMemo(() => applyOverridesToDevices(devices, overrides), [devices, overrides]);

  // S209: group options derived from loaded devices (group_ids <-> group_names by index).
  const groupOptions = useMemo(() => {
    const m = new Map<string, string>();
    devices.forEach((d) => {
      (d.group_ids ?? []).forEach((gid, i) => {
        if (gid && !m.has(gid)) m.set(gid, d.group_names?.[i] ?? gid);
      });
    });
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [devices]);

  // 記憶していた店舗/グループ絞り込みが「現在のアカウント」に存在しない場合(運営の成り代わりで
  // 別顧客の店舗IDが sessionStorage に残っている等)は「すべて」に戻す。
  // これをしないと、該当しない絞り込みのままで端末が1件も表示されない。
  useEffect(() => {
    if (storeFilter !== 'all' && stores.length > 0 && !stores.some((s) => s.id === storeFilter)) {
      setStoreFilter('all');
    }
  }, [stores, storeFilter]);
  useEffect(() => {
    if (groupFilter !== 'all' && devices.length > 0 && !groupOptions.some((g) => g.id === groupFilter)) {
      setGroupFilter('all');
    }
  }, [groupOptions, devices.length, groupFilter]);

  const filtered = useMemo(() => {
    return effectiveDevices.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (storeFilter !== 'all' && d.store_id !== storeFilter) return false;
      if (groupFilter !== 'all' && !(d.group_ids ?? []).includes(groupFilter)) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!d.name.toLowerCase().includes(s)) return false;  // 名前のみ(シリアルは検索対象外)
      }
      return true;
    });
  }, [search, statusFilter, storeFilter, groupFilter, effectiveDevices]);

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
      <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
      {loadError && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          {t.fetchError(loadError)}
        </div>
      )}
      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCell label={t.statAll} value={counts.all} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        <StatCell label={t.statOnline} value={counts.online} accent="ok" active={statusFilter === 'online'} onClick={() => setStatusFilter('online')} />
        <StatCell label={t.statOffline} value={counts.offline} accent="destructive" active={statusFilter === 'offline'} onClick={() => setStatusFilter('offline')} />
        <StatCell label={t.statMaintenance} value={counts.maintenance} accent="warn" active={statusFilter === 'maintenance'} onClick={() => setStatusFilter('maintenance')} />
      </div>

      {/* Filter bar */}
      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder={t.storePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.allStores}</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder={t.statusPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.allStatuses}</SelectItem>
              <SelectItem value="online">{t.online}</SelectItem>
              <SelectItem value="offline">{t.offline}</SelectItem>
              <SelectItem value="maintenance">{t.maintenance}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder={t.groupPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.allGroups}</SelectItem>
              {groupOptions.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            {t.itemCount(filtered.length, devices.length)}
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
            <Zap className="h-3.5 w-3.5" />{t.selectFiltered}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />{t.createDevice}
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
                  aria-label={t.selectAllOnlineAria}
                />
              </TableHead>
              <TableHead>{t.colDevice}</TableHead>
              <TableHead>{t.colGroup}</TableHead>
              <TableHead>{t.colStatus}</TableHead>
              {/* S147c: モード列は非表示。play_modeは制御モードでUSB等の映像ソース実態を表せず誤解を生むため。発送後にルート1(signage連携で実ソース取得)で「映像」列として復活。 */}
              {/* <TableHead>モード</TableHead> */}
              <TableHead>{t.colPlaying}</TableHead>
              <TableHead>{t.colVolume}</TableHead>
              <TableHead>{t.colStock}</TableHead>
              <TableHead>{t.colLastSeen}</TableHead>
              <TableHead className="text-right">{t.colAction}</TableHead>
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
                    aria-label={t.selectAria(d.name)}
                  />
                </TableCell>
                <TableCell>
                  <Link href={`/devices/${d.id}`} className="hover:underline">
                    <div className="text-sm flex items-center gap-1.5">
                      <span>{d.name}</span>
                      {(() => {
                        if (latestApkCode == null) return null;
                        const nums = [...(d.app_version ?? '').matchAll(/\(vc(\d+)\)/g)].map((x) => Number(x[1]));
                        const dvc = nums.length ? Math.max(...nums) : null;
                        if (dvc == null) return null;
                        return dvc >= latestApkCode
                          ? <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 text-[10px] font-medium">{t.latest}</span>
                          : <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium">{t.needsUpdate}</span>;
                      })()}
                    </div>
                    {isSuperAdmin && d.customer_name && (
                      <div className="text-[10.5px] text-amber-500/90">{d.customer_name}</div>
                    )}
                  </Link>
                </TableCell>
                <TableCell className="text-xs">
                  {d.group_names && d.group_names.length > 0
                    ? d.group_names.join(t.groupSep)
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell><DeviceStatusBadge status={d.status as DeviceStatus} /></TableCell>
                {/* S147c: モード列セル非表示（ヘッダーと対応）。発送後ルート1で復活。
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <PlayModeBadge mode={d.play_mode} />
                    {overrides[d.id] && <Zap className="h-3 w-3 text-warn" />}
                  </div>
                </TableCell>
                */}
                <TableCell className="text-xs">
                  {d.current_program_name ?? <span className="text-muted-foreground">—</span>}
                  {(() => {
                    const rsv = getUpcomingReservation(d.group_ids, planSchedules);
                    return rsv ? (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-blue-400">
                        <CalendarClock className="h-2.5 w-2.5 shrink-0" />
                        <span>{t.reservationText(fmtReservation(rsv.start_at), rsv.program_name)}</span>
                      </div>
                    ) : null;
                  })()}
                  {playbackStates[d.id] && (
                    <div className="mt-1.5">
                      <PlaybackStatus playback={playbackStates[d.id]} compact />
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="h-3 w-3 text-muted-foreground" />
                    {d.volume}
                  </div>
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {(() => {
                    const st = stockMap[d.id];
                    if (!st) return <span className="text-muted-foreground">—</span>;
                    // S235: フリーモード中は個数ではなく Free と表示
                    if (st.free_mode) {
                      return (
                        <div className="flex flex-col gap-0.5 min-w-[64px]">
                          <span className="font-semibold text-primary">Free</span>
                          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                            <div className="h-full w-full rounded-full bg-primary" />
                          </div>
                        </div>
                      );
                    }
                    // ★stock-total: 分母を「設定した総数(total_balls)」にする(旧: アラートしきい値)
                    const _denom = st.total_balls > 0 ? st.total_balls : Math.max(st.remaining_balls, 1);
                    const pct = Math.min(100, Math.round((st.remaining_balls / _denom) * 100));
                    return (
                      <div className="flex flex-col gap-0.5 min-w-[64px]">
                        <div className="flex items-center gap-1.5">
                          <span className={st.is_low ? 'text-destructive font-semibold' : ''}>{st.remaining_balls}</span>
                          <span className="text-muted-foreground">/ {st.total_balls}</span>
                          {st.is_low && (
                            <span className="px-1 py-0.5 rounded text-[9px] bg-destructive/10 text-destructive font-medium">{t.refill}</span>
                          )}
                        </div>
                        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${st.is_low ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtRelative(d.last_heartbeat_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t.renameTooltip}
                    onClick={() => { setRenameDevice(d); setRenameValue(d.name); setRenameError(null); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-12">
                  {t.noMatch}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Floating selection bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-3 left-3 right-3 z-40 rounded-lg border bg-card shadow-2xl px-3 py-2.5 flex flex-wrap items-center justify-center gap-2 backdrop-blur sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:flex-nowrap sm:px-4 sm:py-3 sm:gap-3">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearSelection}>
            <X className="h-3.5 w-3.5" />
          </Button>
          <div className="text-sm">
            <span className="font-semibold tabular-nums">{selected.size}</span>
            <span className="text-muted-foreground">{t.selectedSuffix}</span>
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
                  scope_label: t.scopeLabel(ids.length),
                  applied_by: 'admin@gachaops.example',
                });
              }}
            >
              <Undo2 className="h-3.5 w-3.5" />{t.restorePlan} ({selectedManualCount})
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setSheetOpen(true)}>
            <Zap className="h-3.5 w-3.5" />{t.switchSelected}
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
                label: t.scopeSelected(selected.size),
              }
            : null
        }
      />

      <DeviceCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        stores={stores}
        onCreated={(device) => {
          setDevices((prev) => [device, ...prev]);
        }}
      />

      <Dialog open={!!renameDevice} onOpenChange={(o) => { if (!o) setRenameDevice(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.renameTitle}</DialogTitle>
            <DialogDescription>{renameDevice?.serial}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !renaming) handleRename(); }}
              maxLength={200}
              autoFocus
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={t.namePlaceholder}
            />
            {renameError && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {renameError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDevice(null)} disabled={renaming}>{t.cancel}</Button>
            <Button onClick={handleRename} disabled={renaming} className="gap-1.5">
              {renaming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!videoDevice} onOpenChange={(o) => { if (!o) setVideoDevice(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{videoDevice?.name ?? t.deviceFallback}{t.playbackTitleSuffix}</DialogTitle>
            <DialogDescription>
              {t.playbackDesc}
            </DialogDescription>
          </DialogHeader>
          {videoDevice && (
            <div className="space-y-4">
              <div className="rounded-md border p-4">
                <PlaybackStatus playback={playbackStates[videoDevice.id]} />
              </div>
              <p className="text-xs text-muted-foreground">
                {t.playbackNote}
              </p>
              <Link
                href={`/devices/${videoDevice.id}`}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t.viewDetail}
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
