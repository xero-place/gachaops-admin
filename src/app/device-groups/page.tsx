'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';
import { Loader2, Layers3, ChevronRight, Plus, Link2, Sparkles, Crown, Trash2, AlertTriangle, Grid3x3, Play } from 'lucide-react';
import VideoWallPreviewModal from '@/components/videowall/VideoWallPreviewModal';

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
type VwAssetLite = { id: string; name: string; type?: string };
type VwTile = { id: string; row: number; col: number; position_index: number; tile_asset_id?: string | null; device_id?: string | null; tile_asset_url?: string | null };
type VideoWall = { id: string; name: string; rows: number; cols: number; bezel_px: number; status: string; tiles: VwTile[] };
type ProgramLite = { id: string; name: string };  // S145: 箸休めセレクタ用

export default function DeviceGroupsPage() {
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [devices, setDevices] = useState<DeviceLite[]>([]);
  const [programs, setPrograms] = useState<ProgramLite[]>([]);  // S145: 箸休めセレクタ用
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DeviceGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<DeviceGroup | null>(null);

  const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';

  const reload = useCallback(async () => {
    const res = await api.get<{ items?: DeviceGroup[] } | DeviceGroup[]>('/device-groups?limit=200');
    const arr = Array.isArray(res) ? res : (res.items ?? []);
    setDeviceGroups(arr.map((g) => ({ ...g, members: g.members ?? [] })));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [groupsRes, devRes, progRes] = await Promise.all([
          api.get<{ items?: DeviceGroup[] } | DeviceGroup[]>('/device-groups?limit=200'),
          api.get<{ items?: DeviceLite[] } | DeviceLite[]>('/devices?limit=200'),
          api.get<{ items?: ProgramLite[] } | ProgramLite[]>('/programs?limit=200'),  // S145
        ]);
        if (cancelled) return;
        const groups = Array.isArray(groupsRes) ? groupsRes : (groupsRes.items ?? []);
        const devs = Array.isArray(devRes) ? devRes : (devRes.items ?? []);
        const progs = Array.isArray(progRes) ? progRes : (progRes.items ?? []);  // S145
        setDeviceGroups(groups.map((g) => ({ ...g, members: g.members ?? [] })));
        setDevices(devs);
        setPrograms(progs);  // S145
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
      <AppShell title="デバイスグループ" breadcrumb={['ホーム', 'グループ']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const roots = deviceGroups.filter((g) => g.parent_id === null);
  const childrenOf = (id: string) => deviceGroups.filter((g) => g.parent_id === id);

  return (
    <AppShell title="デバイスグループ" breadcrumb={['ホーム', 'グループ']}>
      <div className="flex items-center justify-end mb-4">
        {isSuperAdmin && (
          <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />新規グループ
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">グループ階層</CardTitle>
          <p className="text-xs text-muted-foreground">エリア単位や連動再生グループを階層管理</p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1">
            {roots.map((root) => (
              <GroupNode
                key={root.id}
                group={root}
                childrenList={childrenOf(root.id)}
                depth={0}
                allGroups={deviceGroups}
                canEdit={isSuperAdmin}
                onEdit={setEditing}
                onDelete={setDeleting}
                devices={devices}
                programs={programs}
              />
            ))}
          </ul>
        </CardContent>
      </Card>

      {editing && (
        <EditGroupDialog
          group={editing}
          devices={devices}
          programs={programs}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setEditing(null)}
          onSaved={async () => { await reload(); setEditing(null); }}
        />
      )}
      {creating && (
        <CreateGroupDialog
          devices={devices}
          allGroups={deviceGroups}
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
  // S145: メンバー端末の状態表示。restProgram名解決（NULL=既定の箸休め）。
  const restName = group.rest_program_id
    ? (programs.find((p) => p.id === group.rest_program_id)?.name ?? group.rest_program_id)
    : '既定の箸休め';
  const memberDevices = group.members.map((m) => ({
    m,
    d: devices.find((x) => x.id === m.device_id),
  }));
  return (
    <li>
      <div
        className="flex items-center gap-2 p-2.5 rounded-md hover:bg-accent transition-colors group"
        style={{ paddingLeft: `${depth * 24 + 10}px` }}
      >
        {childrenList.length > 0 ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <div className="w-3.5" />
        )}
        <Layers3 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{group.name}</span>
        {canEdit && group.customer_id && (
          <span className="text-[10px] font-mono text-amber-500/80">{group.customer_id}</span>
        )}
        {group.linked && (
          <Badge variant="default" className="gap-1 text-[10px]">
            <Link2 className="h-2.5 w-2.5" />連動再生
          </Badge>
        )}
        {/* S145: 演出はグループ既定常時true・端末タブで制御のためバッジ非表示 */}
        {false && group.effect_enabled_default && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Sparkles className="h-2.5 w-2.5" />演出ON
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {group.device_count} 台
          {group.child_group_count > 0 && ` · ${group.child_group_count} 子グループ`}
        </span>
        {canEdit && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onEdit(group)}>編集</Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
              onClick={() => onDelete(group)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      {group.members.length > 0 && (
        <div className="space-y-0.5 mt-0.5 mb-1" style={{ paddingLeft: `${depth * 24 + 44}px` }}>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="opacity-70">箸休め:</span>
            <span className="font-medium">{restName}</span>
          </div>
          {memberDevices.map(({ m, d }) => {
            const online = d?.status === 'online';
            return (
              <div key={m.device_id} className="flex items-center gap-2 text-xs">
                <span className={online ? 'text-emerald-500' : 'text-muted-foreground'}>
                  {online ? '●' : '○'}
                </span>
                <span className="font-medium">{d?.name ?? m.device_id}</span>
                {m.is_master && (
                  <Crown className="h-3 w-3 text-amber-500" />
                )}
                <span className="ml-2 text-muted-foreground">
                  {online
                    ? (d?.current_program_name ? `再生中: ${d.current_program_name}` : '再生中: —')
                    : 'オフライン'}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {childrenList.length > 0 && (
        <ul className="space-y-1 mt-1">
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
  group, devices, programs, isSuperAdmin, onClose, onSaved,
}: {
  group: DeviceGroup;
  devices: DeviceLite[];
  programs: ProgramLite[];
  isSuperAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
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
  const [vwErr, setVwErr] = useState<string | null>(null);

  useEffect(() => {
    if (!vwEnabled || vwAssets.length) return;
    api.get<{ items?: VwAssetLite[] } | VwAssetLite[]>('/assets?limit=200')
      .then((r) => {
        const list = Array.isArray(r) ? r : (r.items ?? []);
        setVwAssets(list.filter((a) => (a.type ?? 'video') === 'video'));
      })
      .catch(() => setVwErr('素材の取得に失敗しました'));
  }, [vwEnabled, vwAssets.length]);

  const vwCreate = async () => {
    if (!vwSourceId) { setVwErr('元動画を選択してください'); return; }
    const n = vwRows * vwCols;
    if (n < 2 || n > 20) { setVwErr('台数は2〜20の範囲です'); return; }
    setVwBusy(true); setVwErr(null);
    try {
      const created = await api.post<VideoWall>('/videowalls', {
        name: `${name}_wall`, source_asset_id: vwSourceId,
        rows: vwRows, cols: vwCols, bezel_px: vwBezel, device_group_id: group.id,
      });
      setVw(created);
    } catch { setVwErr('作成に失敗しました（権限・接続を確認）'); }
    finally { setVwBusy(false); }
  };
  const vwSplit = async () => {
    if (!vw) return; setVwBusy(true); setVwErr(null);
    try { const r = await api.post<VideoWall>(`/videowalls/${vw.id}/split`, {}); setVw(r); }
    catch { setVwErr('分割の開始に失敗しました'); } finally { setVwBusy(false); }
  };
  const vwAutoAssign = async () => {
    if (!vw) return; setVwBusy(true); setVwErr(null);
    try { const r = await api.post<VideoWall>(`/videowalls/${vw.id}/auto-assign`, {}); setVw(r); }
    catch { setVwErr('自動割当に失敗しました'); } finally { setVwBusy(false); }
  };
  const vwAssignTile = async (tileId: string, deviceId: string) => {
    if (!vw) return;
    try { const r = await api.patch<VideoWall>(`/videowalls/${vw.id}/tiles/${tileId}`, { device_id: deviceId || null }); setVw(r); }
    catch { setVwErr('割当の変更に失敗しました'); }
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
      // S145: 箸休めは lv1_super 専用エンドポイント。権限がある かつ 変更された時だけ叩く。
      if (isSuperAdmin && restProgramId !== initialRest) {
        await api.put(`/device-groups/${group.id}/rest-program`, {
          rest_program_id: restProgramId || null,  // '' は「既定に戻す」
        });
      }
      onSaved();
    } catch (e) {
      console.error('[device-groups] save failed:', e);
      setError('保存に失敗しました。権限（lv1_super）と接続を確認してください。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">グループ編集：{group.name}</DialogTitle>
          <DialogDescription className="text-xs">
            メンバー・連動再生・演出既定・同期マスターを設定します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">グループ名</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="edit-linked" checked={linked} onCheckedChange={(c) => setLinked(c === true)} />
            <label htmlFor="edit-linked" className="text-xs">連動再生（複数台を同期）</label>
          </div>

          {/* S145: 演出ON/OFFは端末タブで制御するため非表示。値は常にtrue固定。 */}
          {false && (
          <div className="flex items-center gap-2">
            <Checkbox id="edit-effect" checked={effectDefault} onCheckedChange={(c) => setEffectDefault(c === true)} />
            <label htmlFor="edit-effect" className="text-xs">演出をグループ既定で有効にする</label>
          </div>
          )}

          {/* S145: 箸休め番組（運営lv1_superのみ表示・顧客には出ない） */}
          {isSuperAdmin && (
            <div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <label className="text-xs font-medium flex items-center gap-1.5">
                <span className="text-amber-500">●</span>箸休め番組（運営専用）
              </label>
              <select
                value={restProgramId}
                onChange={(e) => setRestProgramId(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">既定の箸休めを使う</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                このグループの番組境界で挟む箸休め映像。未選択なら既定の箸休めになります。運営（lv1_super）のみ設定でき、顧客アカウントからは変更できません。
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium">メンバー端末 / 同期マスター</label>
            <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
              {devices.map((d) => {
                const isMember = memberIds.includes(d.id);
                return (
                  <div key={d.id} className="flex items-center gap-2 px-3 py-2">
                    <Checkbox checked={isMember} onCheckedChange={() => toggleMember(d.id)} />
                    <span className="text-xs">{d.name || d.id}</span>
                    <span className="text-[10px] text-muted-foreground">{d.id}</span>
                    <label className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                      <input
                        type="radio"
                        name="master"
                        disabled={!isMember}
                        checked={masterId === d.id}
                        onChange={() => setMasterId(d.id)}
                      />
                      <Crown className="h-3 w-3" />master
                    </label>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">
              連動再生グループでは、master 端末が同期の基準になります。メンバーに含まれる端末のみ master 指定できます。
            </p>
          </div>

          {/* S148: ビデオウォール分割 */}
          <div className="space-y-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-xs font-medium">
              <Checkbox checked={vwEnabled} onCheckedChange={() => setVwEnabled((v) => !v)} />
              <Grid3x3 className="h-3.5 w-3.5" />ビデオウォール分割（1映像を複数台に分割投影）
            </label>
            {vwEnabled && (
              <div className="space-y-2 pl-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-[10px] text-muted-foreground">元動画</label>
                    <select className="w-full rounded border bg-background px-2 py-1 text-xs"
                      value={vwSourceId} onChange={(e) => setVwSourceId(e.target.value)}>
                      <option value="">選択してください</option>
                      {vwAssets.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">行</label>
                    <input type="number" min={1} max={20} value={vwRows}
                      onChange={(e) => setVwRows(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded border bg-background px-2 py-1 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">列</label>
                    <input type="number" min={1} max={20} value={vwCols}
                      onChange={(e) => setVwCols(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded border bg-background px-2 py-1 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">ベゼル補正(px)</label>
                    <input type="number" min={0} max={400} value={vwBezel}
                      onChange={(e) => setVwBezel(Math.max(0, Number(e.target.value)))}
                      className="w-full rounded border bg-background px-2 py-1 text-xs" />
                  </div>
                  <div className="flex items-end text-[10px] text-muted-foreground">
                    {vwRows * vwCols} 台に分割
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={vwCreate} disabled={vwBusy || !vwSourceId}>
                    {vwBusy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}作成
                  </Button>
                  <Button size="sm" variant="outline" onClick={vwSplit} disabled={vwBusy || !vw}>分割実行</Button>
                  <Button size="sm" variant="outline" onClick={vwAutoAssign} disabled={vwBusy || !vw}>自動割当</Button>
                  <Button size="sm" onClick={() => setVwPreview(true)} disabled={!vw}>
                    <Play className="h-3 w-3 mr-1" />実機投影プレビュー
                  </Button>
                </div>
                {vw && (
                  <div className="text-[10px] text-muted-foreground">
                    状態: {vw.status}　タイル: {vw.tiles.length}枚
                  </div>
                )}
                {vw && vw.tiles.length > 0 && (
                  <div className="space-y-1">
                    {vw.tiles.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-[10px]">
                        <span className="w-12 text-muted-foreground">R{t.row}C{t.col}</span>
                        <select className="flex-1 rounded border bg-background px-2 py-1"
                          value={t.device_id ?? ''} onChange={(e) => vwAssignTile(t.id, e.target.value)}>
                          <option value="">未割当</option>
                          {devices.filter((d) => memberIds.includes(d.id)).map((d) => (
                            <option key={d.id} value={d.id}>{d.name ?? d.id}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
                {vwErr && <p className="text-[10px] text-red-500">{vwErr}</p>}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
      {vwPreview && vw && (
        <VideoWallPreviewModal
          rows={vw.rows}
          cols={vw.cols}
          bezelPx={Math.max(6, Math.round(vw.bezel_px / 6))}
          tiles={vw.tiles.map((t) => ({
            position_index: t.position_index, row: t.row, col: t.col,
            tile_asset_url: t.tile_asset_url ?? null,
            device_name: devices.find((d) => d.id === t.device_id)?.name ?? null,
          }))}
          onClose={() => setVwPreview(false)}
        />
      )}
    </Dialog>
  );
}

function CreateGroupDialog({
  devices, allGroups, onClose, onSaved,
}: {
  devices: DeviceLite[];
  allGroups: DeviceGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('');
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
        parent_id: parentId || null,
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
      setError('作成に失敗しました。権限（lv1_super）と接続を確認してください。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">新規グループ作成</DialogTitle>
          <DialogDescription className="text-xs">
            グループを作成し、メンバーと同期マスターを設定します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">グループ名</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：渋谷店 連動グループ"
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">親グループ（任意）</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">（なし・ルート）</option>
              {allGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="new-linked" checked={linked} onCheckedChange={(c) => setLinked(c === true)} />
            <label htmlFor="new-linked" className="text-xs">連動再生（複数台を同期）</label>
          </div>

          {/* S145: 演出ON/OFFは端末タブで制御するため非表示。値は常にtrue固定。 */}
          {false && (
          <div className="flex items-center gap-2">
            <Checkbox id="new-effect" checked={effectDefault} onCheckedChange={(c) => setEffectDefault(c === true)} />
            <label htmlFor="new-effect" className="text-xs">演出をグループ既定で有効にする</label>
          </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium">メンバー端末 / 同期マスター</label>
            <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
              {devices.map((d) => {
                const isMember = memberIds.includes(d.id);
                return (
                  <div key={d.id} className="flex items-center gap-2 px-3 py-2">
                    <Checkbox checked={isMember} onCheckedChange={() => toggleMember(d.id)} />
                    <span className="text-xs">{d.name || d.id}</span>
                    <span className="text-[10px] text-muted-foreground">{d.id}</span>
                    <label className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                      <input
                        type="radio"
                        name="new-master"
                        disabled={!isMember}
                        checked={masterId === d.id}
                        onChange={() => setMasterId(d.id)}
                      />
                      <Crown className="h-3 w-3" />master
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button size="sm" onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}作成
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
      setError('削除に失敗しました。メンバーや子グループを含むグループは削除できない場合があります。先にメンバーを外してください。');
      setDeleting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            グループを削除
          </DialogTitle>
          <DialogDescription className="text-xs">
            この操作は取り消せません。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm">
            グループ「<span className="font-medium">{group.name}</span>」を削除しますか？
          </p>

          {hasContent && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2.5 space-y-1">
              <p className="text-xs font-medium text-red-500 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                このグループには以下が含まれています
              </p>
              <ul className="text-xs text-muted-foreground list-disc list-inside">
                {hasMembers && <li>メンバー端末 {group.device_count} 台</li>}
                {hasChildren && <li>子グループ {group.child_group_count} 個</li>}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                連動再生グループの場合、削除すると同期動作に影響する可能性があります。本当に削除してよいか確認してください。
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={deleting}>キャンセル</Button>
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}削除する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
