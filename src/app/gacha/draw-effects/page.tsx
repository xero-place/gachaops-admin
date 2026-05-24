'use client';

/**
 * /gacha/draw-effects — ガチャ演出マッピング管理ページ (Phase G-3+5-E #2, Session 39)
 *
 * 顧客 admin (lv2_admin 以上) が、プール単位で:
 *   - 排出順 1〜100 番に演出パックを割り当て (R4/R5)
 *   - 個別編集 (例: 87 番だけ rainbow に変更)
 *   - 一括設定 (例: 1〜50 番を normal、51〜80 番を silver)
 *   - L1 デフォルト演出を設定 (マッピング未設定時のフォールバック)
 *
 * バックエンド API (Session 39 で追加、すべて lv2_admin 以上必須):
 *   - GET    /v1/gacha/pools                                        (プール一覧)
 *   - GET    /v1/gacha/pools/{pool_id}/draw-order-effects           (マッピング一覧)
 *   - POST   /v1/gacha/pools/{pool_id}/draw-order-effects           (1 件追加)
 *   - PUT    /v1/gacha/pools/{pool_id}/draw-order-effects/bulk      (一括 upsert)
 *   - PUT    /v1/gacha/pools/{pool_id}/draw-order-effects/{order}   (1 件更新)
 *   - DELETE /v1/gacha/pools/{pool_id}/draw-order-effects/{order}   (1 件削除)
 *   - PUT    /v1/gacha/pools/{pool_id}/default-effect               (L1 設定)
 *
 * 注意: 演出パック CRUD (R1/R2/R3) と mp4 アップロードは Session 40+ で別途実装。
 *       現状は組み込み 5 種 (normal/bronze/silver/gold/rainbow) のみ選択可能。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '@/components/layout/app-shell';
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
  Sparkles,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  AlertCircle,
  Save,
  CheckCircle2,
} from 'lucide-react';

interface ListResponse<T> {
  items?: T[];
  data?: T[];
  total?: number;
}

const MAX_DRAW_ORDER = 100;

/** tier (1-5) → 色テーマ */
const TIER_COLOR: Record<number, string> = {
  1: 'bg-slate-100 text-slate-700 border-slate-300',
  2: 'bg-amber-100 text-amber-800 border-amber-300',
  3: 'bg-zinc-200 text-zinc-700 border-zinc-400',
  4: 'bg-yellow-100 text-yellow-800 border-yellow-400',
  5: 'bg-gradient-to-r from-pink-100 via-yellow-100 to-cyan-100 text-purple-800 border-purple-300',
};

/** tier 名 */
const TIER_LABEL: Record<number, string> = {
  1: 'ノーマル',
  2: 'ブロンズ',
  3: 'シルバー',
  4: 'ゴールド',
  5: 'レインボー',
};

export default function GachaDrawEffectsPage() {
  // ─── 状態 ───
  const [pools, setPools] = useState<GachaPool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string>('');
  const [packs, setPacks] = useState<GachaEffectPack[]>([]);
  const [effects, setEffects] = useState<GachaDrawOrderEffect[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ─── ダイアログ状態 ───
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDrawOrder, setEditDrawOrder] = useState<number | null>(null);
  const [editEffectPackId, setEditEffectPackId] = useState<string>('');
  const [editPrizeName, setEditPrizeName] = useState<string>('');
  const [editPrizeValue, setEditPrizeValue] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editSaving, setEditSaving] = useState(false);

  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkStart, setBulkStart] = useState<string>('1');
  const [bulkEnd, setBulkEnd] = useState<string>('100');
  const [bulkEffectPackId, setBulkEffectPackId] = useState<string>('');
  const [bulkReplaceAll, setBulkReplaceAll] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [defaultEffectSaving, setDefaultEffectSaving] = useState(false);
  const [pendingDefaultEffectId, setPendingDefaultEffectId] = useState<string>('');

  const selectedPool = useMemo(
    () => pools.find((p) => p.id === selectedPoolId) ?? null,
    [pools, selectedPoolId],
  );

  // ─── 初期ロード: pools + packs ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const poolsRes = await api.get<ListResponse<GachaPool> | GachaPool[]>('/gacha/pools');
        const poolList = Array.isArray(poolsRes) ? poolsRes : poolsRes.items ?? poolsRes.data ?? [];
        if (cancelled) return;
        setPools(poolList);
        if (poolList.length > 0 && !selectedPoolId) {
          setSelectedPoolId(poolList[0].id);
        }
      } catch (e) {
        if (!cancelled) {
          setError(`プール取得失敗: ${(e as Error).message}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 演出パック一覧取得 (Session 51: API 取得に変更) ───
  // 旧実装は組み込み 5 種をハードコードしていたが、/gacha/effect-packs
  // エンドポイントが実装済みのため API 取得に置き換え。これで自社 mp4
  // 演出パックも L1・排出順マッピングのドロップダウンに表示される。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<ListResponse<GachaEffectPack> | GachaEffectPack[]>(
          '/gacha/effect-packs',
        );
        const list = Array.isArray(res) ? res : res.items ?? res.data ?? [];
        if (cancelled) return;
        setPacks([...list].sort((a, b) => a.tier - b.tier));
      } catch (e) {
        if (!cancelled) {
          setError(`演出パック取得失敗: ${(e as Error).message}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── マッピング一覧取得 (プール選択時に再取得) ───
  const reloadEffects = useCallback(async () => {
    if (!selectedPoolId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<GachaDrawOrderEffect[]>(
        `/gacha/pools/${selectedPoolId}/draw-order-effects`,
      );
      setEffects(data);
    } catch (e) {
      const msg = e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`マッピング取得失敗: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [selectedPoolId]);

  useEffect(() => {
    void reloadEffects();
  }, [reloadEffects]);

  // ─── プール選択時の default_effect_pack_id を pending に反映 ───
  useEffect(() => {
    setPendingDefaultEffectId(selectedPool?.default_effect_pack_id ?? '');
  }, [selectedPool]);

  // ─── マッピング Map (draw_order → effect) ───
  const effectsByOrder = useMemo(() => {
    const map = new Map<number, GachaDrawOrderEffect>();
    effects.forEach((e) => map.set(e.draw_order, e));
    return map;
  }, [effects]);

  // ─── 編集ダイアログを開く ───
  const openEditDialog = (drawOrder: number, existing: GachaDrawOrderEffect | undefined) => {
    setEditDrawOrder(drawOrder);
    setEditEffectPackId(existing?.effect_pack_id ?? 'gep_builtin_normal');
    setEditPrizeName(existing?.prize_name ?? '');
    setEditPrizeValue(existing?.prize_value?.toString() ?? '');
    setEditNotes(existing?.notes ?? '');
    setEditDialogOpen(true);
  };

  // ─── 編集ダイアログ: 保存 ───
  const handleEditSave = async () => {
    if (editDrawOrder === null || !selectedPoolId) return;
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
        // 既存あり → PUT 個別更新
        await api.put(
          `/gacha/pools/${selectedPoolId}/draw-order-effects/${editDrawOrder}`,
          body,
        );
        setSuccessMsg(`排出順 ${editDrawOrder} 番を更新しました`);
      } else {
        // 既存なし → POST 新規追加
        await api.post(`/gacha/pools/${selectedPoolId}/draw-order-effects`, {
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

  // ─── 編集ダイアログ: 削除 ───
  const handleEditDelete = async () => {
    if (editDrawOrder === null || !selectedPoolId) return;
    if (!confirm(`排出順 ${editDrawOrder} 番のマッピングを削除しますか?`)) return;
    setEditSaving(true);
    setError(null);
    try {
      await api.delete(`/gacha/pools/${selectedPoolId}/draw-order-effects/${editDrawOrder}`);
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

  // ─── 一括設定ダイアログ: 保存 ───
  const handleBulkSave = async () => {
    if (!selectedPoolId) return;
    const start = parseInt(bulkStart, 10);
    const end = parseInt(bulkEnd, 10);
    if (isNaN(start) || isNaN(end) || start < 1 || end > MAX_DRAW_ORDER || start > end) {
      setError(`不正な範囲指定: ${start}〜${end} (1〜${MAX_DRAW_ORDER} の昇順で指定してください)`);
      return;
    }
    if (!bulkEffectPackId) {
      setError('演出パックを選択してください');
      return;
    }
    setBulkSaving(true);
    setError(null);
    try {
      const items: GachaDrawOrderEffectBulkItem[] = [];
      for (let i = start; i <= end; i++) {
        items.push({ draw_order: i, effect_pack_id: bulkEffectPackId });
      }
      const res = await api.put<GachaDrawOrderEffectBulkResult>(
        `/gacha/pools/${selectedPoolId}/draw-order-effects/bulk`,
        { items, replace_all: bulkReplaceAll },
      );
      setSuccessMsg(
        `一括設定完了: ${res.inserted} 件追加 / ${res.updated} 件更新 / ${res.deleted} 件削除 (合計 ${res.total_after} 件)`,
      );
      setBulkDialogOpen(false);
      await reloadEffects();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (e) {
      const msg = e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`一括設定失敗: ${msg}`);
    } finally {
      setBulkSaving(false);
    }
  };

  // ─── L1 デフォルト演出変更 ───
  const handleDefaultEffectSave = async () => {
    if (!selectedPoolId) return;
    setDefaultEffectSaving(true);
    setError(null);
    try {
      const updated = await api.put<GachaPool>(
        `/gacha/pools/${selectedPoolId}/default-effect`,
        {
          default_effect_pack_id: pendingDefaultEffectId || null,
        },
      );
      setPools((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSuccessMsg(
        `デフォルト演出を${updated.default_effect_pack_id ? '更新' : '未設定に'}しました`,
      );
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      const msg = e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`デフォルト演出更新失敗: ${msg}`);
    } finally {
      setDefaultEffectSaving(false);
    }
  };

  // ─── 演出パック ID → パック情報 ───
  const packById = useMemo(() => {
    const map = new Map<string, GachaEffectPack>();
    packs.forEach((p) => map.set(p.id, p));
    return map;
  }, [packs]);

  const packForEffect = (effect: GachaDrawOrderEffect | undefined) =>
    effect ? packById.get(effect.effect_pack_id) : undefined;

  // ─── 統計 ───
  const stats = useMemo(() => {
    const total = effects.length;
    const tierCount = [0, 0, 0, 0, 0, 0]; // index = tier
    effects.forEach((e) => {
      const pack = packById.get(e.effect_pack_id);
      if (pack) tierCount[pack.tier]++;
    });
    return { total, tierCount };
  }, [effects, packById]);

  return (
    <AppShell title="ガチャ演出管理" breadcrumb={['ガチャ', '排出順 → 演出マッピング']}>
      <div className="space-y-6">
        {/* ─── プール選択 + 統計 ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              抽選プール選択
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-md">
                <Label className="text-xs text-muted-foreground">プール</Label>
                <Select value={selectedPoolId} onValueChange={setSelectedPoolId}>
                  <SelectTrigger>
                    <SelectValue placeholder="プールを選択..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pools.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={reloadEffects} disabled={loading || !selectedPoolId} variant="outline">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2">再読み込み</span>
              </Button>
            </div>

            {selectedPool && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">顧客 ID</div>
                  <div className="font-mono">{selectedPool.customer_id}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">最大球数</div>
                  <div>{selectedPool.max_ball_number}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">価格 / 抽選</div>
                  <div>¥{selectedPool.price_per_draw}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">設定済み</div>
                  <div>
                    <span className="font-semibold">{stats.total}</span>
                    <span className="text-muted-foreground"> / {MAX_DRAW_ORDER}</span>
                  </div>
                </div>
              </div>
            )}

            {/* tier 別集計 */}
            {stats.total > 0 && (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((t) =>
                  stats.tierCount[t] > 0 ? (
                    <Badge key={t} variant="outline" className={TIER_COLOR[t]}>
                      {TIER_LABEL[t]}: {stats.tierCount[t]}
                    </Badge>
                  ) : null,
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── L1 デフォルト演出設定 ─── */}
        {selectedPool && (
          <Card>
            <CardHeader>
              <CardTitle>デフォルト演出 (L1)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                マッピングが未設定の排出順に適用される演出です。null (未設定) の場合は内部フォールバック (gep_builtin_normal) が使われます。
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 max-w-md">
                  <Select
                    value={pendingDefaultEffectId || '__none__'}
                    onValueChange={(v) => setPendingDefaultEffectId(v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="デフォルト演出を選択..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">(未設定 = フォールバック)</SelectItem>
                      {packs.filter((p) => p.effect_type !== 'html5').map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleDefaultEffectSave}
                  disabled={
                    defaultEffectSaving ||
                    pendingDefaultEffectId === (selectedPool.default_effect_pack_id ?? '')
                  }
                >
                  {defaultEffectSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span className="ml-2">保存</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── 排出順マッピング Table ─── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>排出順 → 演出マッピング (1〜{MAX_DRAW_ORDER} 番)</CardTitle>
              <Button onClick={() => setBulkDialogOpen(true)} variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                一括設定
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* エラー/成功メッセージ */}
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

            {/* テーブル */}
            <div className="border rounded-md max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left w-16">排出順</th>
                    <th className="px-3 py-2 text-left">演出</th>
                    <th className="px-3 py-2 text-left">景品名</th>
                    <th className="px-3 py-2 text-left w-32">メモ</th>
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
                            <Badge variant="outline" className={TIER_COLOR[pack.tier]}>
                              {pack.name}
                            </Badge>
                          ) : (
                            <span className="text-xs italic">(未設定)</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">{effect?.prize_name ?? '-'}</td>
                        <td className="px-3 py-1.5 text-xs truncate max-w-[150px]" title={effect?.notes ?? ''}>
                          {effect?.notes ?? '-'}
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
      </div>

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
                  {packs.filter((p) => p.effect_type !== 'html5').map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>景品名 (任意)</Label>
              <Input
                value={editPrizeName}
                onChange={(e) => setEditPrizeName(e.target.value)}
                placeholder="例: 1 等"
              />
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
            <div>
              <Label>メモ (任意)</Label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="例: 春のキャンペーン"
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

      {/* ─── 一括設定ダイアログ ─── */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>一括設定</DialogTitle>
            <DialogDescription>
              範囲指定で複数の排出順に同じ演出パックを割り当てます。
            </DialogDescription>
          </DialogHeader>
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
            <div>
              <Label>適用する演出パック</Label>
              <Select value={bulkEffectPackId} onValueChange={setBulkEffectPackId}>
                <SelectTrigger>
                  <SelectValue placeholder="演出パックを選択..." />
                </SelectTrigger>
                <SelectContent>
                  {packs.filter((p) => p.effect_type !== 'html5').map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={bulkReplaceAll}
                onChange={(e) => setBulkReplaceAll(e.target.checked)}
              />
              <span>
                <strong>replace_all</strong>: チェックすると、このプールの全マッピングを削除してから再投入
              </span>
            </label>
            <div className="text-xs text-muted-foreground">
              プレビュー: {bulkStart}〜{bulkEnd} の{' '}
              {Math.max(0, parseInt(bulkEnd, 10) - parseInt(bulkStart, 10) + 1) || 0} 件に適用
              {bulkReplaceAll && ' (★ 既存全削除付き)'}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)} disabled={bulkSaving}>
              キャンセル
            </Button>
            <Button onClick={handleBulkSave} disabled={bulkSaving || !bulkEffectPackId}>
              {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-2">適用</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
