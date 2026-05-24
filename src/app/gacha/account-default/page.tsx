'use client';

/**
 * /gacha/account-default — アカウント単位デフォルト演出 設定ページ (L2, Session 42)
 *
 * 顧客 admin (lv2_admin 以上) が、自社アカウント全体の「デフォルト演出パック」を
 * 設定する。ガチャ抽選時、演出の決定は以下の 4 段フォールバックで行われる:
 *
 *   1. draw_order 特例 (gacha_draw_order_effects)        ← 排出順マッピング
 *   2. L1: pool.default_effect_pack_id                   ← プール単位デフォルト
 *   3. L2: customer.default_effect_pack_id               ← ★ このページで設定 ★
 *   4. builtin の最小 tier (gep_builtin_normal)          ← 最終フォールバック
 *
 * このページで設定する L2 は、draw_order 特例も L1 も設定されていない抽選に
 * 適用される「アカウント全体の保険」にあたる。
 *
 * バックエンド API (Session 41 で追加、すべて lv2_admin 以上必須):
 *   - GET /v1/gacha/account/default-effect   → { customer_id, default_effect_pack_id }
 *   - PUT /v1/gacha/account/default-effect   body: { default_effect_pack_id: string|null }
 *   - GET /v1/gacha/effect-packs             → 選択肢となる演出パック一覧
 *
 * 注意:
 *   - 他顧客のパックを指定するとサーバが 403、存在しないパックは 404 を返す。
 *   - PUT は常に「操作者自身の customer_id」に対してのみ作用する (Session 41 RBAC)。
 *   - 「(未設定)」を選ぶと default_effect_pack_id = null となり、L2 をスキップして
 *     builtin フォールバックに落ちる。
 *
 * 雛形: /gacha/effect-packs/page.tsx (Session 41) と同一の作法・スタイル。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';
import type { GachaEffectPack } from '@/types/domain';
import {
  Sparkles,
  Loader2,
  RefreshCw,
  AlertCircle,
  Save,
  CheckCircle2,
  Layers,
} from 'lucide-react';

/** GET/PUT /v1/gacha/account/default-effect のレスポンス形 */
interface AccountDefaultEffect {
  customer_id: string;
  default_effect_pack_id: string | null;
}

/** tier (1-5) → 色テーマ (effect-packs ページと同一) */
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

/** 「(未設定)」を表す select の特別値 (空文字は使わない) */
const UNSET_VALUE = '__unset__';

export default function GachaAccountDefaultPage() {
  // ─── 状態 ───
  const [packs, setPacks] = useState<GachaEffectPack[]>([]);
  const [savedPackId, setSavedPackId] = useState<string | null>(null); // サーバ上の現在値
  const [selectedValue, setSelectedValue] = useState<string>(UNSET_VALUE); // select の選択中の値
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ─── 現在のユーザ情報 (表示用) ───
  const currentUser = useMemo(() => tokenStore.getUser(), []);

  // ─── 演出パック一覧 + 現在の L2 設定をまとめて取得 ───
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [packData, defaultData] = await Promise.all([
        api.get<GachaEffectPack[]>('/gacha/effect-packs'),
        api.get<AccountDefaultEffect>('/gacha/account/default-effect'),
      ]);
      const sorted = [...packData].sort((a, b) => a.tier - b.tier);
      setPacks(sorted);
      setSavedPackId(defaultData.default_effect_pack_id);
      setSelectedValue(defaultData.default_effect_pack_id ?? UNSET_VALUE);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`設定の読み込みに失敗しました: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ─── 選択中のパック (プレビュー表示用) ───
  const selectedPack = useMemo(
    () => (selectedValue === UNSET_VALUE ? null : packs.find((p) => p.id === selectedValue) ?? null),
    [packs, selectedValue],
  );

  // ─── サーバ上の現在値に対応するパック ───
  const savedPack = useMemo(
    () => (savedPackId ? packs.find((p) => p.id === savedPackId) ?? null : null),
    [packs, savedPackId],
  );

  // ─── 変更があるか ───
  const isDirty = useMemo(() => {
    const current = savedPackId ?? UNSET_VALUE;
    return selectedValue !== current;
  }, [selectedValue, savedPackId]);

  // ─── 保存 ───
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const newId = selectedValue === UNSET_VALUE ? null : selectedValue;
      const updated = await api.put<AccountDefaultEffect>('/gacha/account/default-effect', {
        default_effect_pack_id: newId,
      });
      setSavedPackId(updated.default_effect_pack_id);
      setSelectedValue(updated.default_effect_pack_id ?? UNSET_VALUE);
      const label =
        updated.default_effect_pack_id === null
          ? 'デフォルト演出を「(未設定)」にしました'
          : `デフォルト演出を更新しました`;
      setSuccessMsg(label);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.problem.detail || e.problem.title : (e as Error).message;
      setError(`保存に失敗しました: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="アカウント デフォルト演出" breadcrumb={['ガチャ', 'デフォルト演出']}>
      <div className="space-y-6">
        {/* ─── 説明カード ─── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-500" />
                アカウント単位のデフォルト演出
              </CardTitle>
              <Button onClick={reload} disabled={loading} variant="outline">
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
              ガチャ抽選時に再生する演出は、次の優先順で決まります。ここで設定するのは
              <strong className="text-foreground"> 3 番目 (L2) </strong>
              にあたる「アカウント全体の保険」です。排出順マッピングもプール別デフォルトも
              設定されていない抽選に適用されます。
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 mb-2 list-decimal list-inside">
              <li>排出順マッピング (ガチャ演出ページで設定する 1〜100 番ごとの演出)</li>
              <li>プール単位のデフォルト演出</li>
              <li className="text-foreground font-medium">
                アカウント単位のデフォルト演出 ← このページ
              </li>
              <li>組み込み演出 (上記すべて未設定のときの最終フォールバック)</li>
            </ol>
            {currentUser && (
              <p className="text-[11px] text-muted-foreground">
                対象アカウント:{' '}
                <span className="font-mono">{currentUser.customer_id}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* ─── 設定カード ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-purple-500" />
              デフォルト演出の選択
            </CardTitle>
          </CardHeader>
          <CardContent>
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

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                読み込み中...
              </div>
            ) : (
              <div className="space-y-4">
                {/* 現在のサーバ上の設定 */}
                <div className="text-sm">
                  <span className="text-muted-foreground">現在の設定: </span>
                  {savedPackId === null ? (
                    <Badge variant="outline" className="bg-slate-100 text-slate-500">
                      (未設定 — 組み込み演出にフォールバック)
                    </Badge>
                  ) : savedPack ? (
                    <Badge variant="outline" className={TIER_COLOR[savedPack.tier]}>
                      {savedPack.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                      不明なパック ({savedPackId})
                    </Badge>
                  )}
                </div>

                {/* select */}
                <div>
                  <label
                    htmlFor="default-effect-select"
                    className="block text-sm font-medium mb-1"
                  >
                    デフォルト演出パック
                  </label>
                  <select
                    id="default-effect-select"
                    value={selectedValue}
                    onChange={(e) => setSelectedValue(e.target.value)}
                    disabled={saving}
                    className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={UNSET_VALUE}>(未設定 — 組み込み演出にフォールバック)</option>
                    {packs.filter((pack) => pack.effect_type !== 'html5').map((pack) => (
                      <option key={pack.id} value={pack.id}>
                        {pack.name} ({TIER_LABEL[pack.tier] ?? `tier ${pack.tier}`}
                        {pack.is_active ? '' : '・無効'})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    「(未設定)」を選ぶと L2 をスキップし、組み込み演出が使われます。
                  </p>
                </div>

                {/* 選択中パックのプレビュー */}
                {selectedPack && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={TIER_COLOR[selectedPack.tier]}>
                        {selectedPack.name}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {TIER_LABEL[selectedPack.tier] ?? `tier ${selectedPack.tier}`} ·{' '}
                        {selectedPack.effect_type}
                      </span>
                      {!selectedPack.is_active && (
                        <Badge variant="outline" className="bg-slate-100 text-slate-500">
                          無効
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedPack.description ?? '(説明なし)'}
                    </div>
                    {!selectedPack.is_active && (
                      <div className="mt-2 text-xs text-amber-700 flex items-start gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        この演出は現在「無効」です。無効な演出をデフォルトに設定すると、
                        抽選時に組み込み演出へフォールバックする場合があります。
                      </div>
                    )}
                  </div>
                )}

                {/* 保存ボタン */}
                <div className="flex items-center gap-3 pt-1">
                  <Button onClick={handleSave} disabled={saving || !isDirty}>
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span className="ml-2">保存</span>
                  </Button>
                  {isDirty && !saving && (
                    <span className="text-xs text-amber-600">未保存の変更があります</span>
                  )}
                  {!isDirty && !saving && (
                    <span className="text-xs text-muted-foreground">変更はありません</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
