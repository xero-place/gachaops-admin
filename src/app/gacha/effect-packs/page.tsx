'use client';

/**
 * /gacha/effect-packs — 演出パック管理ページ (Phase G-3+5-E #3, Session 41 / R3)
 *
 * 顧客 admin (lv2_admin 以上) が、演出パックの:
 *   - 一覧表示 (組み込み 5 種 normal/bronze/silver/gold/rainbow + 自社パック)
 *   - 演出秒数 (duration_ms) の変更 ← R3 の主目的
 *   - 名称・説明・BGM URL・有効/無効の編集
 *
 * バックエンド API (Session 41 で追加、すべて lv2_admin 以上必須):
 *   - GET /v1/gacha/effect-packs            (一覧: 自社パック + builtin)
 *   - PUT /v1/gacha/effect-packs/{pack_id}  (部分更新)
 *
 * 権限の注意:
 *   - builtin パック (is_builtin=true) は lv1_super のみ編集可。
 *     lv2_admin が builtin を編集しようとするとサーバが 403 を返す。
 *   - 演出パックの新規作成 (POST) / 削除 (DELETE) は R1 の領分 → Session 42 以降。
 *
 * 雛形: /gacha/draw-effects/page.tsx (Session 39) と同一の作法・スタイル。
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
import type { GachaEffectPack } from '@/types/domain';
import {
  Sparkles,
  Loader2,
  Pencil,
  RefreshCw,
  AlertCircle,
  Save,
  CheckCircle2,
  Lock,
} from 'lucide-react';

/** duration_ms の許容範囲 (バックエンド EffectPackUpdate と一致させること) */
const DURATION_MS_MIN = 500;
const DURATION_MS_MAX = 60000;

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
  const [editDurationMs, setEditDurationMs] = useState<string>('');
  const [editBgmUrl, setEditBgmUrl] = useState<string>('');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editSaving, setEditSaving] = useState(false);

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

  // ─── この演出パックを編集できるか (builtin は lv1_super のみ) ───
  const canEdit = useCallback(
    (pack: GachaEffectPack) => isSuperAdmin || !pack.is_builtin,
    [isSuperAdmin],
  );

  // ─── 編集ダイアログを開く ───
  const openEditDialog = (pack: GachaEffectPack) => {
    setEditPackId(pack.id);
    setEditName(pack.name);
    setEditDescription(pack.description ?? '');
    setEditDurationMs(pack.duration_ms.toString());
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

    // duration_ms バリデーション (サーバ側 Field(ge/le) と一致)
    const durationMs = parseInt(editDurationMs, 10);
    if (isNaN(durationMs) || durationMs < DURATION_MS_MIN || durationMs > DURATION_MS_MAX) {
      setError(
        `演出秒数は ${DURATION_MS_MIN}〜${DURATION_MS_MAX} ミリ秒 (${DURATION_MS_MIN / 1000}〜${
          DURATION_MS_MAX / 1000
        } 秒) の範囲で指定してください`,
      );
      return;
    }
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
        if (durationMs !== editingPack.duration_ms) body.duration_ms = durationMs;
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
              <Button onClick={reloadPacks} disabled={loading} variant="outline">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">再読み込み</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              ガチャ抽選時に再生される演出パックです。演出秒数 (duration_ms)
              や名称をここで変更できます。
              {!isSuperAdmin && (
                <span className="block mt-1">
                  組み込み演出 (ロックアイコン) は変更できません。自社で追加した演出のみ編集可能です。
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
                    <th className="px-3 py-2 text-right w-28">演出秒数</th>
                    <th className="px-3 py-2 text-left">説明</th>
                    <th className="px-3 py-2 text-center w-20">状態</th>
                    <th className="px-3 py-2 text-right w-24">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {packs.length === 0 && !loading && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-6 text-center text-muted-foreground"
                      >
                        演出パックがありません
                      </td>
                    </tr>
                  )}
                  {packs.map((pack) => {
                    const editable = canEdit(pack);
                    return (
                      <tr key={pack.id} className="border-t">
                        <td className="px-3 py-2">
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
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {pack.id}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {TIER_LABEL[pack.tier] ?? `tier ${pack.tier}`}
                        </td>
                        <td className="px-3 py-2 text-xs">{pack.effect_type}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {pack.duration_ms.toLocaleString()} ms
                          <div className="text-[10px] text-muted-foreground">
                            {(pack.duration_ms / 1000).toFixed(1)} 秒
                          </div>
                        </td>
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
                        <td className="px-3 py-2 text-right">
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
              <Label>演出秒数 (ミリ秒)</Label>
              <Input
                type="number"
                min={DURATION_MS_MIN}
                max={DURATION_MS_MAX}
                step={500}
                value={editDurationMs}
                onChange={(e) => setEditDurationMs(e.target.value)}
                placeholder="例: 8000"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {DURATION_MS_MIN}〜{DURATION_MS_MAX} ミリ秒 (
                {DURATION_MS_MIN / 1000}〜{DURATION_MS_MAX / 1000} 秒) の範囲。
                {editDurationMs &&
                  !isNaN(parseInt(editDurationMs, 10)) &&
                  ` 現在: ${(parseInt(editDurationMs, 10) / 1000).toFixed(1)} 秒`}
              </p>
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
    </AppShell>
  );
}
