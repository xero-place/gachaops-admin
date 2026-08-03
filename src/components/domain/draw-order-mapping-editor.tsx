'use client';

/**
 * DrawOrderMappingEditor — 排出順 1〜100 番の演出マッピング編集 共通部品
 *
 * S226 改修:
 *   - 「デフォルト演出(L1)」カードと「演出再生」トグルUIを撤去し、
 *     操作を「一括設定」ダイアログに集約（分かりやすさ優先）。
 *   - 一括設定は3モード:
 *       単一   … 選んだ1演出を範囲へ割当。
 *       ランダム … 選んだ複数演出を範囲の各スロットへランダム割当（設定時にシャッフル。
 *                  端末側の変更＝APK更新は不要。周期内は固定順の擬似ランダム）。
 *       OFF    … 端末の effect_enabled=false（当選演出を流さない。番組・売上は継続）。
 *   - 1つ1つの個別編集・排出順カウンタのリセットは従来どおり。
 *
 * props:
 *   - poolId: 対象プールID（端末の専用プール）。空文字なら何も表示しない。
 *   - deviceId: 排出順カウンタのリセット／演出ON・OFF に使用。省略時は該当UIを出さない。
 *   - packs: 演出パック一覧（親が /gacha/effect-packs で取得して渡す）。
 *   - defaultEffectPackId / onDefaultEffectChange: 後方互換のため受け取るが未使用（L1撤去）。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import type {
  GachaPool,
  GachaEffectPack,
  GachaDrawOrderEffect,
  GachaDrawOrderEffectBulkItem,
  GachaDrawOrderEffectBulkResult,
} from '@/types/domain';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  Save,
  CheckCircle2,
  RotateCcw,
  Shuffle,
  PowerOff,
} from 'lucide-react';

const MAX_DRAW_ORDER = 100;

const BADGE_RAINBOW =
  'bg-gradient-to-r from-pink-100 via-yellow-100 to-cyan-100 text-purple-800 border-purple-300';

// 複数の演出動画を混在させたとき、種類ごとに一目で分かるよう自動割当する配色。
const BADGE_PALETTE = [
  'bg-rose-100 text-rose-700 border-rose-300',
  'bg-sky-100 text-sky-700 border-sky-300',
  'bg-amber-100 text-amber-800 border-amber-300',
  'bg-emerald-100 text-emerald-700 border-emerald-300',
  'bg-violet-100 text-violet-700 border-violet-300',
  'bg-cyan-100 text-cyan-700 border-cyan-300',
  'bg-orange-100 text-orange-800 border-orange-300',
  'bg-lime-100 text-lime-700 border-lime-300',
  'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300',
  'bg-teal-100 text-teal-700 border-teal-300',
];

type BulkMode = 'single' | 'random' | 'off';

interface Props {
  poolId: string;
  packs: GachaEffectPack[];
  /** 後方互換のため受け取るが未使用（L1撤去）。 */
  defaultEffectPackId?: string | null;
  /** 後方互換のため受け取るが未使用（L1撤去）。 */
  onDefaultEffectChange?: (pool: GachaPool) => void;
  /** 排出順カウンタのリセット／演出ON・OFF に使用。省略時は該当UIを出さない。 */
  deviceId?: string;
}

export function DrawOrderMappingEditor({ poolId, packs, deviceId }: Props) {
  // ★S197: 排出順カウンタ (gacha_machines.draw_count)
  const [drawCount, setDrawCount] = useState<number | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [effects, setEffects] = useState<GachaDrawOrderEffect[]>([]);
  const [, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 編集ダイアログ
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDrawOrder, setEditDrawOrder] = useState<number | null>(null);
  const [editEffectPackId, setEditEffectPackId] = useState<string>('');
  const [editPrizeName, setEditPrizeName] = useState<string>('');
  const [editPrizeValue, setEditPrizeValue] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editSaving, setEditSaving] = useState(false);

  // 一括設定ダイアログ
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<BulkMode>('single');
  const [bulkStart, setBulkStart] = useState<string>('1');
  const [bulkEnd, setBulkEnd] = useState<string>('100');
  const [bulkEffectPackId, setBulkEffectPackId] = useState<string>('');
  const [bulkPackIds, setBulkPackIds] = useState<string[]>([]);
  const [bulkReplaceAll, setBulkReplaceAll] = useState(true);
  const [bulkSaving, setBulkSaving] = useState(false);

  const loadDrawCount = useCallback(async () => {
    if (!deviceId) return;
    try {
      const m = await api.get<{ draw_count: number }>(
        `/gacha/devices/${deviceId}/machine`,
      );
      setDrawCount(m.draw_count);
    } catch {
      setDrawCount(null); // machine 未作成などは黙って非表示
    }
  }, [deviceId]);

  useEffect(() => {
    void loadDrawCount();
  }, [loadDrawCount]);

  const handleResetDrawCount = useCallback(async () => {
    if (!deviceId) return;
    setResetting(true);
    setError(null);
    try {
      const m = await api.post<{ draw_count: number }>(
        `/gacha/devices/${deviceId}/machine/reset-draw-count`,
        {},
      );
      setDrawCount(m.draw_count);
      setResetDialogOpen(false);
      setSuccessMsg('排出順カウンタをリセットしました。次の排出から 1 番目の演出になります。');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      setError(`カウンタのリセットに失敗しました: ${msg}`);
    } finally {
      setResetting(false);
    }
  }, [deviceId]);

  // ─── マッピング一覧取得 ───
  const reloadEffects = useCallback(async () => {
    if (!poolId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<GachaDrawOrderEffect[]>(
        `/gacha/pools/${poolId}/draw-order-effects`,
      );
      setEffects(data);
    } catch (e) {
      const msg = e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`マッピング取得失敗: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  useEffect(() => {
    void reloadEffects();
  }, [reloadEffects]);

  const effectsByOrder = useMemo(() => {
    const map = new Map<number, GachaDrawOrderEffect>();
    effects.forEach((e) => map.set(e.draw_order, e));
    return map;
  }, [effects]);

  // mp4 演出のみ（html5 はここでは扱わない・既存踏襲）
  const mp4Packs = useMemo(() => packs.filter((p) => p.effect_type !== 'html5'), [packs]);

  const openEditDialog = (drawOrder: number, existing: GachaDrawOrderEffect | undefined) => {
    setEditDrawOrder(drawOrder);
    setEditEffectPackId(existing?.effect_pack_id ?? 'gep_builtin_normal');
    setEditPrizeName(existing?.prize_name ?? '');
    setEditPrizeValue(existing?.prize_value?.toString() ?? '');
    setEditNotes(existing?.notes ?? '');
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (editDrawOrder === null || !poolId) return;
    setEditSaving(true);
    setError(null);
    try {
      const body = {
        effect_pack_id: editEffectPackId,
        prize_name: editPrizeName || null,
        prize_value: editPrizeValue ? parseInt(editPrizeValue, 10) : null,
        notes: editNotes || null,
      };
      const existing = effectsByOrder.get(editDrawOrder);
      if (existing) {
        await api.put(`/gacha/pools/${poolId}/draw-order-effects/${editDrawOrder}`, body);
        setSuccessMsg(`排出順 ${editDrawOrder} 番を更新しました`);
      } else {
        await api.post(`/gacha/pools/${poolId}/draw-order-effects`, {
          draw_order: editDrawOrder,
          ...body,
        });
        setSuccessMsg(`排出順 ${editDrawOrder} 番を追加しました`);
      }
      setEditDialogOpen(false);
      await reloadEffects();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      const msg = e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`保存失敗: ${msg}`);
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditDelete = async () => {
    if (editDrawOrder === null || !poolId) return;
    if (!confirm(`排出順 ${editDrawOrder} 番のマッピングを削除しますか?`)) return;
    setEditSaving(true);
    setError(null);
    try {
      await api.delete(`/gacha/pools/${poolId}/draw-order-effects/${editDrawOrder}`);
      setSuccessMsg(`排出順 ${editDrawOrder} 番を削除しました`);
      setEditDialogOpen(false);
      await reloadEffects();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      const msg = e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`削除失敗: ${msg}`);
    } finally {
      setEditSaving(false);
    }
  };

  // 端末の演出ON/OFF（撤去した「演出再生」トグルの代替）。best-effort。
  const setDeviceEffectEnabled = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      if (!deviceId) return false;
      try {
        await api.patch(`/devices/${deviceId}/effect_enabled`, { effect_enabled: enabled });
        return true;
      } catch {
        return false;
      }
    },
    [deviceId],
  );

  const toggleBulkPack = (id: string) => {
    setBulkPackIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const openBulkDialog = () => {
    setBulkMode('single');
    setBulkStart('1');
    setBulkEnd('100');
    setBulkEffectPackId('');
    setBulkPackIds([]);
    setBulkReplaceAll(true);
    setError(null);
    setBulkDialogOpen(true);
  };

  const handleBulkSave = async () => {
    if (!poolId) return;
    setError(null);

    // ── OFF: 端末の当選演出を止める（マッピングは保持）──
    if (bulkMode === 'off') {
      if (!deviceId) {
        setError('演出OFFは端末詳細の演出タブからのみ設定できます');
        return;
      }
      setBulkSaving(true);
      try {
        const ok = await setDeviceEffectEnabled(false);
        if (!ok) throw new Error('effect_enabled の更新に失敗しました');
        setSuccessMsg('演出をOFFにしました（当選演出を流しません。番組・売上は継続します）');
        setBulkDialogOpen(false);
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch (e) {
        const msg = e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
        setError(`演出OFF失敗: ${msg}`);
      } finally {
        setBulkSaving(false);
      }
      return;
    }

    // ── 単一 / ランダム: 範囲へ割当 ──
    const start = parseInt(bulkStart, 10);
    const end = parseInt(bulkEnd, 10);
    if (isNaN(start) || isNaN(end) || start < 1 || end > MAX_DRAW_ORDER || start > end) {
      setError(`不正な範囲指定: ${start}〜${end} (1〜${MAX_DRAW_ORDER} の昇順で指定してください)`);
      return;
    }

    let chosen: string[];
    if (bulkMode === 'single') {
      if (!bulkEffectPackId) {
        setError('演出を選択してください');
        return;
      }
      chosen = [bulkEffectPackId];
    } else {
      if (bulkPackIds.length < 1) {
        setError('ランダムに流す演出を1つ以上選択してください');
        return;
      }
      chosen = bulkPackIds;
    }

    setBulkSaving(true);
    try {
      const items: GachaDrawOrderEffectBulkItem[] = [];
      for (let i = start; i <= end; i++) {
        const packId =
          bulkMode === 'random'
            ? chosen[Math.floor(Math.random() * chosen.length)]
            : chosen[0];
        items.push({ draw_order: i, effect_pack_id: packId });
      }
      const res = await api.put<GachaDrawOrderEffectBulkResult>(
        `/gacha/pools/${poolId}/draw-order-effects/bulk`,
        { items, replace_all: bulkReplaceAll },
      );
      // 演出が確実に流れるよう ON にする（撤去した「演出再生」トグルの代替）。
      const turnedOn = await setDeviceEffectEnabled(true);
      const onNote = deviceId ? (turnedOn ? ' / 演出ON' : ' / ※演出ONの反映は失敗（権限等）') : '';
      setSuccessMsg(
        `${bulkMode === 'random' ? '複数演出をランダム割当' : '演出を一括設定'}: ` +
          `${res.inserted} 追加 / ${res.updated} 更新 / ${res.deleted} 削除 (合計 ${res.total_after} 件)` +
          onNote,
      );
      setBulkDialogOpen(false);
      await reloadEffects();
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (e) {
      const msg = e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`一括設定失敗: ${msg}`);
    } finally {
      setBulkSaving(false);
    }
  };

  const packById = useMemo(() => {
    const map = new Map<string, GachaEffectPack>();
    packs.forEach((p) => map.set(p.id, p));
    return map;
  }, [packs]);

  const packForEffect = (effect: GachaDrawOrderEffect | undefined) =>
    effect ? packById.get(effect.effect_pack_id) : undefined;

  const stats = useMemo(() => {
    const total = effects.length;
    const tierCount = [0, 0, 0, 0, 0, 0];
    effects.forEach((e) => {
      const pack = packById.get(e.effect_pack_id);
      if (pack) tierCount[pack.tier]++;
    });
    return { total, tierCount };
  }, [effects, packById]);

  // 演出バッジ配色: 動画1種のみ→全て虹色 / 複数→種類ごとに自動で別色（一目で分かるUI）。
  const packColor = useMemo(() => {
    const ids = Array.from(new Set(effects.map((e) => e.effect_pack_id))).sort();
    const m = new Map<string, string>();
    if (ids.length <= 1) {
      ids.forEach((id) => m.set(id, BADGE_RAINBOW));
    } else {
      ids.forEach((id, i) => m.set(id, BADGE_PALETTE[i % BADGE_PALETTE.length]));
    }
    return m;
  }, [effects]);

  const rangeCount = Math.max(0, (parseInt(bulkEnd, 10) || 0) - (parseInt(bulkStart, 10) || 0) + 1) || 0;

  if (!poolId) return null;

  return (
    <div className="space-y-6">
      {/* ─── 排出順マッピング Table ─── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">この端末の演出</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                「一括設定」で演出のまとめ設定（1種類 / 複数ランダム / OFF）ができます。
                下の表で 1 番ずつ個別に設定することもできます。
              </p>
              {/* ★S197: 次に出る排出順を明示。ここがズレていると設定通りの演出が出ない。 */}
              {deviceId && drawCount !== null && (
                <p className="text-xs text-muted-foreground mt-1">
                  現在 {drawCount} 回排出済み → 次は{' '}
                  <span className="font-medium text-foreground">{drawCount + 1} 番</span> の演出が出ます
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {deviceId && drawCount !== null && (
                <Button onClick={() => setResetDialogOpen(true)} variant="outline" disabled={resetting}>
                  {resetting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-1" />
                  )}
                  カウンタをリセット
                </Button>
              )}
              <Button onClick={openBulkDialog}>
                <Shuffle className="h-4 w-4 mr-1" />
                一括設定
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {stats.total > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="outline">
                設定済み {stats.total} / {MAX_DRAW_ORDER}
              </Badge>
            </div>
          )}

          {error && (
            <div className="mb-3 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">{error}</div>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
                ×
              </button>
            </div>
          )}
          {successMsg && (
            <div className="mb-3 p-3 rounded bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {successMsg}
            </div>
          )}

          <div className="border rounded-md max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left w-16">排出順</th>
                  <th className="px-3 py-2 text-left">演出</th>
                  <th className="px-3 py-2 text-right w-24">操作</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: MAX_DRAW_ORDER }, (_, i) => i + 1).map((order) => {
                  const effect = effectsByOrder.get(order);
                  const pack = packForEffect(effect);
                  const isUnset = !effect;
                  return (
                    <tr
                      key={order}
                      className={`border-t ${isUnset ? 'bg-muted/10 text-muted-foreground' : ''}`}
                    >
                      <td className="px-3 py-1.5 font-mono">{order}</td>
                      <td className="px-3 py-1.5">
                        {pack ? (
                          <Badge variant="outline" className={packColor.get(pack.id)}>
                            {pack.name}
                          </Badge>
                        ) : (
                          <span className="text-xs italic">(未設定)</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Button
                          size="sm"
                          variant={isUnset ? 'outline' : 'ghost'}
                          onClick={() => openEditDialog(order, effect)}
                        >
                          {isUnset ? (
                            <>
                              <Plus className="h-3 w-3" />
                              <span className="ml-1 text-xs">追加</span>
                            </>
                          ) : (
                            <>
                              <Pencil className="h-3 w-3" />
                              <span className="ml-1 text-xs">編集</span>
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ─── 編集ダイアログ ─── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>排出順 {editDrawOrder} 番のマッピング</DialogTitle>
            <DialogDescription>
              この排出順 (球番号) が出た時に再生される演出を設定します。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>演出パック</Label>
              <Select value={editEffectPackId} onValueChange={setEditEffectPackId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mp4Packs.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>賞金額 (任意、円)</Label>
              <Input
                type="number"
                value={editPrizeValue}
                onChange={(e) => setEditPrizeValue(e.target.value)}
                placeholder="例: 5000"
              />
            </div>
          </div>
          <DialogFooter>
            {editDrawOrder !== null && effectsByOrder.has(editDrawOrder) && (
              <Button variant="destructive" onClick={handleEditDelete} disabled={editSaving}>
                <Trash2 className="h-4 w-4 mr-1" />
                削除
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={editSaving}>
              キャンセル
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-2">保存</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── ★S197: 排出順カウンタ リセット確認ダイアログ ─── */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>排出順カウンタをリセット</DialogTitle>
            <DialogDescription>
              排出順カウンタを 0 に戻します。次の排出から 1 番目の演出になります。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              現在 <span className="font-medium">{drawCount ?? 0}</span> 回排出済みです。
              リセット後、次の排出は <span className="font-medium">1 番</span> になります。
            </p>
            <p className="text-muted-foreground">
              在庫（残数・総数）は変更されません。演出の順番だけを戻します。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={() => void handleResetDrawCount()} disabled={resetting}>
              {resetting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              リセットする
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 一括設定ダイアログ（単一 / 複数ランダム / OFF）─── */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>演出の一括設定</DialogTitle>
            <DialogDescription>
              演出のまとめ設定を行います。個別の1番ずつ設定は表側の「編集」から行えます。
            </DialogDescription>
          </DialogHeader>

          {/* モード選択 */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setBulkMode('single')}
              className={`rounded-md border p-2 text-xs text-center ${
                bulkMode === 'single' ? 'border-primary bg-primary/10 font-medium' : 'border-muted'
              }`}
            >
              <Save className="h-4 w-4 mx-auto mb-1" />
              1種類を割当
            </button>
            <button
              type="button"
              onClick={() => setBulkMode('random')}
              className={`rounded-md border p-2 text-xs text-center ${
                bulkMode === 'random' ? 'border-primary bg-primary/10 font-medium' : 'border-muted'
              }`}
            >
              <Shuffle className="h-4 w-4 mx-auto mb-1" />
              複数からランダム
            </button>
            <button
              type="button"
              onClick={() => setBulkMode('off')}
              className={`rounded-md border p-2 text-xs text-center ${
                bulkMode === 'off' ? 'border-primary bg-primary/10 font-medium' : 'border-muted'
              }`}
            >
              <PowerOff className="h-4 w-4 mx-auto mb-1" />
              演出OFF
            </button>
          </div>

          {bulkMode === 'off' ? (
            <div className="space-y-2 text-sm">
              <p>この端末の当選演出を <strong>OFF</strong> にします（演出を流しません）。</p>
              <p className="text-muted-foreground">
                番組の再生・売上の記録は継続します。マッピング設定は保持され、あとで「1種類 / 複数からランダム」で
                いつでも再開できます。
              </p>
              {!deviceId && (
                <p className="text-red-600">※ この画面では OFF は使えません（端末詳細の演出タブから設定してください）。</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>開始 (1〜{MAX_DRAW_ORDER})</Label>
                  <Input
                    type="number"
                    min={1}
                    max={MAX_DRAW_ORDER}
                    value={bulkStart}
                    onChange={(e) => setBulkStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label>終了 (1〜{MAX_DRAW_ORDER})</Label>
                  <Input
                    type="number"
                    min={1}
                    max={MAX_DRAW_ORDER}
                    value={bulkEnd}
                    onChange={(e) => setBulkEnd(e.target.value)}
                  />
                </div>
              </div>

              {bulkMode === 'single' ? (
                <div>
                  <Label>適用する演出</Label>
                  <Select value={bulkEffectPackId} onValueChange={setBulkEffectPackId}>
                    <SelectTrigger>
                      <SelectValue placeholder="演出を選択..." />
                    </SelectTrigger>
                    <SelectContent>
                      {mp4Packs.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>ランダムに流す演出（複数選択）</Label>
                  <div className="mt-1 border rounded-md max-h-52 overflow-y-auto divide-y">
                    {mp4Packs.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          checked={bulkPackIds.includes(p.id)}
                          onChange={() => toggleBulkPack(p.id)}
                        />
                        <Badge variant="outline">
                          {p.name}
                        </Badge>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    選択中 {bulkPackIds.length} 件 → {bulkStart}〜{bulkEnd} の各番号へランダムに割り当てます。
                  </p>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={bulkReplaceAll}
                  onChange={(e) => setBulkReplaceAll(e.target.checked)}
                />
                <span>この範囲以外の既存設定も消して総入れ替えする（全置換）</span>
              </label>
              <div className="text-xs text-muted-foreground">
                プレビュー: {bulkStart}〜{bulkEnd} の {rangeCount} 件に適用
                {bulkMode === 'random' ? '（ランダム割当）' : ''}
                {bulkReplaceAll && ' ／ ★範囲外の既存設定も削除'}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)} disabled={bulkSaving}>
              キャンセル
            </Button>
            <Button
              onClick={handleBulkSave}
              disabled={
                bulkSaving ||
                (bulkMode === 'single' && !bulkEffectPackId) ||
                (bulkMode === 'random' && bulkPackIds.length < 1) ||
                (bulkMode === 'off' && !deviceId)
              }
              variant={bulkMode === 'off' ? 'destructive' : 'default'}
            >
              {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-2">{bulkMode === 'off' ? 'OFFにする' : '適用'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
