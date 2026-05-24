'use client';

/**
 * /gacha/effect-packs — 演出パック管理ページ (Phase G-3+5-E #3)
 *
 * 顧客 admin (lv2_admin 以上) が、演出パックの:
 *   - 一覧表示 (組み込み 5 種 normal/bronze/silver/gold/rainbow + 自社パック)
 *   - 演出秒数 (duration_ms) の変更                          ← R3 (Session 41)
 *   - 名称・説明・BGM URL・有効/無効の編集                    ← R3 (Session 41)
 *   - 演出パックの新規作成                                    ← R1 (Session 42)
 *   - 演出パックの削除 (参照中は確認の上 force 削除)           ← R1 (Session 42)
 *
 * バックエンド API (すべて lv2_admin 以上必須):
 *   - GET    /v1/gacha/effect-packs            (一覧: 自社パック + builtin)
 *   - POST   /v1/gacha/effect-packs            (新規作成, Session 42)
 *   - PUT    /v1/gacha/effect-packs/{pack_id}  (部分更新)
 *   - DELETE /v1/gacha/effect-packs/{pack_id}  (削除, ?force=true, Session 42)
 *
 * 権限の注意:
 *   - builtin パック (is_builtin=true) は lv1_super のみ編集可・削除不可。
 *     lv2_admin が builtin を編集しようとするとサーバが 403 を返す。
 *   - 新規作成されるパックは常に is_builtin=false、customer_id=自顧客。
 *
 * 削除の注意 (R1):
 *   演出パックを削除すると、それを参照する排出順マッピング
 *   (gacha_draw_order_effects) は DB の FK=CASCADE で連鎖削除される。
 *   サーバは削除前に参照を集計し、参照があれば blocked=true を返す。
 *   その場合 UI は件数を明示し、ユーザが了承したときのみ ?force=true で
 *   再度削除を呼ぶ。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';
import type { GachaEffectPack, Asset } from '@/types/domain';
import {
  Sparkles,
  Loader2,
  Pencil,
  RefreshCw,
  AlertCircle,
  Save,
  CheckCircle2,
  Lock,
  Plus,
  Trash2,
} from 'lucide-react';

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

/** DELETE /effect-packs/{id} のレスポンス形 (バックエンド EffectPackDeleteResult) */
interface EffectPackDeleteResult {
  deleted: boolean;
  pack_id: string;
  blocked: boolean;
  draw_order_effect_refs: number;
  pool_refs: number;
  customer_refs: number;
  detail: string | null;
}

export default function GachaEffectPacksPage() {
  // ─── 状態 ───
  const [packs, setPacks] = useState<GachaEffectPack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ─── 編集ダイアログ状態 ───
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editPackId, setEditPackId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editBgmUrl, setEditBgmUrl] = useState<string>('');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editSaving, setEditSaving] = useState(false);

  // ─── 新規作成ダイアログ状態 (R1) ───
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createCode, setCreateCode] = useState<string>('');
  const [createName, setCreateName] = useState<string>('');
  const [createEffectType, setCreateEffectType] = useState<string>('mp4');
  const [createTier, setCreateTier] = useState<string>('1');
  const [createDescription, setCreateDescription] = useState<string>('');
  const [createBgmUrl, setCreateBgmUrl] = useState<string>('');
  const [createHtmlTemplate, setCreateHtmlTemplate] = useState<string>('');
  const [createAssetId, setCreateAssetId] = useState<string>('');
  const [createSaving, setCreateSaving] = useState(false);

  // ─── mp4 素材選択用の動画 asset 一覧 (R1残: asset_id ドロップダウン化) ───
  const [assets, setAssets] = useState<Asset[]>([]);

  // ─── 削除確認ダイアログ状態 (R1) ───
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GachaEffectPack | null>(null);
  const [deleteDeleting, setDeleteDeleting] = useState(false);
  // 参照集計でブロックされたときのみ値が入る (force 削除の確認に使う)
  const [deleteBlockedInfo, setDeleteBlockedInfo] =
    useState<EffectPackDeleteResult | null>(null);

  // ─── 現在のユーザロール (builtin 編集可否の判定に使用) ───
  const currentRole = useMemo(() => tokenStore.getUser()?.role ?? '', []);
  const isSuperAdmin = currentRole === 'lv1_super';

  // ─── 一覧取得 ───
  const reloadPacks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<GachaEffectPack[]>('/gacha/effect-packs');
      // tier 昇順で表示 (サーバも tier ASC だが念のため)
      const sorted = [...data].sort((a, b) => a.tier - b.tier);
      setPacks(sorted);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`演出パック取得失敗: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadPacks();
  }, [reloadPacks]);

  // ─── 動画 asset 一覧を取得 (R1残: asset 選択ドロップダウン用) ───
  // assets/page.tsx と同じく揺れたレスポンス形 (配列 / items / data) を正規化する。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<{ items?: Asset[]; data?: Asset[] } | Asset[]>(
          '/assets?limit=100',
        );
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : (res.items ?? res.data ?? []);
        if (Array.isArray(arr)) setAssets(arr as Asset[]);
      } catch {
        // asset 取得失敗時は空のまま。作成時の必須バリデーションで弾かれる。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── この演出パックを編集できるか (builtin は lv1_super のみ) ───
  const canEdit = useCallback(
    (pack: GachaEffectPack) => isSuperAdmin || !pack.is_builtin,
    [isSuperAdmin],
  );

  // ─── この演出パックを削除できるか (builtin は誰も削除不可) ───
  const canDelete = useCallback(
    (pack: GachaEffectPack) => !pack.is_builtin,
    [],
  );

  // ─── 編集ダイアログを開く ───
  const openEditDialog = (pack: GachaEffectPack) => {
    setEditPackId(pack.id);
    setEditName(pack.name);
    setEditDescription(pack.description ?? '');
    setEditBgmUrl(pack.bgm_url ?? '');
    setEditIsActive(pack.is_active);
    setEditDialogOpen(true);
  };

  // ─── 編集対象パック ───
  const editingPack = useMemo(
    () => packs.find((p) => p.id === editPackId) ?? null,
    [packs, editPackId],
  );

  // ─── 編集ダイアログ: 保存 ───
  const handleEditSave = async () => {
    if (!editPackId) return;

    if (!editName.trim()) {
      setError('演出名は必須です');
      return;
    }

    setEditSaving(true);
    setError(null);
    try {
      // 部分更新: 変更されたフィールドのみ送る
      const body: Record<string, unknown> = {};
      if (editingPack) {
        if (editName !== editingPack.name) body.name = editName;
        if (editDescription !== (editingPack.description ?? '')) {
          body.description = editDescription || null;
        }
        if (editBgmUrl !== (editingPack.bgm_url ?? '')) body.bgm_url = editBgmUrl || null;
        if (editIsActive !== editingPack.is_active) body.is_active = editIsActive;
      }

      if (Object.keys(body).length === 0) {
        setError('変更点がありません');
        setEditSaving(false);
        return;
      }

      const updated = await api.put<GachaEffectPack>(
        `/gacha/effect-packs/${editPackId}`,
        body,
      );
      setPacks((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSuccessMsg(`「${updated.name}」を更新しました`);
      setEditDialogOpen(false);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`保存失敗: ${msg}`);
    } finally {
      setEditSaving(false);
    }
  };

  // ─── 新規作成ダイアログを開く (R1) ───
  const openCreateDialog = () => {
    setCreateCode('');
    setCreateName('');
    setCreateEffectType('mp4');
    setCreateTier('1');
    setCreateDescription('');
    setCreateBgmUrl('');
    setCreateHtmlTemplate('');
    setCreateAssetId('');
    setCreateDialogOpen(true);
  };

  // ─── 新規作成ダイアログ: 保存 (R1) ───
  const handleCreateSave = async () => {
    // 入力バリデーション (サーバ側 EffectPackCreate と一致させる)
    if (!createCode.trim()) {
      setError('コード (code) は必須です');
      return;
    }
    if (!createName.trim()) {
      setError('演出名は必須です');
      return;
    }
    const tier = parseInt(createTier, 10);
    if (isNaN(tier) || tier < 1 || tier > 5) {
      setError('tier は 1〜5 で指定してください');
      return;
    }
    if (createEffectType === 'mp4' && !createAssetId.trim()) {
      setError('mp4 演出には素材 ID (asset_id) が必須です');
      return;
    }

    setCreateSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        code: createCode.trim(),
        name: createName.trim(),
        effect_type: createEffectType,
        tier,
      };
      if (createDescription.trim()) body.description = createDescription.trim();
      if (createBgmUrl.trim()) body.bgm_url = createBgmUrl.trim();
      if (createEffectType === 'html5' && createHtmlTemplate.trim()) {
        body.html_template = createHtmlTemplate.trim();
      }
      if (createEffectType === 'mp4') {
        body.asset_id = createAssetId.trim();
      }

      const created = await api.post<GachaEffectPack>('/gacha/effect-packs', body);
      // 一覧に追加して tier 順に並べ直す
      setPacks((prev) =>
        [...prev, created].sort((a, b) => a.tier - b.tier),
      );
      setSuccessMsg(`演出パック「${created.name}」を作成しました`);
      setCreateDialogOpen(false);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`作成失敗: ${msg}`);
    } finally {
      setCreateSaving(false);
    }
  };

  // ─── 削除確認ダイアログを開く (R1) ───
  const openDeleteDialog = (pack: GachaEffectPack) => {
    setDeleteTarget(pack);
    setDeleteBlockedInfo(null);
    setDeleteDialogOpen(true);
  };

  // ─── 削除実行 (R1)。force=false で呼び、参照があれば blocked 情報を保持。───
  const handleDelete = async (force: boolean) => {
    if (!deleteTarget) return;
    setDeleteDeleting(true);
    setError(null);
    try {
      const path = force
        ? `/gacha/effect-packs/${deleteTarget.id}?force=true`
        : `/gacha/effect-packs/${deleteTarget.id}`;
      const result = await api.delete<EffectPackDeleteResult>(path);

      if (result.blocked) {
        // 参照あり: 削除されていない。件数を表示して force 確認に切り替える。
        setDeleteBlockedInfo(result);
      } else if (result.deleted) {
        // 削除成功
        setPacks((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        setSuccessMsg(
          result.draw_order_effect_refs > 0
            ? `「${deleteTarget.name}」を削除しました (排出順マッピング ${result.draw_order_effect_refs} 件も削除)`
            : `「${deleteTarget.name}」を削除しました`,
        );
        setDeleteDialogOpen(false);
        setDeleteTarget(null);
        setDeleteBlockedInfo(null);
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`削除失敗: ${msg}`);
    } finally {
      setDeleteDeleting(false);
    }
  };

  return (
    <AppShell title="演出パック管理" breadcrumb={['ガチャ', '演出パック']}>
      <div className="space-y-6">
        {/* ─── 概要カード ─── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                演出パック一覧
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button onClick={openCreateDialog} disabled={loading}>
                  <Plus className="h-4 w-4" />
                  <span className="ml-1">新規作成</span>
                </Button>
                <Button onClick={reloadPacks} disabled={loading} variant="outline">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span className="ml-2">再読み込み</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              ガチャ抽選時に再生される演出パックです。名称や説明をここで変更できます。
              {!isSuperAdmin && (
                <span className="block mt-1">
                  組み込み演出 (ロックアイコン) は変更・削除できません。自社で追加した演出のみ編集・削除可能です。
                </span>
              )}
            </p>

            {/* エラー/成功メッセージ */}
            {error && (
              <div className="mb-3 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1">{error}</div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-500 hover:text-red-700"
                >
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
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left">演出</th>
                    <th className="px-3 py-2 text-left w-24">tier</th>
                    <th className="px-3 py-2 text-left w-20">種別</th>
                    <th className="px-3 py-2 text-left">説明</th>
                    <th className="px-3 py-2 text-center w-20">状態</th>
                    <th className="px-3 py-2 text-right w-36">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {packs.length === 0 && !loading && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-6 text-center text-muted-foreground"
                      >
                        演出パックがありません
                      </td>
                    </tr>
                  )}
                  {packs.map((pack) => {
                    const editable = canEdit(pack);
                    const deletable = canDelete(pack);
                    return (
                      <tr key={pack.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-3">
                            {(() => {
                              const thumb = pack.asset_id
                                ? assets.find((a) => a.id === pack.asset_id)?.thumbnail_url
                                : null;
                              return thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={thumb}
                                  alt={pack.name}
                                  className="h-12 w-12 rounded object-cover border flex-shrink-0 bg-muted"
                                />
                              ) : (
                                <div className="h-12 w-12 rounded border flex items-center justify-center bg-muted flex-shrink-0">
                                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                                </div>
                              );
                            })()}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {pack.is_builtin && !isSuperAdmin && (
                                  <Lock
                                    className="h-3 w-3 text-muted-foreground flex-shrink-0"
                                    aria-label="組み込み演出 (編集不可)"
                                  />
                                )}
                                <Badge variant="outline" className={TIER_COLOR[pack.tier]}>
                                  {pack.name}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {TIER_LABEL[pack.tier] ?? `tier ${pack.tier}`}
                        </td>
                        <td className="px-3 py-2 text-xs">{pack.effect_type}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[200px]">
                          {pack.description ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {pack.is_active ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                              有効
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-slate-100 text-slate-500">
                              無効
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!editable}
                            onClick={() => openEditDialog(pack)}
                            title={
                              editable
                                ? '編集'
                                : '組み込み演出は編集できません (lv1_super のみ可)'
                            }
                          >
                            <Pencil className="h-3 w-3" />
                            <span className="ml-1 text-xs">編集</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!deletable}
                            onClick={() => openDeleteDialog(pack)}
                            title={
                              deletable
                                ? '削除'
                                : '組み込み演出は削除できません'
                            }
                            className={
                              deletable
                                ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                                : ''
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                            <span className="ml-1 text-xs">削除</span>
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
            <DialogTitle>演出パックの編集</DialogTitle>
            <DialogDescription>
              {editingPack
                ? `「${editingPack.name}」(${editingPack.id}) の設定を変更します。`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>演出名</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="例: ゴールド"
                maxLength={200}
              />
            </div>
            <div>
              <Label>説明 (任意)</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="例: 大当たり演出"
              />
            </div>
            <div>
              <Label>BGM URL (任意)</Label>
              <Input
                value={editBgmUrl}
                onChange={(e) => setEditBgmUrl(e.target.value)}
                placeholder="例: https://..."
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
              />
              <span>
                <strong>有効</strong>: チェックを外すとこの演出は抽選で使われなくなります
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={editSaving}
            >
              キャンセル
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span className="ml-2">保存</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 新規作成ダイアログ (R1) ─── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>演出パックの新規作成</DialogTitle>
            <DialogDescription>
              自社の演出パックを新しく追加します。組み込み演出は作成できません。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>コード (code) ※自社内で一意</Label>
              <Input
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value)}
                placeholder="例: my_custom_gold"
                maxLength={80}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                半角英数字推奨。同じコードが既にあると作成できません。
              </p>
            </div>
            <div>
              <Label>演出名</Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="例: 限定ゴールド演出"
                maxLength={200}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>種別</Label>
                {/* NEW S45-B: 演出は mp4 に一本化。html5 は新規作成不可。 */}
                <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                  mp4
                </div>
              </div>
              <div>
                <Label>tier (1-5)</Label>
                <select
                  value={createTier}
                  onChange={(e) => setCreateTier(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {[1, 2, 3, 4, 5].map((t) => (
                    <option key={t} value={t}>
                      {t} ({TIER_LABEL[t]})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>説明 (任意)</Label>
              <Input
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="例: 周年記念の特別演出"
              />
            </div>
            {/* NEW S45-B で mp4 一本化したため html5 用の HTML テンプレート欄は廃止。
                R1残: 素材 ID のテキスト入力を、動画 asset の選択ドロップダウンに変更。 */}
            <div>
              <Label>素材 (動画 asset) ※必須</Label>
              <select
                value={createAssetId}
                onChange={(e) => setCreateAssetId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— 動画素材を選択 —</option>
                {assets
                  .filter((a) => a.type === 'video')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                「素材」ページにアップロード済みの動画素材から選択してください。
              </p>
            </div>
            <div>
              <Label>BGM URL (任意)</Label>
              <Input
                value={createBgmUrl}
                onChange={(e) => setCreateBgmUrl(e.target.value)}
                placeholder="例: https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={createSaving}
            >
              キャンセル
            </Button>
            <Button onClick={handleCreateSave} disabled={createSaving}>
              {createSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="ml-2">作成</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 削除確認ダイアログ (R1) ─── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>演出パックの削除</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `「${deleteTarget.name}」(${deleteTarget.id}) を削除します。`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {deleteBlockedInfo ? (
            // ── 参照ありでブロックされた → force 確認 ──
            <div className="space-y-3">
              <div className="p-3 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium mb-1">この演出パックは使用中です。</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs">
                      <li>
                        排出順マッピング: {deleteBlockedInfo.draw_order_effect_refs} 件
                        {deleteBlockedInfo.draw_order_effect_refs > 0 && (
                          <span className="text-red-600 font-medium">
                            {' '}
                            ← 一緒に削除されます
                          </span>
                        )}
                      </li>
                      <li>
                        プールのデフォルト演出: {deleteBlockedInfo.pool_refs} 件
                        {deleteBlockedInfo.pool_refs > 0 && (
                          <span className="text-muted-foreground">
                            {' '}
                            (未設定に戻ります)
                          </span>
                        )}
                      </li>
                      <li>
                        アカウントのデフォルト演出: {deleteBlockedInfo.customer_refs} 件
                        {deleteBlockedInfo.customer_refs > 0 && (
                          <span className="text-muted-foreground">
                            {' '}
                            (未設定に戻ります)
                          </span>
                        )}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                強制削除すると、上記の排出順マッピングも一緒に削除されます。
                この操作は取り消せません。本当に削除しますか?
              </p>
            </div>
          ) : (
            // ── 通常の削除確認 ──
            <p className="text-sm text-muted-foreground">
              この演出パックを削除します。もしこの演出が排出順マッピングやデフォルト演出に
              使われている場合は、削除前に件数をお知らせします。
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteDeleting}
            >
              キャンセル
            </Button>
            {deleteBlockedInfo ? (
              <Button
                onClick={() => handleDelete(true)}
                disabled={deleteDeleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="ml-2">強制削除する</span>
              </Button>
            ) : (
              <Button
                onClick={() => handleDelete(false)}
                disabled={deleteDeleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="ml-2">削除</span>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
