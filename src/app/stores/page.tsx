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
};
import { fmtDate } from '@/lib/format';
import { Plus, Building2, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function StoresPage() {
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
    if (!fName.trim()) { setAddError('店舗名を入力してください'); return; }
    if (!fPref.trim()) { setAddError('都道府県を入力してください'); return; }
    if (!fAddr.trim()) { setAddError('住所を入力してください'); return; }
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
        if (fLoginPassword.length < 8) { setAddError('店舗ログインの初期パスワードは8文字以上にしてください'); setSaving(false); return; }
        body.login_email = fLoginEmail.trim();
        body.login_password = fLoginPassword;
      }
      await api.post('/stores', body);
      setAddOpen(false);
      setFName(''); setFPref(''); setFAddr(''); setFPostal(''); setFPhone(''); setFCustomerId(''); setFLoginEmail(''); setFLoginPassword('');
      await loadStores();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.problem.detail || e.problem.title) : String(e);
      setAddError(`追加に失敗しました: ${msg}`);
    } finally {
      setSaving(false);
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
      <AppShell title="店舗" breadcrumb={['ホーム', '店舗']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const delDevCount = deleteTarget ? devices.filter((d) => d.store_id === deleteTarget.id).length : 0;

  return (
    <AppShell title="店舗" breadcrumb={['ホーム', '店舗']}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{stores.length} 店舗</p>
        <Button size="sm" className="gap-1.5" onClick={() => { setAddError(null); setAddOpen(true); }}>
          <Plus className="h-3.5 w-3.5" />店舗を追加
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>店舗を追加</DialogTitle>
            <DialogDescription>新しい店舗（設置先）を登録します。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {isSuperAdmin && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">顧客</label>
                <select
                  value={fCustomerId}
                  onChange={(e) => setFCustomerId(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-xs"
                >
                  <option value="">（自テナント）</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}（{c.id}）</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">店舗名 <span className="text-red-500">*</span></label>
              <input type="text" value={fName} onChange={(e) => setFName(e.target.value)}
                placeholder="男鹿市役所" className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">都道府県 <span className="text-red-500">*</span></label>
              <input type="text" value={fPref} onChange={(e) => setFPref(e.target.value)}
                placeholder="秋田県" className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">住所 <span className="text-red-500">*</span></label>
              <input type="text" value={fAddr} onChange={(e) => setFAddr(e.target.value)}
                placeholder="男鹿市船川港船川字泉台66-1" className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">郵便番号</label>
                <input type="text" value={fPostal} onChange={(e) => setFPostal(e.target.value)}
                  placeholder="010-0595" className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">電話</label>
                <input type="text" value={fPhone} onChange={(e) => setFPhone(e.target.value)}
                  placeholder="0185-23-2111" className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
              </div>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
              <div className="text-xs font-medium">店舗ログイン（任意）— この店舗のマシン・売上のみ操作/閲覧できるアカウント</div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">ログイン用メール</label>
                <input type="email" value={fLoginEmail} onChange={(e) => setFLoginEmail(e.target.value)}
                  placeholder="oga-store@example.jp" className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">初期パスワード（8文字以上）</label>
                <input type="password" value={fLoginPassword} onChange={(e) => setFLoginPassword(e.target.value)}
                  placeholder="8文字以上" className="w-full rounded-md border bg-background px-3 py-2 text-xs" />
              </div>
              <div className="text-[10.5px] text-muted-foreground">空欄なら店舗アカウントは作成しません。2段階認証コードは大元アドレスに届きます。</div>
            </div>
            {addError && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {addError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>キャンセル</Button>
            <Button onClick={handleAddStore} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              追加する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>店舗を削除</DialogTitle>
            <DialogDescription className="font-mono text-xs">{deleteTarget?.id}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 space-y-1">
              <div><strong>{deleteTarget?.name}</strong> を削除します。この操作は取り消せません。</div>
              {delDevCount > 0 && (
                <div>この店舗には端末が {delDevCount} 台あります。端末のある店舗は削除できません（先に端末を別店舗へ付け替えてください）。</div>
              )}
            </div>
            {delError && (
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {delError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>キャンセル</Button>
            <Button variant="destructive" onClick={handleDeleteStore} disabled={deleting || delDevCount > 0} className="gap-1.5">
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>店舗名</TableHead>
              <TableHead>端末</TableHead>
              <TableHead>登録日</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.map((s) => {
              const sdev = devices.filter((d) => d.store_id === s.id);
              const online = sdev.filter((d) => d.status === 'online').length;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-md bg-primary/15 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{s.name}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="ok">オン {online}</Badge>
                    {sdev.length - online > 0 && (
                      <Badge variant="muted" className="ml-1">オフ {sdev.length - online}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(s.created_at, false)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link href={`/devices?store_id=${s.id}`}>端末を表示</Link>
                    </Button>
                    {isSuperAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive ml-1"
                        onClick={() => { setDelError(null); setDeleteTarget(s); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />削除
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
