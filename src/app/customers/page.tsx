'use client';

// src/app/customers/page.tsx
// 運営（lv1_super）専用「顧客」ページ。新規顧客オンボーディング・ウィザード。
// device-groups/page.tsx と同じ作法（AppShell + Card + @/components/ui + tokenStore ガード）。

import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, auth } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Plus, Trash2, AlertTriangle, Copy, Check, UserPlus, Loader2, Store as StoreIcon, Monitor, Users2, Pencil, UserCog } from 'lucide-react';

type StoreForm = {
  id: string; name: string; address: string; prefecture: string;
  postal_code: string; phone: string;
};
type DeviceForm = {
  id: string; name: string; serial: string; store_index: number; is_master: boolean;
  /* === S161 onboard existing === */
  source_mode: 'new' | 'existing'; existing_device_id: string;
};
type OnboardResult = {
  customer_id: string;
  store_ids: string[];
  device_ids: string[];
  group_id: string | null;
  master_device_id: string | null;
  admin_user_id: string;
};
type CustomerRow = {
  id: string;
  name: string;
  plan: string;
  created_at: string;
  store_count: number;
  device_count: number;
  user_count: number;
};

const EMPTY_STORE: StoreForm = {
  id: '', name: '', address: '', prefecture: '', postal_code: '', phone: '',
};
const EMPTY_DEVICE: DeviceForm = {
  id: '', name: '', serial: '', store_index: 0, is_master: false,
  source_mode: 'new', existing_device_id: '',
};

export default function CustomersPage() {
  const role = tokenStore.getUser()?.role;
  const isSuperAdmin = role === 'lv1_super';
  const [wizardOpen, setWizardOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [editTarget, setEditTarget] = useState<CustomerRow | null>(null);
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
        alert('この顧客には操作可能なユーザーがいません。');
        return;
      }
      // Prefer a lv2_admin; otherwise fall back to the first user.
      const target = list.find((u) => u.role === 'lv2_admin') ?? list[0];
      await auth.impersonate(target.id);
      if (typeof window !== 'undefined') window.location.href = '/';
      else router.replace('/');
    } catch (e) {
      console.error('[operate-as] failed:', e);
      alert('成り代わりに失敗しました。');
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

  return (
    <AppShell title="顧客" breadcrumb={['ホーム', '顧客']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">運営専用 — 新規顧客の立ち上げと一覧</p>
          </div>
          {isSuperAdmin && (
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              新規顧客オンボーディング
            </Button>
          )}
        </div>

        {!isSuperAdmin ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              このページは運営（lv1_super）専用です。
            </CardContent>
          </Card>
        ) : loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />読み込み中…
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>顧客一覧（全顧客横断）</CardTitle>
            </CardHeader>
            <CardContent>
              {customers.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                  顧客がありません。「新規顧客オンボーディング」から作成してください。
                </div>
              ) : (
                <div className="space-y-2">
                  {customers.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          <Badge variant="outline">{c.plan}</Badge>
                        </div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{c.id}</div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><StoreIcon className="h-4 w-4" />{c.store_count}</span>
                        <span className="flex items-center gap-1"><Monitor className="h-4 w-4" />{c.device_count}</span>
                        <span className="flex items-center gap-1"><Users2 className="h-4 w-4" />{c.user_count}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOperateAs(c.id)}
                          disabled={impersonating === c.id}
                        >
                          {impersonating === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <UserCog className="h-3.5 w-3.5 mr-1" />
                          )}
                          この顧客で操作
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditTarget(c)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />編集
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

      {wizardOpen && (
        <OnboardWizard
          onClose={() => setWizardOpen(false)}
          onCreated={loadCustomers}
        />
      )}
      {editTarget && (
        <EditCustomerDialog
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); loadCustomers(); }}
        />
      )}
    </AppShell>
  );
}

function OnboardWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1);

  // Step1 顧客
  const [custId, setCustId] = useState('');
  const [custName, setCustName] = useState('');
  const [plan, setPlan] = useState('standard');

  // Step2 店舗
  const [stores, setStores] = useState<StoreForm[]>([{ ...EMPTY_STORE }]);

  // Step3 端末
  const [devices, setDevices] = useState<DeviceForm[]>([
    { ...EMPTY_DEVICE, is_master: true },
    { ...EMPTY_DEVICE },
  ]);

  // Step4 グループ
  const [makeGroup, setMakeGroup] = useState(true);
  const [groupId, setGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [linked, setLinked] = useState(true);
  const [effectDefault, setEffectDefault] = useState(true);

  // Step5 管理者
  const [email, setEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [password, setPassword] = useState('');

  // 送信
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [copied, setCopied] = useState(false);

  const masterCount = devices.filter((d) => d.is_master).length;

  /* === S161 onboard existing: 自社ストック端末 === */
  const [stockDevices, setStockDevices] = useState<{ id: string; name: string; serial: string; store_name?: string }[]>([]);
  useEffect(() => {
    const myCid = tokenStore.getUser()?.customer_id;
    const isSuper = tokenStore.getUser()?.role === 'lv1_super';
    if (!isSuper || !myCid) return;
    void (async () => {
      try {
        const res = await api.get<{ items?: { id: string; name: string; serial: string; customer_id: string; store_name?: string }[] } | { id: string; name: string; serial: string; customer_id: string; store_name?: string }[]>('/devices?limit=200');
        const arr = Array.isArray(res) ? res : (res.items ?? []);
        // 案X: 自社(cust_demo=自分のcustomer_id)所属のみをストックとして提示
        setStockDevices(arr.filter((d) => d.customer_id === myCid).map((d) => ({ id: d.id, name: d.name, serial: d.serial, store_name: d.store_name })));
      } catch {
        /* 取得失敗時はストック選択を出さない（新規登録のみで運用可能） */
      }
    })();
  }, []);
  const newDeviceCount = devices.filter((d) => d.source_mode === 'new').length;

  function setStore(patch: Partial<StoreForm>) {
    setStores([{ ...stores[0], ...patch }]);
  }
  function setDevice(i: number, patch: Partial<DeviceForm>) {
    setDevices((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function setMaster(i: number) {
    setDevices((prev) => prev.map((d, idx) => ({ ...d, is_master: idx === i })));
  }
  function addDevice() {
    setDevices((prev) => [...prev, { ...EMPTY_DEVICE }]);
  }
  function removeDevice(i: number) {
    setDevices((prev) => prev.filter((_, idx) => idx !== i));
  }

  function validate(): string | null {
    if (!custName.trim()) return '顧客名は必須です';
    if (!stores[0].name.trim() || !stores[0].address.trim() || !stores[0].prefecture.trim())
      return '店舗の名前・住所・都道府県は必須です';
    for (const d of devices) {
      /* === S161 onboard existing === */
      if (d.source_mode === 'existing') {
        if (!d.existing_device_id) return '「自社ストックから選択」の端末が未選択です';
        if (d.is_master && newDeviceCount > 0) return '新規登録の端末があるため、既存端末を master にはできません（master は新規端末から選んでください）';
        continue;
      }
      if (!d.name.trim() || !d.serial.trim()) return '全端末の名前・シリアルは必須です';
    }
    const serials = devices.filter((d) => d.source_mode === 'new').map((d) => d.serial.trim());
    if (new Set(serials).size !== serials.length) return '端末シリアルが重複しています';
    if (makeGroup && linked && devices.length > 0 && masterCount !== 1)
      return '連動グループには master 端末を1台だけ指定してください';
    if (!email.trim()) return '管理者メールは必須です';
    if (!adminName.trim()) return '管理者名は必須です';
    if (password.length < 8) return 'パスワードは8文字以上です';
    return null;
  }

  async function submit() {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        customer: {
          id: custId.trim() || undefined,
          name: custName.trim(),
          plan: plan.trim() || 'standard',
        },
        stores: stores.map((s) => ({
          id: s.id.trim() || undefined,
          name: s.name.trim(),
          address: s.address.trim(),
          prefecture: s.prefecture.trim(),
          postal_code: s.postal_code.trim() || null,
          phone: s.phone.trim() || null,
        })),
        devices: devices.filter((d) => d.source_mode === 'new').map((d) => ({
          id: d.id.trim() || undefined,
          name: d.name.trim(),
          serial: d.serial.trim(),
          store_index: d.store_index,
          is_master: d.is_master,
        })),
        group: makeGroup
          ? {
              id: groupId.trim() || undefined,
              name: groupName.trim() || `${custName.trim()} 連動`,
              linked,
              effect_enabled_default: effectDefault,
            }
          : null,
        admin_user: {
          email: email.trim(),
          name: adminName.trim(),
          password,
          role: 'lv2_admin',
        },
      };
      const res = await api.post<OnboardResult>('/customers/onboard', payload);

      /* === S161 onboard existing: 既存端末を新顧客へ付け替え + グループ追加 === */
      const existing = devices.filter((d) => d.source_mode === 'existing' && d.existing_device_id);
      for (const d of existing) {
        const targetStoreId = res.store_ids[d.store_index];
        if (!targetStoreId) continue;
        await api.post(`/devices/${d.existing_device_id}/reassign`, { target_store_id: targetStoreId });
      }
      if (res.group_id && existing.length > 0) {
        const addIds = existing.map((d) => d.existing_device_id);
        const existingMaster = existing.find((d) => d.is_master)?.existing_device_id;
        const body: { add_device_ids: string[]; master_device_id?: string } = { add_device_ids: addIds };
        // 既存端末を master にできるのは新規0台時のみ（validateで担保済）
        if (existingMaster && newDeviceCount === 0) body.master_device_id = existingMaster;
        await api.patch(`/device-groups/${res.group_id}`, body);
      }

      setResult(res);
      onCreated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'オンボーディングに失敗しました';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ---- 成功画面（パスワード1回表示） ----
  if (result) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>オンボーディング完了</DialogTitle>
            <DialogDescription>
              管理者パスワードはこの画面でしか表示されません。閉じる前に控えてください。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-center gap-2 font-medium text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                管理者パスワード
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded bg-white px-2 py-1 font-mono">{password}</code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(password);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="mt-2 text-xs text-amber-700">
                先方管理者（{email}）へ安全な経路で伝達してください。
              </p>
            </div>
            <dl className="grid grid-cols-[130px_1fr] gap-y-1 font-mono text-xs">
              <dt className="text-muted-foreground">customer_id</dt><dd>{result.customer_id}</dd>
              <dt className="text-muted-foreground">store_ids</dt><dd>{result.store_ids.join(', ')}</dd>
              <dt className="text-muted-foreground">device_ids</dt><dd>{result.device_ids.join(', ') || '（なし）'}</dd>
              <dt className="text-muted-foreground">group_id</dt><dd>{result.group_id || '（なし）'}</dd>
              <dt className="text-muted-foreground">master</dt><dd>{result.master_device_id || '（なし）'}</dd>
              <dt className="text-muted-foreground">admin_user_id</dt><dd>{result.admin_user_id}</dd>
            </dl>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ---- ウィザード本体 ----
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            新規顧客オンボーディング（{step}/5）
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {step === 1 && (
            <section className="space-y-3">
              <h3 className="font-medium">Step1 顧客</h3>
              <Field label="顧客ID（任意・省略時自動生成）">
                <Input value={custId} onChange={(e) => setCustId(e.target.value)} placeholder="cust_oga" />
              </Field>
              <Field label="顧客名 *">
                <Input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="秋田県男鹿市役所" />
              </Field>
              <Field label="プラン">
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="standard">standard</option>
                  <option value="premium">premium</option>
                </select>
              </Field>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-3">
              <h3 className="font-medium">Step2 店舗</h3>
              <Field label="店舗ID（任意）">
                <Input value={stores[0].id} onChange={(e) => setStore({ id: e.target.value })} placeholder="str_oga_001" />
              </Field>
              <Field label="店舗名 *">
                <Input value={stores[0].name} onChange={(e) => setStore({ name: e.target.value })} placeholder="男鹿市役所" />
              </Field>
              <Field label="住所 *">
                <Input value={stores[0].address} onChange={(e) => setStore({ address: e.target.value })} placeholder="秋田県男鹿市船川港船川字泉台66-1" />
              </Field>
              <Field label="都道府県 *">
                <Input value={stores[0].prefecture} onChange={(e) => setStore({ prefecture: e.target.value })} placeholder="秋田県" />
              </Field>
              <Field label="郵便番号">
                <Input value={stores[0].postal_code} onChange={(e) => setStore({ postal_code: e.target.value })} />
              </Field>
              <Field label="電話">
                <Input value={stores[0].phone} onChange={(e) => setStore({ phone: e.target.value })} />
              </Field>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Step3 端末</h3>
                <Button variant="outline" size="sm" onClick={addDevice}>
                  <Plus className="mr-1 h-4 w-4" />端末を追加
                </Button>
              </div>
              {devices.map((d, i) => (
                <div key={i} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">端末 {i + 1}</span>
                    {devices.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeDevice(i)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                  {/* === S161 onboard existing: 登録方法トグル === */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDevice(i, { source_mode: 'new' })}
                      className={`flex-1 h-8 rounded-md text-xs font-medium border transition-colors ${d.source_mode === 'new' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-accent'}`}
                    >新規登録</button>
                    <button
                      type="button"
                      onClick={() => setDevice(i, { source_mode: 'existing' })}
                      className={`flex-1 h-8 rounded-md text-xs font-medium border transition-colors ${d.source_mode === 'existing' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-accent'}`}
                    >自社ストックから選択</button>
                  </div>

                  {d.source_mode === 'new' ? (
                    <>
                      <Field label="端末ID（任意）">
                        <Input value={d.id} onChange={(e) => setDevice(i, { id: e.target.value })} placeholder={`dev_oga_0${i + 1}`} />
                      </Field>
                      <Field label="端末名 *">
                        <Input value={d.name} onChange={(e) => setDevice(i, { name: e.target.value })} placeholder={`男鹿市役所 #${i + 1}`} />
                      </Field>
                      <Field label="シリアル *">
                        <Input value={d.serial} onChange={(e) => setDevice(i, { serial: e.target.value })} placeholder={`SN-OGA-0${i + 1}`} />
                      </Field>
                    </>
                  ) : (
                    <Field label="自社ストックの端末 *">
                      <Select value={d.existing_device_id} onValueChange={(v) => setDevice(i, { existing_device_id: v })}>
                        <SelectTrigger><SelectValue placeholder={stockDevices.length ? '端末を選択' : '自社ストックがありません'} /></SelectTrigger>
                        <SelectContent>
                          {stockDevices.map((sd) => (
                            <SelectItem key={sd.id} value={sd.id}>{sd.name}（{sd.serial}{sd.store_name ? ` / ${sd.store_name}` : ''}）</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={d.is_master} onCheckedChange={(c) => c === true && setMaster(i)} />
                    master（連動グループの基準端末）
                  </label>
                  {d.source_mode === 'existing' && d.is_master && newDeviceCount > 0 && (
                    <p className="text-[11px] text-red-500">新規端末があるため既存端末は master にできません（master は新規から選択）。</p>
                  )}
                </div>
              ))}
              {makeGroup && linked && masterCount !== 1 && (
                <p className="text-xs text-red-500">master 端末を1台だけ指定してください（現在 {masterCount} 台）</p>
              )}
            </section>
          )}

          {step === 4 && (
            <section className="space-y-3">
              <h3 className="font-medium">Step4 連動グループ</h3>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={makeGroup} onCheckedChange={setMakeGroup} />
                連動グループを作成する
              </label>
              {makeGroup && (
                <>
                  <Field label="グループID（任意）">
                    <Input value={groupId} onChange={(e) => setGroupId(e.target.value)} placeholder="grp_oga_link" />
                  </Field>
                  <Field label="グループ名">
                    <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="男鹿連動" />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={linked} onCheckedChange={setLinked} />
                    linked（同期連結再生）
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={effectDefault} onCheckedChange={setEffectDefault} />
                    演出をグループ既定で有効（effect_enabled_default）
                  </label>
                </>
              )}
            </section>
          )}

          {step === 5 && (
            <section className="space-y-3">
              <h3 className="font-medium">Step5 管理者（先方・lv2_admin）</h3>
              <Field label="メール *">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="oga-admin@example.jp" />
              </Field>
              <Field label="氏名 *">
                <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="男鹿市役所 管理者" />
              </Field>
              <Field label="初期パスワード（8文字以上）*">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <p className="text-xs text-muted-foreground">
                role は lv2_admin 固定（運営権限 lv1_super は付与しません）。
              </p>
            </section>
          )}

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <Button variant="outline" onClick={() => (step > 1 ? setStep(step - 1) : onClose())}>
            {step > 1 ? '戻る' : 'キャンセル'}
          </Button>
          {step < 5 ? (
            <Button onClick={() => setStep(step + 1)}>次へ</Button>
          ) : (
            <Button onClick={submit} disabled={submitting}>
              {submitting ? '作成中…' : 'オンボード実行'}
            </Button>
          )}
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
  const [name, setName] = useState(target.name);
  const [plan, setPlan] = useState(target.plan);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== target.name || plan.trim() !== target.plan;
  const canSave = name.trim().length > 0 && plan.trim().length > 0 && dirty && !submitting;

  async function save() {
    setSubmitting(true);
    setError(null);
    try {
      await api.put(`/customers/${target.id}`, { name: name.trim(), plan: plan.trim() });
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
          <DialogTitle>顧客情報を編集</DialogTitle>
          <DialogDescription className="font-mono text-xs">{target.id}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field label="顧客名">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </Field>
          <Field label="プラン">
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="standard">standard</option>
              <option value="premium">premium</option>
            </select>
          </Field>
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>キャンセル</Button>
          <Button onClick={save} disabled={!canSave}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}保存
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
