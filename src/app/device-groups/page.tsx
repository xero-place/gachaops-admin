'use client';

import { AppShell } from '@/components/layout/app-shell';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';

/** S238: サーバーが返した理由をそのまま画面に出す（失敗が握りつぶされないように） */
function apiMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.problem.detail || e.problem.title || fallback;
  return e instanceof Error && e.message ? e.message : fallback;
}
import { Loader2, Plus, AlertTriangle, Grid3x3, Play } from 'lucide-react';
import VideoWallPreviewModal from '@/components/videowall/VideoWallPreviewModal';
import { usePageT } from '@/i18n/usePageT';
import { deviceGroupsDict } from '@/i18n/ns/deviceGroups';

type GroupMember = { device_id: string; is_master: boolean };

type DeviceGroup = {
  id: string;
  customer_id?: string;
  name: string;
  parent_id: string | null;
  linked: boolean;
  effect_enabled_default: boolean;
  rest_program_id?: string | null;  // S145: グループ別箸休め（lv1_superのみ設定可）
  device_count: number;
  child_group_count: number;
  members: GroupMember[];
  created_at?: string;
};

type DeviceLite = { id: string; name?: string; status?: string; current_program_name?: string | null };
type CustomerLite = { id: string; name?: string };  // ★uiGrp: 顧客ごとに束ねる見出し名の解決用
type VwAssetLite = { id: string; name: string; type?: string; url?: string | null };
type VwTile = { id: string; row: number; col: number; position_index: number; tile_asset_id?: string | null; device_id?: string | null; tile_asset_url?: string | null };
type VideoWall = { id: string; name: string; rows: number; cols: number; bezel_px: number; status: string; source_asset_id?: string | null; tiles: VwTile[] };
type ProgramLite = { id: string; name: string };  // S145: 箸休めセレクタ用

export default function DeviceGroupsPage() {
  const t = usePageT(deviceGroupsDict);
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [devices, setDevices] = useState<DeviceLite[]>([]);
  const [programs, setPrograms] = useState<ProgramLite[]>([]);  // S145: 箸休めセレクタ用
  const [customers, setCustomers] = useState<CustomerLite[]>([]);  // ★uiGrp: 顧客名で束ねる
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DeviceGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<DeviceGroup | null>(null);


  const reload = useCallback(async () => {
    const res = await api.get<{ items?: DeviceGroup[] } | DeviceGroup[]>('/device-groups?limit=200');
    const arr = Array.isArray(res) ? res : (res.items ?? []);
    setDeviceGroups(arr.map((g) => ({ ...g, members: g.members ?? [] })));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [groupsRes, devRes, progRes, custRes] = await Promise.all([
          api.get<{ items?: DeviceGroup[] } | DeviceGroup[]>('/device-groups?limit=200'),
          api.get<{ items?: DeviceLite[] } | DeviceLite[]>('/devices?limit=200'),
          api.get<{ items?: ProgramLite[] } | ProgramLite[]>('/programs?limit=200'),  // S145
          api.get<{ items?: CustomerLite[] } | CustomerLite[]>('/customers?limit=200').catch(() => []),  // ★uiGrp
        ]);
        if (cancelled) return;
        const groups = Array.isArray(groupsRes) ? groupsRes : (groupsRes.items ?? []);
        const devs = Array.isArray(devRes) ? devRes : (devRes.items ?? []);
        const progs = Array.isArray(progRes) ? progRes : (progRes.items ?? []);  // S145
        const custs = Array.isArray(custRes) ? custRes : (custRes.items ?? []);  // ★uiGrp
        setDeviceGroups(groups.map((g) => ({ ...g, members: g.members ?? [] })));
        setDevices(devs);
        setPrograms(progs);  // S145
        setCustomers(custs);  // ★uiGrp
      } catch (e) {
        console.error('[device-groups] fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <AppShell title={t.title} breadcrumb={[t.home, t.groups]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const roots = deviceGroups.filter((g) => g.parent_id === null);
  const childrenOf = (id: string) => deviceGroups.filter((g) => g.parent_id === id);

  // ★uiGrp: ルートグループを顧客ごとに束ねる。顧客名の昇順。IDは表示しない。
  const custName = (id?: string) => customers.find((c) => c.id === id)?.name ?? t.custUnset;
  const custOrder: string[] = [];
  const rootsByCust = new Map<string, DeviceGroup[]>();
  for (const r of roots) {
    const key = r.customer_id ?? '__none__';
    if (!rootsByCust.has(key)) { rootsByCust.set(key, []); custOrder.push(key); }
    rootsByCust.get(key)!.push(r);
  }
  custOrder.sort((a, b) => custName(a === '__none__' ? undefined : a).localeCompare(custName(b === '__none__' ? undefined : b), 'ja'));
  // 顧客が1件だけ（顧客アカウントでの閲覧など）のときは冗長なので見出しを出さない。
  const showCustomerHeader = custOrder.length > 1;

  return (
    <AppShell title={t.title} breadcrumb={[t.home, t.groups]}>
      {/* S262l: 見た目のみ変更（取得・保存の処理は従来どおり） */}
      <div className="flex w-full max-w-[1200px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[720px] text-[15px] leading-relaxed text-muted-foreground">{t.hierarchyDesc}</p>
          <Button onClick={() => setCreating(true)}>
            <Plus />{t.newGroup}
          </Button>
        </div>

        {roots.length === 0 && (
          <div className="rounded-card border bg-card px-6 py-10 text-center text-sm text-muted-foreground">{t.noGroups}</div>
        )}
        {custOrder.map((custKey) => (
          <section key={custKey} className="flex flex-col gap-3">
            {showCustomerHeader && (
              <div className="flex items-baseline gap-3 px-0.5">
                <h2 className="text-[17px] font-bold text-foreground">{custName(custKey === '__none__' ? undefined : custKey)}</h2>
                <span className="text-[13px] text-muted-foreground">{t.groupCount(rootsByCust.get(custKey)!.length)}</span>
              </div>
            )}
            <ul className="flex flex-col gap-3">
              {rootsByCust.get(custKey)!.map((root) => (
                <GroupNode
                  key={root.id}
                  group={root}
                  childrenList={childrenOf(root.id)}
                  depth={0}
                  allGroups={deviceGroups}
                  canEdit={true}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                  devices={devices}
                  programs={programs}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {editing && (
        <EditGroupDialog
          group={editing}
          devices={devices}
          programs={programs}
          onClose={() => setEditing(null)}
          onSaved={async () => { await reload(); setEditing(null); }}
        />
      )}
      {creating && (
        <CreateGroupDialog
          devices={devices}
          onClose={() => setCreating(false)}
          onSaved={async () => { await reload(); setCreating(false); }}
        />
      )}
      {deleting && (
        <DeleteGroupDialog
          group={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async () => { await reload(); setDeleting(null); }}
        />
      )}
    </AppShell>
  );
}

function GroupNode({
  group, childrenList, depth, allGroups, canEdit, onEdit, onDelete, devices, programs,
}: {
  group: DeviceGroup;
  childrenList: DeviceGroup[];
  depth: number;
  allGroups: DeviceGroup[];
  canEdit: boolean;
  onEdit: (g: DeviceGroup) => void;
  onDelete: (g: DeviceGroup) => void;
  devices: DeviceLite[];
  programs: ProgramLite[];
}) {
  const t = usePageT(deviceGroupsDict);
  // S145: メンバー端末の状態表示。restProgram名解決（NULL=既定の箸休め）。
  const restName = group.rest_program_id
    ? (programs.find((p) => p.id === group.rest_program_id)?.name ?? group.rest_program_id)
    : t.defaultRest;
  const memberDevices = group.members.map((m) => ({
    m,
    d: devices.find((x) => x.id === m.device_id),
  }));
  const onlineCount = memberDevices.filter(({ d }) => d?.status === 'online').length;
  const offlineCount = memberDevices.length - onlineCount;
  // S262l: 表示だけの開閉（6台以下は開いた状態、それより多いときは最初の1行だけ表示）
  const [expanded, setExpanded] = useState(memberDevices.length <= 6);
  const FIRST_ROW = 4;
  const shown = expanded ? memberDevices : memberDevices.slice(0, FIRST_ROW);
  const masterEntry = memberDevices.find(({ m }) => m.is_master);
  const masterName = masterEntry ? (masterEntry.d?.name ?? masterEntry.m.device_id) : null;
  const statusTone =
    memberDevices.length === 0 || onlineCount === 0
      ? 'text-muted-foreground'
      : offlineCount === 0
        ? 'text-ok'
        : 'text-warn';
  const restLabel = group.rest_program_id ? restName : t.restNone;

  return (
    <li>
      {/* S262l: 1グループ=1枚の白いカード。名前 → 種類 → つなぎの映像 → マシン の順に読める。 */}
      <div className="rounded-card border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pb-3 pt-5 sm:px-[22px]">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="break-words text-[19px] font-bold leading-snug text-foreground">{group.name}</h3>
            <p className="text-sm text-foreground/80">
              {group.linked ? t.typeLinked(memberDevices.length, masterName) : t.typePlain(memberDevices.length)}
              {childrenList.length > 0 && <span className="ml-2 text-muted-foreground">・{t.subGroups(childrenList.length)}</span>}
            </p>
            <p className="text-[13px] text-muted-foreground">{t.restLine(restLabel)}</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {memberDevices.length > 0 && (
              <span className={`text-sm font-bold tabular-nums ${statusTone}`}>{t.statusLine(onlineCount, offlineCount)}</span>
            )}
            {canEdit && (
              <div className="flex items-center gap-1">
                <Button variant="outline" onClick={() => onEdit(group)}>{t.edit}</Button>
                <button
                  type="button"
                  className="min-h-[44px] rounded-[10px] px-3 text-sm text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
                  onClick={() => onDelete(group)}
                >
                  {t.delete}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t px-5 py-4 sm:px-[22px]">
          {memberDevices.length > 0 ? (
            <div className="flex flex-col gap-3">
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-2">
                {shown.map(({ m, d }) => {
                  const online = d?.status === 'online';
                  return (
                    <li key={m.device_id}>
                      <Link
                        href={`/devices/${encodeURIComponent(m.device_id)}`}
                        className="flex h-full flex-col gap-1 rounded-[10px] border bg-secondary px-3.5 py-3 transition-colors hover:bg-accent"
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-[15px] font-bold text-foreground">{d?.name ?? m.device_id}</span>
                          {m.is_master && <span className="shrink-0 text-[12px] text-muted-foreground">{t.master}</span>}
                        </span>
                        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-ok' : 'bg-muted-foreground/40'}`} aria-hidden="true" />
                          {online ? t.online : t.offline}
                        </span>
                        {online && d?.current_program_name && (
                          <span className="truncate text-[12px] text-muted-foreground">{t.playing(d.current_program_name)}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {memberDevices.length > FIRST_ROW && memberDevices.length > 6 && (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((v) => !v)}
                  className="self-start text-sm font-bold text-foreground underline-offset-4 hover:underline"
                >
                  {expanded ? t.showLess : t.showAll(memberDevices.length)}
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{t.noDevicesRegistered}</span>
              {canEdit && (
                <Button variant="outline" onClick={() => onEdit(group)}>
                  <Plus />{t.addMachines}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 子グループ：左罫線で入れ子を表現 */}
      {childrenList.length > 0 && (
        <ul className="mt-3 ml-4 flex flex-col gap-3 border-l border-border pl-4">
          {childrenList.map((c) => (
            <GroupNode
              key={c.id}
              group={c}
              childrenList={allGroups.filter((x) => x.parent_id === c.id)}
              depth={depth + 1}
              allGroups={allGroups}
              canEdit={canEdit}
              onEdit={onEdit}
              onDelete={onDelete}
              devices={devices}
              programs={programs}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function EditGroupDialog({
  group, devices, programs, onClose, onSaved,
}: {
  group: DeviceGroup;
  devices: DeviceLite[];
  programs: ProgramLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = usePageT(deviceGroupsDict);
  const [name, setName] = useState(group.name);
  const [linked, setLinked] = useState(group.linked);
  // S145: 演出ON/OFFは端末タブで制御。グループ既定は常にtrue固定（三値フォールバックの参照先を維持）。UIは非表示。
  const [effectDefault, setEffectDefault] = useState(true);
  const initialMemberIds = group.members.map((m) => m.device_id);
  const [memberIds, setMemberIds] = useState<string[]>(initialMemberIds);
  const initialMaster = group.members.find((m) => m.is_master)?.device_id ?? '';
  const [masterId, setMasterId] = useState<string>(initialMaster);
  const initialRest = group.rest_program_id ?? '';  // S145: '' = 既定箸休め
  const [restProgramId, setRestProgramId] = useState<string>(initialRest);  // S145
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // S148: ビデオウォール分割
  const [vwEnabled, setVwEnabled] = useState(false);
  const [vwAssets, setVwAssets] = useState<VwAssetLite[]>([]);
  const [vwSourceId, setVwSourceId] = useState<string>('');
  const [vwRows, setVwRows] = useState<number>(1);
  const [vwCols, setVwCols] = useState<number>(group.members.length || 2);
  const [vwBezel, setVwBezel] = useState<number>(0);  // 実測デフォルト（後で確定）
  const [vw, setVw] = useState<VideoWall | null>(null);
  const [vwBusy, setVwBusy] = useState(false);
  const [vwPreview, setVwPreview] = useState(false);
  const [vwSplitSec, setVwSplitSec] = useState(0); // S149: 分割の経過秒数表示用
  const [vwErr, setVwErr] = useState<string | null>(null);

  useEffect(() => {
    if (!vwEnabled || vwAssets.length) return;
    api.get<{ items?: VwAssetLite[] } | VwAssetLite[]>('/assets?limit=200')
      .then((r) => {
        const list = Array.isArray(r) ? r : (r.items ?? []);
        setVwAssets(list.filter((a) => (a.type ?? 'video') === 'video'));
      })
      .catch(() => setVwErr(t.assetFetchFailed));
  }, [vwEnabled, vwAssets.length]);

  // S148: グループを開いたとき、保存済みビデオウォールを復元（チェック・行列・分割状態も保持）
  useEffect(() => {
    let cancelled = false;
    api.get<{ items?: VideoWall[] } | VideoWall[]>(`/videowalls?group_id=${group.id}`)
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r) ? r : (r.items ?? []);
        if (list.length > 0) {
          const latest = list[0];  // backendはcreated_at降順
          setVw(latest);
          setVwEnabled(true);
          setVwRows(latest.rows);
          setVwCols(latest.cols);
          // NOTE: bezel is intentionally NOT restored from the saved wall.
          // The latest saved wall is often bezel_px=0, and auto-restoring it
          // overwrote the operator's input, re-baking tiles at 0 every time.
          // Bezel is now always driven by the live input field.
        }
      })
      .catch(() => { /* 無ければ何もしない */ });
    return () => { cancelled = true; };
  }, [group.id]);

  const vwCreate = async () => {
    if (!vwSourceId) { setVwErr(t.selectSource); return; }
    const n = vwRows * vwCols;
    if (n < 2 || n > 20) { setVwErr(t.countRange); return; }
    setVwBusy(true); setVwErr(null);
    try {
      const created = await api.post<VideoWall>('/videowalls', {
        name: `${name}_wall`, source_asset_id: vwSourceId,
        rows: vwRows, cols: vwCols, bezel_px: vwBezel, device_group_id: group.id,
      });
      setVw(created);
    } catch { setVwErr(t.createFailedVw); }
    finally { setVwBusy(false); }
  };
  // S149: split開始→ready/failedまでポーリング。経過秒数を表示し、
  //       ready到達時に auto-assign まで自動実行（分割→反映の2ステップ化）。
  const vwSplit = async () => {
    if (!vw) return;
    const wallId = vw.id;
    setVwBusy(true); setVwErr(null); setVwSplitSec(0);
    try {
      const started = await api.post<VideoWall>(`/videowalls/${wallId}/split`, {});
      setVw(started);
      const t0 = Date.now();
      const TIMEOUT_MS = 1800000; // S181: scale除去後も5120x1280x5枚直列は20分級。余裕を見て30分
      // 1秒ごとに経過秒数を更新、3秒ごとに状態を取得
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((res) => setTimeout(res, 1000));
        const sec = Math.floor((Date.now() - t0) / 1000);
        setVwSplitSec(sec);
        if (Date.now() - t0 > TIMEOUT_MS) {
          setVwErr(t.splitSlow);
          break;
        }
        if (sec % 3 !== 0) continue;
        let latest: VideoWall | null = null;
        try {
          const list = await api.get<{ items?: VideoWall[] } | VideoWall[]>(`/videowalls?group_id=${group.id}`);
          const arr = Array.isArray(list) ? list : (list.items ?? []);
          latest = arr.find((w) => w.id === wallId) ?? null;
        } catch { /* 一時的な失敗は無視して継続 */ }
        if (!latest) continue;
        if (latest.status === 'ready') {
          // ★S227: 自動割当は行わない。既存の割り当て(R0C0=140 等)を保持したまま完了。
          setVw(latest);
          setVwErr(t.splitDone);
          break;
        }
        if (latest.status === 'failed') {
          setVw(latest);
          setVwErr(t.splitFailed);
          break;
        }
        setVw(latest); // splitting中も状態を反映
      }
    } catch {
      setVwErr(t.splitStartFailed);
    } finally {
      setVwBusy(false); setVwSplitSec(0);
    }
  };
  // ★S227: 自動割当は廃止（手動割り当てを尊重するためボタン・自動実行とも撤去）。
  const vwAssignTile = async (tileId: string, deviceId: string) => {
    if (!vw) return;
    try { const r = await api.patch<VideoWall>(`/videowalls/${vw.id}/tiles/${tileId}`, { device_id: deviceId || null }); setVw(r); }
    catch { setVwErr(t.assignFailed); }
  };
  // S148: 実機に反映（各タイルをProgram化→担当端末へ同期配信）
  const vwDeploy = async () => {
    if (!vw) return;
    setVwBusy(true); setVwErr(null);
    try {
      await api.post(`/videowalls/${vw.id}/deploy`, {});
      setVwErr(t.deployed);
    } catch { setVwErr(t.deployFailed); }
    finally { setVwBusy(false); }
  };

  const toggleMember = (id: string) => {
    setMemberIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!next.includes(masterId)) setMasterId('');
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const add = memberIds.filter((id) => !initialMemberIds.includes(id));
      const remove = initialMemberIds.filter((id) => !memberIds.includes(id));
      const body: Record<string, unknown> = {
        name,
        linked,
        effect_enabled_default: effectDefault,
        add_device_ids: add,
        remove_device_ids: remove,
      };
      if (masterId) body.master_device_id = masterId;
      await api.patch(`/device-groups/${group.id}`, body);
      // S145/S150: 箸休めは lv2_admin 以上に開放済み。変更された時だけ叩く。
      if (restProgramId !== initialRest) {
        await api.put(`/device-groups/${group.id}/rest-program`, {
          rest_program_id: restProgramId || null,  // '' は「既定に戻す」
        });
      }
      onSaved();
    } catch (e) {
      console.error('[device-groups] save failed:', e);
      setError(apiMessage(e, t.saveFailed));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${vwPreview ? "max-w-5xl" : "max-w-lg"} max-h-[85vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="text-sm">{t.editTitle(group.name)}</DialogTitle>
          <DialogDescription className="text-xs">
            {t.editDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t.groupName}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="edit-linked" checked={linked} onCheckedChange={(c) => setLinked(c === true)} />
            <label htmlFor="edit-linked" className="text-xs">{t.linkedCheckbox}</label>
          </div>

          {/* S145: 演出ON/OFFは端末タブで制御するため非表示。値は常にtrue固定。 */}
          {false && (
          <div className="flex items-center gap-2">
            <Checkbox id="edit-effect" checked={effectDefault} onCheckedChange={(c) => setEffectDefault(c === true)} />
            <label htmlFor="edit-effect" className="text-xs">{t.effectDefaultCheckbox}</label>
          </div>
          )}

          {/* S145/S150: 箸休め番組（全アカウントで設定可。backendがcustomer_id絞り込みで自顧客のみ保証） */}
          {true && (
            <div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <label className="text-xs font-medium flex items-center gap-1.5">
                <span className="text-amber-500">●</span>{t.restProgramLabel}
              </label>
              <select
                value={restProgramId}
                onChange={(e) => setRestProgramId(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">{t.useDefaultRest}</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                {t.restProgramNote}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t.membersMaster}</label>
            <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
              {[...devices]
                .sort((a, b) => Number(b.status === 'online') - Number(a.status === 'online'))
                .map((d) => {
                const isMember = memberIds.includes(d.id);
                const online = d.status === 'online';
                return (
                  <div key={d.id} className={`flex items-center gap-2 px-3 py-2 ${online ? '' : 'opacity-50'}`}>
                    <Checkbox checked={isMember} onCheckedChange={() => toggleMember(d.id)} />
                    <span
                      className={online ? 'text-emerald-500 text-xs leading-none' : 'text-muted-foreground text-xs leading-none'}
                      title={online ? t.online : t.offline}
                    >{online ? '●' : '○'}</span>
                    <span className="text-xs">{d.name || d.id}</span>
                    <span className="text-[10px] text-muted-foreground">{d.id}</span>
                    {/* ★S248: master 選択UIは廃止。連動ONなら backend が自動で1台を master にする */}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t.masterAutoNote}
            </p>
          </div>

          {/* S148: ビデオウォール分割 */}
          <div className="space-y-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-xs font-medium">
              <Checkbox checked={vwEnabled} onCheckedChange={() => setVwEnabled((v) => !v)} />
              <Grid3x3 className="h-3.5 w-3.5" />{t.vwSplit}
            </label>
            {vwEnabled && (
              <div className="space-y-2 pl-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-[10px] text-muted-foreground">{t.sourceVideo}</label>
                    <select className="w-full rounded border bg-background px-2 py-1 text-xs"
                      value={vwSourceId} onChange={(e) => setVwSourceId(e.target.value)}>
                      <option value="">{t.pleaseSelect}</option>
                      {vwAssets.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">{t.rows}</label>
                    <input type="number" min={1} max={20} value={vwRows}
                      onChange={(e) => setVwRows(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded border bg-background px-2 py-1 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">{t.cols}</label>
                    <input type="number" min={1} max={20} value={vwCols}
                      onChange={(e) => setVwCols(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded border bg-background px-2 py-1 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">{t.bezelCorrection}</label>
                    <input type="number" min={0} max={400}
                      value={vwBezel === 0 ? "" : vwBezel}
                      placeholder="0"
                      onChange={(e) => {
                        const v = e.target.value.replace(/^0+(?=\d)/, "");
                        setVwBezel(v === "" ? 0 : Math.max(0, Math.min(400, Number(v))));
                      }}
                      className="w-full rounded border bg-background px-2 py-1 text-xs" />
                  </div>
                  <div className="flex items-end text-[10px] text-muted-foreground">
                    {t.splitInto(vwRows * vwCols)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={vwCreate} disabled={vwBusy || !vwSourceId}>
                    {vwBusy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}{t.create}
                  </Button>
                  <Button size="sm" variant="outline" onClick={vwSplit} disabled={vwBusy || !vw}>
                    {vwBusy ? (<><Loader2 className="h-3 w-3 animate-spin mr-1" />{t.splitting(vwSplitSec)}</>) : t.splitRun}
                  </Button>
                  {/* ★S227: 自動割当ボタンは非表示（手動割り当てのみ） */}
                  <Button size="sm" variant="outline" onClick={() => setVwPreview(true)} disabled={!vw}>
                    <Play className="h-3 w-3 mr-1" />{t.preview}
                  </Button>
                  <Button size="sm" onClick={vwDeploy} disabled={vwBusy || !vw || vw.status !== 'ready'}>
                    {t.deploy}
                  </Button>
                </div>
                {vw && (
                  <div className="text-[10px] text-muted-foreground">
                    {t.statusTiles(vw.status, vw.tiles.length)}
                  </div>
                )}
                {vw && vw.tiles.length > 0 && (
                  <div className="space-y-1">
                    {vw.tiles.map((tile) => (
                      <div key={tile.id} className="flex items-center gap-2 text-[10px]">
                        <span className="w-12 text-muted-foreground">R{tile.row}C{tile.col}</span>
                        <select className="flex-1 rounded border bg-background px-2 py-1"
                          value={tile.device_id ?? ''} onChange={(e) => vwAssignTile(tile.id, e.target.value)}>
                          <option value="">{t.unassigned}</option>
                          {devices.filter((d) => memberIds.includes(d.id)).map((d) => (
                            <option key={d.id} value={d.id}>{d.name ?? d.id}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
                {vwErr && <p className="text-[10px] text-red-500">{vwErr}</p>}
                {vwPreview && vw && (
                  <VideoWallPreviewModal
                    rows={vw.rows}
                    cols={vw.cols}
                    bezelPx={vw.bezel_px > 0 ? Math.round(vw.bezel_px / 6) : 0}
                    sourceUrl={vwAssets.find((a) => a.id === (vwSourceId || vw.source_asset_id))?.url ?? null}
                    realBezelPx={vwBezel}
                    tiles={vw.tiles.map((t) => ({
                      position_index: t.position_index, row: t.row, col: t.col,
                      tile_asset_url: t.tile_asset_url ?? null,
                      device_name: devices.find((d) => d.id === t.device_id)?.name ?? null,
                    }))}
                    onClose={() => setVwPreview(false)}
                  />
                )}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>{t.cancel}</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}{t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateGroupDialog({
  devices, onClose, onSaved,
}: {
  devices: DeviceLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = usePageT(deviceGroupsDict);
  const [name, setName] = useState('');
  const [linked, setLinked] = useState(false);
  const [effectDefault, setEffectDefault] = useState(true);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [masterId, setMasterId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMember = (id: string) => {
    setMemberIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!next.includes(masterId)) setMasterId('');
      return next;
    });
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<{ id: string }>('/device-groups', {
        name,
        parent_id: null,
        linked,
      });
      const needsPatch = effectDefault === false || memberIds.length > 0 || !!masterId;
      if (created?.id && needsPatch) {
        const body: Record<string, unknown> = {
          effect_enabled_default: effectDefault,
          add_device_ids: memberIds,
        };
        if (masterId) body.master_device_id = masterId;
        await api.patch(`/device-groups/${created.id}`, body);
      }
      onSaved();
    } catch (e) {
      console.error('[device-groups] create failed:', e);
      setError(apiMessage(e, t.createFailed));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">{t.createTitle}</DialogTitle>
          <DialogDescription className="text-xs">
            {t.createDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t.groupName}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="new-linked" checked={linked} onCheckedChange={(c) => setLinked(c === true)} />
            <label htmlFor="new-linked" className="text-xs">{t.linkedCheckbox}</label>
          </div>

          {/* S145: 演出ON/OFFは端末タブで制御するため非表示。値は常にtrue固定。 */}
          {false && (
          <div className="flex items-center gap-2">
            <Checkbox id="new-effect" checked={effectDefault} onCheckedChange={(c) => setEffectDefault(c === true)} />
            <label htmlFor="new-effect" className="text-xs">{t.effectDefaultCheckbox}</label>
          </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t.membersMaster}</label>
            <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
              {[...devices]
                .sort((a, b) => Number(b.status === 'online') - Number(a.status === 'online'))
                .map((d) => {
                const isMember = memberIds.includes(d.id);
                const online = d.status === 'online';
                return (
                  <div key={d.id} className={`flex items-center gap-2 px-3 py-2 ${online ? '' : 'opacity-50'}`}>
                    <Checkbox checked={isMember} onCheckedChange={() => toggleMember(d.id)} />
                    <span
                      className={online ? 'text-emerald-500 text-xs leading-none' : 'text-muted-foreground text-xs leading-none'}
                      title={online ? t.online : t.offline}
                    >{online ? '●' : '○'}</span>
                    <span className="text-xs">{d.name || d.id}</span>
                    <span className="text-[10px] text-muted-foreground">{d.id}</span>
                    {/* ★S248: master 選択UIは廃止 */}
                  </div>
                );
              })}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>{t.cancel}</Button>
          <Button size="sm" onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}{t.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteGroupDialog({
  group, onClose, onDeleted,
}: {
  group: DeviceGroup;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = usePageT(deviceGroupsDict);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMembers = group.device_count > 0;
  const hasChildren = group.child_group_count > 0;
  const hasContent = hasMembers || hasChildren;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/device-groups/${group.id}`);
      onDeleted();
    } catch (e) {
      console.error('[device-groups] delete failed:', e);
      setError(apiMessage(e, t.deleteFailed));
      setDeleting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            {t.deleteTitle}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t.irreversible}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm">
            {t.deletePre}<span className="font-medium">{group.name}</span>{t.deletePost}
          </p>

          {hasContent && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2.5 space-y-1">
              <p className="text-xs font-medium text-red-500 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                {t.containsFollowing}
              </p>
              <ul className="text-xs text-muted-foreground list-disc list-inside">
                {hasMembers && <li>{t.memberCount(group.device_count)}</li>}
                {hasChildren && <li>{t.childCount(group.child_group_count)}</li>}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                {t.deleteWarn}
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={deleting}>{t.cancel}</Button>
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}{t.doDelete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
