'use client';

/**
 * /gacha/pools — 抽選プール管理ページ (Session 51)
 *
 * 顧客 admin (lv2_admin 以上) が、店舗・グループ別に演出を分けるための
 * 抽選プール (gacha_pools) を管理する。
 *
 *   - 一覧表示 (名前・説明・既定演出・受付決済・有効/無効)
 *   - プールの新規作成
 *   - プールの編集
 *   - プールの削除 (所属什器ありは確認の上 force 削除)
 *   - プールへの什器一括割り当て
 *
 * バックエンド API (すべて lv2_admin 以上必須, Session 51 で追加):
 *   - GET    /v1/gacha/pools                       (一覧: 自顧客)
 *   - POST   /v1/gacha/pools                       (新規作成)
 *   - PUT    /v1/gacha/pools/{pool_id}             (更新, Session 51)
 *   - DELETE /v1/gacha/pools/{pool_id}?force=true  (削除, Session 51)
 *   - PUT    /v1/gacha/pools/{pool_id}/machines    (什器一括割り当て, Session 51)
 *   - GET    /v1/gacha/effect-packs                (既定演出の選択肢用)
 *   - GET    /v1/devices                           (什器割り当て対象の端末一覧)
 *
 * 什器割り当ての注意:
 *   gacha_machines レコードは端末ごとに必ずあるとは限らない (Session 51 時点で
 *   101〜104 のみ)。PUT /pools/{id}/machines は machine が無い device を
 *   skipped で返すので、UI は「N 台割り当て / M 台スキップ」を明示する。
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
import type { GachaPool, GachaEffectPack, Device } from '@/types/domain';
import { usePageT } from '@/i18n/usePageT';
import { useT } from '@/i18n/useT';
import { gachaPoolsDict } from '@/i18n/ns/gachaPools';
import {
  Container,
  Loader2,
  Pencil,
  RefreshCw,
  AlertCircle,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
  Sparkles,
  Settings2,
} from 'lucide-react';

/** POST/PUT /gacha/pools に送るペイロード形 (バックエンド GachaPoolIn) */
interface GachaPoolPayload {
  name: string;
  description: string | null;
  default_effect_pack_id: string | null;
  max_ball_number: number;
  price_per_draw: number;
  accepted_payment_methods: string[];
  is_active: boolean;
  program_id: string | null;
}

/** DELETE /gacha/pools/{id} のレスポンス形 (バックエンド PoolDeleteResult) */
interface PoolDeleteResult {
  pool_id: string;
  deleted: boolean;
  detached_machines: number;
}

/** PUT /gacha/pools/{id}/machines のレスポンス形 (バックエンド PoolMachinesResult) */
interface PoolMachinesResult {
  pool_id: string;
  assigned: number;
  skipped: string[];
}

const PAYMENT_OPTIONS = ['coin', 'qr'] as const;

export default function GachaPoolsPage() {
  const t = usePageT(gachaPoolsDict);
  const { formatPrice, locale } = useT();
  const payLabel = (v: string) => (v === 'coin' ? t.paymentCoin : v === 'qr' ? t.paymentQr : v);
  // ─── 一覧の状態 ───
  const [pools, setPools] = useState<GachaPool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ─── 既定演出の選択肢 (演出パック一覧) ───
  const [packs, setPacks] = useState<GachaEffectPack[]>([]);

  // ─── 端末一覧 (什器割り当てモーダル用) ───
  const [devices, setDevices] = useState<Device[]>([]);

  // ─── 作成/編集ダイアログ状態 (作成と編集を 1 つのフォームで兼用) ───
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formPoolId, setFormPoolId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDefaultPackId, setFormDefaultPackId] = useState('');
  const [formMaxBall, setFormMaxBall] = useState('100');
  const [formPrice, setFormPrice] = useState('100');
  const [formPayments, setFormPayments] = useState<string[]>(['coin', 'qr']);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formSaving, setFormSaving] = useState(false);

  // ─── 削除確認ダイアログ状態 ───
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GachaPool | null>(null);
  const [deleteDeleting, setDeleteDeleting] = useState(false);

  // ─── 什器割り当てダイアログ状態 ───
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPool, setAssignPool] = useState<GachaPool | null>(null);
  const [assignSelected, setAssignSelected] = useState<string[]>([]);
  const [assignStoreFilter, setAssignStoreFilter] = useState<string>('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignResult, setAssignResult] = useState<PoolMachinesResult | null>(null);

  // ─── 一覧取得 ───
  const reloadPools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<GachaPool[]>('/gacha/pools');
      setPools([...data].sort((a, b) => a.name.localeCompare(b.name, 'ja')));
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.problem.detail || e.problem.title
          : (e as Error).message;
      setError(t.loadFailed(msg));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadPools();
  }, [reloadPools]);

  // ─── 演出パック一覧 (既定演出ドロップダウン用) ───
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<GachaEffectPack[]>('/gacha/effect-packs');
        if (!cancelled) setPacks([...data].sort((a, b) => a.tier - b.tier));
      } catch {
        // 取得失敗時は空のまま。既定演出は「未設定」のみ選べる。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── 端末一覧 (什器割り当てモーダル用) ───
  // assets と同じく揺れたレスポンス形 (配列 / items / data) を正規化する。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<{ items?: Device[]; data?: Device[] } | Device[]>(
          '/devices?limit=300',
        );
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : (res.items ?? res.data ?? []);
        if (Array.isArray(arr)) setDevices(arr as Device[]);
      } catch {
        // 端末取得失敗時は空のまま。割り当てモーダルで案内する。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── 演出パック id → 名前 ───
  const packName = useCallback(
    (id: string | null) => {
      if (!id) return null;
      return packs.find((p) => p.id === id)?.name ?? id;
    },
    [packs],
  );

  // ─── 端末一覧から店舗の選択肢を作る ───
  const storeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of devices) {
      if (d.store_id && !seen.has(d.store_id)) {
        seen.set(d.store_id, d.store_name || d.store_id);
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [devices]);

  // ─── 割り当てモーダルに出す端末 (店舗フィルタ適用後) ───
  const assignDevices = useMemo(() => {
    const list = assignStoreFilter
      ? devices.filter((d) => d.store_id === assignStoreFilter)
      : devices;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [devices, assignStoreFilter]);

  // ─── 成功メッセージを数秒で消す ───
  const flashSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    window.setTimeout(() => setSuccessMsg(null), 4000);
  }, []);

  // ─── 作成ダイアログを開く ───
  const openCreate = () => {
    setFormMode('create');
    setFormPoolId(null);
    setFormName('');
    setFormDescription('');
    setFormDefaultPackId('');
    setFormMaxBall('100');
    setFormPrice('100');
    setFormPayments(['coin', 'qr']);
    setFormIsActive(true);
    setFormOpen(true);
  };

  // ─── 編集ダイアログを開く ───
  const openEdit = (pool: GachaPool) => {
    setFormMode('edit');
    setFormPoolId(pool.id);
    setFormName(pool.name);
    setFormDescription(pool.description ?? '');
    setFormDefaultPackId(pool.default_effect_pack_id ?? '');
    setFormMaxBall(String(pool.max_ball_number));
    setFormPrice(String(pool.price_per_draw));
    setFormPayments(
      pool.accepted_payment_methods.length > 0
        ? [...pool.accepted_payment_methods]
        : [],
    );
    setFormIsActive(pool.is_active);
    setFormOpen(true);
  };

  // ─── 受付決済チェックボックスの切り替え ───
  const togglePayment = (value: string) => {
    setFormPayments((cur) =>
      cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
    );
  };

  // ─── 作成/編集の保存 ───
  const handleFormSave = async () => {
    if (!formName.trim()) {
      setError(t.enterName);
      return;
    }
    const maxBall = Number(formMaxBall);
    const price = Number(formPrice);
    if (!Number.isInteger(maxBall) || maxBall < 1) {
      setError(t.maxBallInvalid);
      return;
    }
    if (!Number.isInteger(price) || price < 0) {
      setError(t.priceInvalid);
      return;
    }

    const payload: GachaPoolPayload = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      default_effect_pack_id: formDefaultPackId || null,
      max_ball_number: maxBall,
      price_per_draw: price,
      accepted_payment_methods: formPayments,
      is_active: formIsActive,
      program_id: null,
    };

    setFormSaving(true);
    setError(null);
    try {
      if (formMode === 'create') {
        await api.post<GachaPool>('/gacha/pools', payload);
        flashSuccess(t.created(payload.name));
      } else if (formPoolId) {
        await api.put<GachaPool>(`/gacha/pools/${formPoolId}`, payload);
        flashSuccess(t.updated(payload.name));
      }
      setFormOpen(false);
      await reloadPools();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.problem.detail || e.problem.title
          : (e as Error).message;
      setError(t.saveFailed(msg));
    } finally {
      setFormSaving(false);
    }
  };

  // ─── 削除ダイアログを開く ───
  const openDelete = (pool: GachaPool) => {
    setDeleteTarget(pool);
    setDeleteOpen(true);
  };

  // ─── 削除実行 (force=true 固定: 所属什器があってもデタッチして削除) ───
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteDeleting(true);
    setError(null);
    try {
      const res = await api.delete<PoolDeleteResult>(
        `/gacha/pools/${deleteTarget.id}?force=true`,
      );
      const detached =
        res.detached_machines > 0
          ? t.detachedNote(res.detached_machines)
          : '';
      flashSuccess(t.deleted(deleteTarget.name, detached));
      setDeleteOpen(false);
      setDeleteTarget(null);
      await reloadPools();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.problem.detail || e.problem.title
          : (e as Error).message;
      setError(t.deleteFailed(msg));
    } finally {
      setDeleteDeleting(false);
    }
  };

  // ─── 什器割り当てダイアログを開く ───
  const openAssign = (pool: GachaPool) => {
    setAssignPool(pool);
    // 既にこのプールに所属している端末を初期チェック状態にする (Session 51)
    setAssignSelected(
      devices.filter((d) => d.pool_id === pool.id).map((d) => d.id),
    );
    setAssignStoreFilter('');
    setAssignResult(null);
    setAssignOpen(true);
  };

  // ─── 割り当て対象の端末選択トグル ───
  const toggleAssignDevice = (deviceId: string) => {
    setAssignSelected((cur) =>
      cur.includes(deviceId)
        ? cur.filter((v) => v !== deviceId)
        : [...cur, deviceId],
    );
  };

  // ─── 什器割り当て実行 ───
  const handleAssign = async () => {
    if (!assignPool || assignSelected.length === 0) return;
    setAssignSaving(true);
    setError(null);
    setAssignResult(null);
    try {
      const res = await api.put<PoolMachinesResult>(
        `/gacha/pools/${assignPool.id}/machines`,
        { device_ids: assignSelected },
      );
      setAssignResult(res);
      const skipNote =
        res.skipped.length > 0
          ? t.skipNote(res.skipped.length)
          : '';
      flashSuccess(t.assigned(assignPool.name, res.assigned, skipNote));
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.problem.detail || e.problem.title
          : (e as Error).message;
      setError(t.assignFailed(msg));
    } finally {
      setAssignSaving(false);
    }
  };

  return (
    <AppShell title={t.title} breadcrumb={[t.bcGacha, t.bcPools]}>
      <div className="space-y-6">
        {/* ─── ヘッダ ─── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Container className="h-6 w-6 text-indigo-600" />
              {t.poolsHeading}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.intro}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void reloadPools()}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
              {t.reload}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t.newPool}
            </Button>
          </div>
        </div>

        {/* ─── 通知 ─── */}
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ─── プール一覧 ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t.poolsListTitle(pools.length)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && pools.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t.loading}
              </div>
            ) : pools.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {t.noPools}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">{t.colName}</th>
                      <th className="px-3 py-2">{t.colDesc}</th>
                      <th className="px-3 py-2">{t.colDefaultEffect}</th>
                      <th className="px-3 py-2">{t.colPayment}</th>
                      <th className="px-3 py-2">{t.colPrice}</th>
                      <th className="px-3 py-2">{t.colStatus}</th>
                      <th className="px-3 py-2 text-right">{t.colAction}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pools.map((pool) => (
                      <tr
                        key={pool.id}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="px-3 py-3 font-medium text-foreground">
                          {pool.name}
                        </td>
                        <td className="max-w-xs px-3 py-3 text-muted-foreground">
                          {pool.description || '—'}
                        </td>
                        <td className="px-3 py-3 text-foreground">
                          {packName(pool.default_effect_pack_id) ? (
                            <span className="inline-flex items-center gap-1">
                              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                              {packName(pool.default_effect_pack_id)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{t.unset}</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {pool.accepted_payment_methods.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              pool.accepted_payment_methods.map((m) => (
                                <Badge key={m} variant="outline">
                                  {payLabel(m)}
                                </Badge>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-foreground">
                          {locale === 'en' ? formatPrice(pool.price_per_draw) : `${pool.price_per_draw} 円`}
                        </td>
                        <td className="px-3 py-3">
                          {pool.is_active ? (
                            <Badge className="bg-emerald-100 text-emerald-700">
                              {t.active}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              {t.inactive}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAssign(pool)}
                            >
                              <Settings2 className="mr-1 h-3.5 w-3.5" />
                              {t.assignMachines}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(pool)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openDelete(pool)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              {t.footerNote}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── 作成/編集ダイアログ ─── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {formMode === 'create' ? t.createTitle : t.editTitle}
            </DialogTitle>
            <DialogDescription>
              {t.formDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pool-name">{t.poolNameLabel}</Label>
              <Input
                id="pool-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t.poolNamePlaceholder}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pool-desc">{t.descLabel}</Label>
              <Input
                id="pool-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t.descPlaceholder}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pool-pack">{t.defaultEffectLabel}</Label>
              <select
                id="pool-pack"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={formDefaultPackId}
                onChange={(e) => setFormDefaultPackId(e.target.value)}
              >
                <option value="">{t.unset}</option>
                {packs.filter((p) => p.effect_type !== 'html5').map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pool-maxball">{t.maxBallLabel}</Label>
                <Input
                  id="pool-maxball"
                  type="number"
                  value={formMaxBall}
                  onChange={(e) => setFormMaxBall(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pool-price">{t.priceLabel}</Label>
                <Input
                  id="pool-price"
                  type="number"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t.paymentLabel}</Label>
              <div className="flex gap-4">
                {PAYMENT_OPTIONS.map((opt) => (
                  <label
                    key={opt}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={formPayments.includes(opt)}
                      onChange={() => togglePayment(opt)}
                    />
                    {payLabel(opt)}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
              />
              {t.activatePool}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {t.cancel}
            </Button>
            <Button onClick={() => void handleFormSave()} disabled={formSaving}>
              {formSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 削除確認ダイアログ ─── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.deleteTitle}</DialogTitle>
            <DialogDescription>
              {t.deletePre}{deleteTarget?.name}{t.deletePost}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t.cancel}
            </Button>
            <Button
              onClick={() => void handleDelete()}
              disabled={deleteDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t.doDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 什器割り当てダイアログ ─── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t.assignTitle(assignPool?.name ?? '')}</DialogTitle>
            <DialogDescription>
              {t.assignDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {storeOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="assign-store">{t.filterByStore}</Label>
                <select
                  id="assign-store"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={assignStoreFilter}
                  onChange={(e) => setAssignStoreFilter(e.target.value)}
                >
                  <option value="">{t.allStores}</option>
                  {storeOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {devices.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t.devicesFetchFailed}
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 w-10"></th>
                      <th className="px-3 py-2">{t.colDeviceName}</th>
                      <th className="px-3 py-2">{t.colStore}</th>
                      <th className="px-3 py-2">{t.colSerial}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignDevices.map((d) => (
                      <tr
                        key={d.id}
                        className="border-t border-border/50 hover:bg-muted/50"
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={assignSelected.includes(d.id)}
                            onChange={() => toggleAssignDevice(d.id)}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">
                          {d.name}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {d.store_name || '—'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {d.serial}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {t.selectedCount(assignSelected.length)}
            </p>

            {assignResult && (
              <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                {t.assignResultPre(assignResult.assigned)}
                {assignResult.skipped.length > 0 && (
                  <>
                    {' / '}
                    {t.assignSkip(assignResult.skipped.length, assignResult.skipped.join(', '))}
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              {t.close}
            </Button>
            <Button
              onClick={() => void handleAssign()}
              disabled={assignSaving || assignSelected.length === 0}
            >
              {assignSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Settings2 className="mr-2 h-4 w-4" />
              )}
              {t.assignSelected}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
