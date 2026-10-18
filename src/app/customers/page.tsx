'use client';

// src/app/customers/page.tsx
// 運営（lv1_super）専用「お客様」ページ。
// S262: 旧「新規顧客登録」ウィザード（端末の新規登録を含む）は廃止。新しいお客様は /customers/invite の登録リンクから。
// device-groups/page.tsx と同じ作法（AppShell + Card + @/components/ui + tokenStore ガード）。

import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, auth, ApiError } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';
import Link from 'next/link';
import { Trash2, AlertTriangle, Loader2, Pencil, UserCog, CalendarX, Undo2 } from 'lucide-react';
import { usePageT } from '@/i18n/usePageT';
import { customersDict } from '@/i18n/ns/customers';
import { PendingCustomersSection } from '@/components/domain/pending-customers';

type CustomerRow = {
  id: string;
  name: string;
  plan: string;
  created_at: string;
  store_count: number;
  device_count: number;
  user_count: number;
  /** S243 レンタル終了 */
  rental_ended_on?: string | null;
  login_locked_from?: string | null;
  login_locked?: boolean;
};

export default function CustomersPage() {
  const t = usePageT(customersDict);
  const role = tokenStore.getUser()?.role;
  const isSuperAdmin = role === 'lv1_super';
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [editTarget, setEditTarget] = useState<CustomerRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null);
  const [endRentalTarget, setEndRentalTarget] = useState<CustomerRow | null>(null);  // S243
  const [notice, setNotice] = useState<string | null>(null);  // S243
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [impersonating, setImpersonating] = useState<string | null>(null);

  // S157: enter a customer's admin console by impersonating their admin user.
  const onOperateAs = async (cid: string) => {
    setImpersonating(cid);
    try {
      const res = await api.get<{ items?: { id: string; role: string }[] } | { id: string; role: string }[]>(
        `/users?customer_id=${encodeURIComponent(cid)}&limit=200`,
      );
      const list = Array.isArray(res) ? res : (res.items ?? []);
      if (list.length === 0) {
        alert(t.noUsersToOperate);
        return;
      }
      // Prefer a lv2_admin; otherwise fall back to the first user.
      const target = list.find((u) => u.role === 'lv2_admin') ?? list[0];
      await auth.impersonate(target.id);
      if (typeof window !== 'undefined') window.location.href = '/';
      else router.replace('/');
    } catch (e) {
      console.error('[operate-as] failed:', e);
      alert(t.impersonateFailed);
    } finally {
      setImpersonating(null);
    }
  };

  const loadCustomers = useCallback(async () => {
    if (!isSuperAdmin) { setLoading(false); return; }
    try {
      const res = await api.get<{ items?: CustomerRow[] } | CustomerRow[]>('/customers?limit=200');
      const arr = Array.isArray(res) ? res : (res.items ?? []);
      setCustomers(arr);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // S243: レンタル終了の取り消し（ログイン停止の解除）
  const onReopenRental = useCallback(async (c: CustomerRow) => {
    if (!window.confirm(t.reopenRentalConfirm)) return;
    try {
      await api.post(`/customers/${c.id}/reopen-rental`, {});
      setNotice(null);
      await loadCustomers();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      window.alert(t.reopenRentalFailed(msg));
    }
  }, [loadCustomers, t]);

  return (
    <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[15px] text-muted-foreground">{t.intro}</p>
          </div>
          {isSuperAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/customers/approvals">{t.approvalsLink}</Link>
              </Button>
              <Button asChild>
                <Link href="/customers/invite">{t.newCustomer}</Link>
              </Button>
            </div>
          )}
        </div>

        {notice && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
            {notice}
          </div>
        )}

        {/* S262b: 登録待ちのお客様（弊社が先に準備できる） */}
        {isSuperAdmin && <PendingCustomersSection />}

        {!isSuperAdmin ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t.operatorOnly}
            </CardContent>
          </Card>
        ) : loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.loading}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t.listTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              {customers.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                  {t.noCustomers}
                </div>
              ) : (
                <div className="space-y-2">
                  {customers.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border p-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-bold">{c.name}</span>
                          {/* S243: レンタル終了の状態 */}
                          {c.rental_ended_on && (
                            <span className={
                              'text-[13px] font-bold ' +
                              (c.login_locked
                                ? 'text-destructive'
                                : 'text-warn')
                            }>
                              {c.login_locked
                                ? t.rentalLockedBadge
                                : t.rentalEndedBadge(c.rental_ended_on)}
                            </span>
                          )}
                          {c.rental_ended_on && !c.login_locked && c.login_locked_from && (
                            <span className="text-[13px] text-muted-foreground">
                              {t.rentalLockFrom(c.login_locked_from)}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[13px] text-muted-foreground">
                          {t.stores} {c.store_count}・{t.machines} {c.device_count}台・{t.users} {c.user_count}人
                        </div>
                      </div>
                      <div className="grid w-full grid-cols-2 gap-2 text-sm text-muted-foreground sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="col-span-2"
                          onClick={() => onOperateAs(c.id)}
                          disabled={impersonating === c.id}
                        >
                          {impersonating === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <UserCog className="h-3.5 w-3.5 mr-1" />
                          )}
                          {t.operateAs}
                        </Button>
                        {/* S243: レンタル終了 / 取り消し */}
                        {c.rental_ended_on ? (
                          <Button variant="outline" size="sm" className="col-span-2" onClick={() => onReopenRental(c)}>
                            <Undo2 className="h-3.5 w-3.5 mr-1" />{t.reopenRental}
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" className="col-span-2" onClick={() => setEndRentalTarget(c)}>
                            <CalendarX className="h-3.5 w-3.5 mr-1" />{t.endRental}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => setEditTarget(c)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />{t.edit}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />{t.delete}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {editTarget && (
        <EditCustomerDialog
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); loadCustomers(); }}
        />
      )}
      {endRentalTarget && (
        <EndRentalDialog
          target={endRentalTarget}
          onClose={() => setEndRentalTarget(null)}
          onDone={(msg) => { setEndRentalTarget(null); setNotice(msg); loadCustomers(); }}
        />
      )}
      {deleteTarget && (
        <DeleteCustomerDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); loadCustomers(); }}
        />
      )}
    </AppShell>
  );
}

// ★S243 レンタル終了ダイアログ
function EndRentalDialog({
  target, onClose, onDone,
}: {
  target: CustomerRow;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const t = usePageT(customersDict);
  const [endOn, setEndOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 最終振込日の翌日（＝翌々月1日）を画面上でも先に見せる
  const lockFrom = (() => {
    const base = endOn ? new Date(`${endOn}T00:00:00`) : new Date();
    if (Number.isNaN(base.getTime())) return '';
    const d = new Date(base.getFullYear(), base.getMonth() + 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  })();

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ returned_count: number; login_locked_from: string }>(
        `/customers/${target.id}/end-rental`,
        endOn ? { end_on: endOn } : {},
      );
      onDone(t.endRentalDone(res.returned_count ?? 0, res.login_locked_from || lockFrom));
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      setError(t.endRentalFailed(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.endRentalTitle}</DialogTitle>
          <DialogDescription>{target.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">{t.endRentalDesc}</p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t.endRentalDate}</label>
            <input type="date" value={endOn} onChange={(e) => setEndOn(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
            <div className="text-[10.5px] text-muted-foreground">{t.endRentalDateNote}</div>
          </div>
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-1 text-xs">
            <div>{t.endRentalReturn(target.device_count ?? 0)}</div>
            {lockFrom && <div>{t.endRentalLock(lockFrom)}</div>}
            <div className="text-[10.5px] text-muted-foreground">{t.endRentalLockNote}</div>
          </div>
          {error && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t.cancel}</Button>
          <Button onClick={run} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{t.endRentalDo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCustomerDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: CustomerRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = usePageT(customersDict);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 端末/売上がある顧客はサーバ側ガードで削除不可。ここでも端末数>0なら事前に注意喚起。
  const hasDevices = (target.device_count ?? 0) > 0;
  const canDelete = confirmText.trim() === target.name.trim() && !submitting;

  async function remove() {
    setSubmitting(true);
    setError(null);
    try {
      await api.delete(`/customers/${target.id}`);
      onDeleted();
    } catch (e) {
      const msg = e instanceof ApiError
        ? (e.problem?.detail || e.problem?.title || e.message)
        : (e instanceof Error ? e.message : String(e));
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.deleteTitle}</DialogTitle>
          <DialogDescription>{target.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div><strong>{target.name}</strong>{t.deletePre}</div>
              <div>{t.deleteStoresUsers(target.store_count, target.user_count)}</div>
              {hasDevices && (
                <div>{t.deleteHasDevices(target.device_count)}</div>
              )}
            </div>
          </div>
          <Field label={t.confirmNameLabel(target.name)}>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={target.name} />
          </Field>
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t.cancel}</Button>
          <Button variant="destructive" onClick={remove} disabled={!canDelete}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{t.doDelete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditCustomerDialog({
  target,
  onClose,
  onSaved,
}: {
  target: CustomerRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = usePageT(customersDict);
  const [name, setName] = useState(target.name);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== target.name;
  const canSave = name.trim().length > 0 && dirty && !submitting;

  async function save() {
    setSubmitting(true);
    setError(null);
    try {
      await api.put(`/customers/${target.id}`, { name: name.trim() });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.editTitle}</DialogTitle>
          <DialogDescription>{target.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field label={t.custNameLabelPlain}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </Field>
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t.cancel}</Button>
          <Button onClick={save} disabled={!canSave}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
