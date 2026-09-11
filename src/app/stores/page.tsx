'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useState, useEffect } from 'react';
import { api, ApiError } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';  // S145
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

type Store = {
  id: string;
  customer_id?: string;
  name: string;
  address: string;
  prefecture?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  created_at: string;
};
type Device = {
  id: string;
  store_id?: string | null;
  status: string;
  name?: string;            // S236: 割り当てダイアログの表示名
  customer_id?: string;     // S236: lv1_super 横断時に顧客をまたがないようにする
};
import { fmtDate } from '@/lib/format';
import { Plus, Trash2, UserPlus, MonitorSmartphone } from 'lucide-react';
import Link from 'next/link';
import { usePageT } from '@/i18n/usePageT';
import { storesDict } from '@/i18n/ns/stores';

export default function StoresPage() {
  const t = usePageT(storesDict);
  const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';  // S145
  const [stores, setStores] = useState<Store[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  // S146: 店舗追加ダイアログ
  const [addOpen, setAddOpen] = useState(false);
  const [fName, setFName] = useState('');
  const [fPref, setFPref] = useState('');
  const [fAddr, setFAddr] = useState('');
  const [fPostal, setFPostal] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fLoginEmail, setFLoginEmail] = useState('');
  const [fLoginPassword, setFLoginPassword] = useState('');
  const [fCustomerId, setFCustomerId] = useState('');
  const [customers, setCustomers] = useState<{id:string; name:string}[]>([]);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // ── S236: マシンの割り当て ──
  const meStoreId = tokenStore.getUser()?.store_id ?? null;  // 店舗限定アカウントなら非表示
  const [assignTarget, setAssignTarget] = useState<Store | null>(null);
  const [assignPicked, setAssignPicked] = useState<Set<string>>(new Set());
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── S236: アカウント追加（ログインアドレスのみ） ──
  const [acctOpen, setAcctOpen] = useState(false);
  const [acctEmail, setAcctEmail] = useState('');
  const [acctPassword, setAcctPassword] = useState('');
  const [acctSaving, setAcctSaving] = useState(false);
  const [acctError, setAcctError] = useState<string | null>(null);

  // 削除（運営専用）
  const [deleteTarget, setDeleteTarget] = useState<Store | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  async function loadStores() {
    try {
      const [sRes, dRes] = await Promise.all([
        api.get<{items?: Store[]} | Store[]>('/stores?limit=200'),
        api.get<{items?: Device[]} | Device[]>('/devices?limit=500'),
      ]);
      const sArr = Array.isArray(sRes) ? sRes : (sRes.items ?? []);
      const dArr = Array.isArray(dRes) ? dRes : (dRes.items ?? []);
      setStores(sArr);
      setDevices(dArr);
    } catch (e) {
      console.error('[stores] fetch failed:', e);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadStores();
      if (isSuperAdmin) {
        try {
          const cRes = await api.get<{items?: {id:string;name:string}[]} | {id:string;name:string}[]>('/customers?limit=200');
          if (!cancelled) setCustomers(Array.isArray(cRes) ? cRes : (cRes.items ?? []));
        } catch (e) { console.error('[stores] customers fetch failed:', e); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleAddStore() {
    if (!fName.trim()) { setAddError(t.nameRequired); return; }
    if (!fPref.trim()) { setAddError(t.prefRequired); return; }
    if (!fAddr.trim()) { setAddError(t.addrRequired); return; }
    setSaving(true);
    setAddError(null);
    try {
      const body: Record<string, unknown> = {
        name: fName.trim(),
        prefecture: fPref.trim(),
        address: fAddr.trim(),
        postal_code: fPostal.trim() || null,
        phone: fPhone.trim() || null,
      };
      if (isSuperAdmin && fCustomerId) body.customer_id = fCustomerId;
      if (fLoginEmail.trim()) {
        if (fLoginPassword.length < 8) { setAddError(t.passwordMin); setSaving(false); return; }
        body.login_email = fLoginEmail.trim();
        body.login_password = fLoginPassword;
      }
      await api.post('/stores', body);
      setAddOpen(false);
      setFName(''); setFPref(''); setFAddr(''); setFPostal(''); setFPhone(''); setFCustomerId(''); setFLoginEmail(''); setFLoginPassword('');
      await loadStores();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      setAddError(t.addFailed(msg));
    } finally {
      setSaving(false);
    }
  }

  // S236: 割り当てダイアログを開く（この店舗の端末を初期チェック）
  function openAssign(store: Store) {
    setAssignError(null);
    setNotice(null);
    setAssignPicked(new Set(devices.filter((d) => d.store_id === store.id).map((d) => d.id)));
    setAssignTarget(store);
  }

  // S236: 選択した端末をこの店舗へ移動（PATCH /devices/{id} {store_id}）
  async function handleAssignDevices() {
    if (!assignTarget) return;
    const moving = devices.filter(
      (d) => assignPicked.has(d.id) && d.store_id !== assignTarget.id,
    );
    if (moving.length === 0) { setAssignTarget(null); return; }
    setAssignSaving(true);
    setAssignError(null);
    try {
      for (const d of moving) {
        await api.patch(`/devices/${d.id}`, { store_id: assignTarget.id });
      }
      setAssignTarget(null);
      setNotice(t.assignDone(moving.length));
      await loadStores();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      setAssignError(t.assignFailed(msg));
    } finally {
      setAssignSaving(false);
    }
  }

  // S236: ログインアカウントのみを追加（店舗情報なし・いまのアカウントと同じ権限）
  async function handleAddAccount() {
    const email = acctEmail.trim();
    if (!email) { setAcctError(t.accountEmailRequired); return; }
    if (acctPassword.length < 8) { setAcctError(t.passwordMin); return; }
    setAcctSaving(true);
    setAcctError(null);
    try {
      // 「いまのアカウントと同じ権限」で作る。ただし運営(lv1_super)が自テナントで
      // 使った場合に運営権限を増やさないよう、そこだけ lv2_admin に落とす。
      const myRole = tokenStore.getUser()?.role ?? 'lv2_admin';
      const newRole = myRole === 'lv1_super' ? 'lv2_admin' : myRole;
      await api.post('/users', {
        email,
        name: email.split('@')[0] || email,
        password: acctPassword,
        role: newRole,
      });
      setAcctOpen(false);
      setAcctEmail('');
      setAcctPassword('');
      setNotice(t.accountAdded(email));
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      setAcctError(t.accountFailed(msg));
    } finally {
      setAcctSaving(false);
    }
  }

  async function handleDeleteStore() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDelError(null);
    try {
      await api.delete(`/stores/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadStores();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      setDelError(msg);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const delDevCount = deleteTarget ? devices.filter((d) => d.store_id === deleteTarget.id).length : 0;

  return (
    <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{t.storeCount(stores.length)}</p>
        <div className="flex items-center gap-2">
          {/* S236: ログインアカウントのみ追加（店舗限定アカウントには出さない） */}
          {!meStoreId && (
            <Button size="sm" variant="outline" className="gap-1.5"
              onClick={() => { setAcctError(null); setAcctOpen(true); }}>
              <UserPlus className="h-3.5 w-3.5" />{t.addAccount}
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => { setAddError(null); setAddOpen(true); }}>
            <Plus className="h-3.5 w-3.5" />{t.addStore}
          </Button>
        </div>
      </div>

      {notice && (
        <div className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
          {notice}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.addStore}</DialogTitle>
            <DialogDescription>{t.addStoreDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {isSuperAdmin && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t.customer}</label>
                <select
                  value={fCustomerId}
                  onChange={(e) => setFCustomerId(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-xs"
                >
                  <option value="">{t.ownTenant}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{t.customerOption(c.name, c.id)}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t.storeName} <span className="text-red-500">*</span></label>
              <input type="text" value={fName} onChange={(e) => setFName(e.target.value)}
                placeholder={t.storeNamePlaceholder} className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t.prefecture} <span className="text-red-500">*</span></label>
              <input type="text" value={fPref} onChange={(e) => setFPref(e.target.value)}
                placeholder={t.prefPlaceholder} className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t.address} <span className="text-red-500">*</span></label>
              <input type="text" value={fAddr} onChange={(e) => setFAddr(e.target.value)}
                placeholder={t.addrPlaceholder} className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t.postal}</label>
                <input type="text" value={fPostal} onChange={(e) => setFPostal(e.target.value)}
                  placeholder="010-0595" className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t.phone}</label>
                <input type="text" value={fPhone} onChange={(e) => setFPhone(e.target.value)}
                  placeholder="0185-23-2111" className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
              </div>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
              <div className="text-xs font-medium">{t.loginSection}</div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t.loginEmail}</label>
                <input type="email" value={fLoginEmail} onChange={(e) => setFLoginEmail(e.target.value)}
                  placeholder="oga-store@example.jp" className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t.initPassword}</label>
                <input type="password" value={fLoginPassword} onChange={(e) => setFLoginPassword(e.target.value)}
                  placeholder={t.passwordPlaceholder} className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
              </div>
              <div className="text-[10.5px] text-muted-foreground">{t.loginNote}</div>
            </div>
            {addError && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {addError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>{t.cancel}</Button>
            <Button onClick={handleAddStore} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t.doAdd}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* S236: マシンの割り当て */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => { if (!o) setAssignTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{assignTarget ? t.assignTitle(assignTarget.name) : ''}</DialogTitle>
            <DialogDescription>{t.assignDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-[45vh] overflow-y-auto">
            {(() => {
              if (!assignTarget) return null;
              const pool = devices.filter(
                (d) => !d.customer_id || !assignTarget.customer_id || d.customer_id === assignTarget.customer_id,
              );
              if (pool.length === 0) {
                return <p className="text-xs text-muted-foreground">{t.assignNoDevices}</p>;
              }
              return pool.map((d) => {
                const here = d.store_id === assignTarget.id;
                const owner = stores.find((st) => st.id === d.store_id);
                return (
                  <label
                    key={d.id}
                    className={
                      'flex items-center gap-3 rounded-md border px-3 py-2 ' +
                      (here ? 'bg-muted/60 cursor-not-allowed' : 'cursor-pointer hover:bg-accent')
                    }
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={assignPicked.has(d.id)}
                      disabled={here || assignSaving}
                      onChange={(e) => {
                        setAssignPicked((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(d.id); else next.delete(d.id);
                          return next;
                        });
                      }}
                    />
                    <span className="flex-1 text-xs font-medium">{d.name || d.id}</span>
                    <span className="text-[10.5px] text-muted-foreground">
                      {here ? t.assignHere : t.assignOtherStore(owner?.name ?? '—')}
                    </span>
                  </label>
                );
              });
            })()}
            <p className="pt-1 text-[10.5px] text-muted-foreground">{t.assignLockedNote}</p>
            {assignError && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {assignError}
              </div>
            )}
          </div>
          <DialogFooter>
            <span className="mr-auto text-[11px] text-muted-foreground">
              {(() => {
                if (!assignTarget) return null;
                const n = devices.filter((d) => assignPicked.has(d.id) && d.store_id !== assignTarget.id).length;
                return n > 0 ? t.assignSelected(n) : t.assignNoChange;
              })()}
            </span>
            <Button variant="outline" onClick={() => setAssignTarget(null)} disabled={assignSaving}>{t.cancel}</Button>
            <Button onClick={handleAssignDevices} disabled={assignSaving} className="gap-1.5">
              {assignSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t.doAssign}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* S236: アカウント追加（ログインアドレスのみ） */}
      <Dialog open={acctOpen} onOpenChange={setAcctOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.addAccount}</DialogTitle>
            <DialogDescription>{t.addAccountDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t.accountEmail} <span className="text-red-500">*</span></label>
              <input type="email" value={acctEmail} onChange={(e) => setAcctEmail(e.target.value)}
                placeholder="staff@example.jp" className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t.accountPassword} <span className="text-red-500">*</span></label>
              <input type="password" value={acctPassword} onChange={(e) => setAcctPassword(e.target.value)}
                placeholder={t.passwordPlaceholder} className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
            </div>
            <div className="text-[10.5px] text-muted-foreground">{t.accountNote}</div>
            {acctError && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {acctError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcctOpen(false)} disabled={acctSaving}>{t.cancel}</Button>
            <Button onClick={handleAddAccount} disabled={acctSaving} className="gap-1.5">
              {acctSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t.doAdd}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.deleteTitle}</DialogTitle>
            <DialogDescription className="font-mono text-xs">{deleteTarget?.id}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 space-y-1">
              <div><strong>{deleteTarget?.name}</strong>{t.deletePre}</div>
              {delDevCount > 0 && (
                <div>{t.deleteHasDevices(delDevCount)}</div>
              )}
            </div>
            {delError && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {delError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>{t.cancel}</Button>
            <Button variant="destructive" onClick={handleDeleteStore} disabled={deleting || delDevCount > 0} className="gap-1.5">
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{t.doDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.colStoreName}</TableHead>
              <TableHead>{t.colDevices}</TableHead>
              <TableHead>{t.colRegistered}</TableHead>
              <TableHead className="text-right">{t.colAction}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.map((s) => {
              const sdev = devices.filter((d) => d.store_id === s.id);
              const online = sdev.filter((d) => d.status === 'online').length;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{s.name}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="ok">{t.on} {online}</Badge>
                    {sdev.length - online > 0 && (
                      <Badge variant="muted" className="ml-1">{t.off} {sdev.length - online}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(s.created_at, false)}</TableCell>
                  <TableCell className="text-right">
                    {/* S236: この店舗に置くマシンを選ぶ */}
                    {!meStoreId && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => openAssign(s)}>
                        <MonitorSmartphone className="h-3.5 w-3.5 mr-1" />{t.assignDevices}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link href={`/devices?store_id=${s.id}`}>{t.showDevices}</Link>
                    </Button>
                    {isSuperAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive ml-1"
                        onClick={() => { setDelError(null); setDeleteTarget(s); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />{t.delete}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
