'use client';

// S262c: マシンを別のお客様へ移す（4ステップ・1回に1台）。
// 1. 移すマシンを選ぶ → 2. 移し先のお客様（と店舗）を選ぶ → 3. 確認（reassign-preview） → 4. 完了
// 既存 API: GET /devices, GET /customers, GET /stores, GET /devices/{id}/reassign-preview, POST /devices/{id}/reassign。
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { StaffOnly } from '@/components/domain/staff-only';
import { DoneMark } from '@/components/public/public-frame';
import {
  ChoiceRow,
  ConfirmTable,
  EmptyBox,
  ErrorBox,
  ListScroll,
  Loading,
  STATUS_TEXT,
  SearchBox,
  StepTitle,
  Stepper,
  WizardCard,
  WizardFooter,
} from '@/components/domain/wizard';
import { api, ApiError } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';
import { friendlyError, signupAdmin } from '@/lib/signup-admin';

interface MachineRow {
  id: string;
  name: string;
  serial: string;
  status: string;
  customer_id: string;
  customer_name?: string;
  store_id: string;
  store_name?: string;
}
interface CustomerRow {
  id: string;
  name: string;
}
interface StoreRow {
  id: string;
  customer_id: string;
  name: string;
}
interface Preview {
  device_id: string;
  device_name: string;
  current_customer_id: string;
  current_customer_name: string | null;
  coin_insertion_event_count: number;
  gacha_draw_count: number;
  coin_setting_count: number;
  group_membership_count: number;
  has_dedicated_pool: boolean;
}

const STEPS = ['移すマシンを選ぶ', '移し先を選ぶ', '確認', '完了'];
const STOCK_LABEL = '弊社の在庫に戻す';

const asList = <T,>(r: { items?: T[] } | T[]): T[] => (Array.isArray(r) ? r : (r.items ?? []));

export default function MoveMachinePage() {
  return (
    <AppShell title="マシンを別のお客様へ移す" back={{ href: '/', label: 'ホームに戻る' }}>
      <StaffOnly>
        <MoveWizard />
      </StaffOnly>
    </AppShell>
  );
}

function MoveWizard() {
  const [step, setStep] = useState(1);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const ownId = useMemo(() => tokenStore.getUser()?.customer_id ?? null, []);

  const [mq, setMq] = useState('');
  const [machine, setMachine] = useState<MachineRow | null>(null);
  const [cq, setCq] = useState('');
  const [target, setTarget] = useState<CustomerRow | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [d, c, s, p] = await Promise.all([
        api.get<{ items?: MachineRow[] } | MachineRow[]>('/devices?limit=200'),
        api.get<{ items?: CustomerRow[] } | CustomerRow[]>('/customers?limit=200'),
        api.get<{ items?: StoreRow[] } | StoreRow[]>('/stores?limit=200'),
        signupAdmin.pendingCustomers().catch(() => []),
      ]);
      setMachines(asList(d));
      setCustomers(asList(c));
      setStores(asList(s));
      setPendingIds(new Set(p.map((x) => x.customer_id)));
    } catch (e) {
      setLoadError(friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const custName = useCallback(
    (id: string) => (id === ownId ? '弊社の在庫' : (customers.find((c) => c.id === id)?.name ?? '')),
    [customers, ownId],
  );

  const fm = useMemo(() => {
    const q = mq.trim().toLowerCase();
    if (!q) return machines;
    return machines.filter((m) =>
      [m.name, m.serial, m.customer_name ?? custName(m.customer_id), m.store_name ?? '']
        .some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [machines, mq, custName]);

  // 移し先：弊社の在庫を先頭に、それ以外のお客様
  const targets = useMemo(() => {
    const own = ownId ? customers.filter((c) => c.id === ownId) : [];
    const others = customers.filter((c) => c.id !== ownId);
    const q = cq.trim().toLowerCase();
    const list = [...own, ...others];
    return q ? list.filter((c) => (c.id === ownId ? STOCK_LABEL : c.name).toLowerCase().includes(q)) : list;
  }, [customers, cq, ownId]);

  const targetStores = useMemo(() => (target ? stores.filter((s) => s.customer_id === target.id) : []), [stores, target]);
  const chooseTarget = (c: CustomerRow) => {
    setTarget(c);
    const st = stores.filter((s) => s.customer_id === c.id);
    setStoreId(st.length === 1 ? st[0].id : null);
  };
  const sameCustomerSameStore = !!machine && !!target && target.id === machine.customer_id && storeId === machine.store_id;
  const canNext2 = !!target && !!storeId && !sameCustomerSameStore;

  const goConfirm = async () => {
    if (!machine) return;
    setStep(3);
    setPreview(null);
    setPreviewError(null);
    setError(null);
    try {
      setPreview(await api.get<Preview>(`/devices/${encodeURIComponent(machine.id)}/reassign-preview`));
    } catch (e) {
      setPreviewError('移したときの影響を確かめられませんでした。' + friendlyError(e, 'load'));
    }
  };

  const run = async () => {
    if (!machine || !storeId) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/devices/${encodeURIComponent(machine.id)}/reassign`, { target_store_id: storeId });
      setStep(4);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError('移し先のお客様に、同じ番号のマシンがすでにあります。弊社スタッフの担当者に確認してください。');
      } else {
        setError(friendlyError(e, 'assign'));
      }
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setStep(1);
    setMachine(null);
    setTarget(null);
    setStoreId(null);
    setPreview(null);
    setError(null);
    load();
  };

  const targetLabel = target ? (target.id === ownId ? '弊社の在庫' : target.name) : '';
  const storeName = stores.find((s) => s.id === storeId)?.name ?? '';
  const sameCustomer = !!machine && !!target && machine.customer_id === target.id;
  const prevOwner = preview?.current_customer_name || (machine ? (machine.customer_name || custName(machine.customer_id)) : '');

  return (
    <div className="flex w-full max-w-[960px] flex-col gap-6">
      <Stepper labels={STEPS} step={step} />
      <WizardCard>
        {step === 1 && (
          <>
            <StepTitle title="どのマシンを移しますか？" lead="1回に1台ずつ移します。マシンの名前・番号・いまのお客様の名前で探せます。" />
            <SearchBox value={mq} onChange={setMq} placeholder="マシンの名前・番号・お客様の名前で探す" />
            {loading ? (
              <Loading />
            ) : loadError ? (
              <div className="flex flex-col items-start gap-3">
                <ErrorBox>{loadError}</ErrorBox>
                <Button variant="outline" onClick={load}>もう一度読み込む</Button>
              </div>
            ) : fm.length === 0 ? (
              <EmptyBox>{mq ? `「${mq}」に当てはまるマシンはありません。` : 'マシンがありません。'}</EmptyBox>
            ) : (
              <ListScroll>
                {fm.map((m) => (
                  <ChoiceRow
                    key={m.id}
                    selected={machine?.id === m.id}
                    onClick={() => { setMachine(m); setTarget(null); setStoreId(null); }}
                    title={m.name}
                    sub={`いまの持ち主：${m.customer_id === ownId ? '弊社の在庫' : (m.customer_name || custName(m.customer_id))}${m.store_name ? `（${m.store_name}）` : ''}・番号 ${m.serial}`}
                    right={STATUS_TEXT[m.status] ?? ''}
                  />
                ))}
              </ListScroll>
            )}
            <WizardFooter onNext={() => setStep(2)} nextLabel="次へ" nextDisabled={!machine} />
          </>
        )}

        {step === 2 && machine && (
          <>
            <StepTitle title={`「${machine.name}」をどこへ移しますか？`} lead="移し先のお客様を選んでください。お客様に店舗がいくつかあるときは、店舗も選びます。" />
            <SearchBox value={cq} onChange={setCq} placeholder="お客様の名前で探す" />
            <ListScroll>
              {targets.map((c) => (
                <ChoiceRow
                  key={c.id}
                  selected={target?.id === c.id}
                  onClick={() => chooseTarget(c)}
                  title={c.id === ownId ? STOCK_LABEL : c.name}
                  sub={
                    c.id === ownId
                      ? 'お客様から外して、弊社の在庫に戻します'
                      : c.id === machine.customer_id
                        ? 'いまの持ち主です（店舗だけを変えるとき）'
                        : undefined
                  }
                  right={pendingIds.has(c.id) ? <span className="text-muted-foreground">登録待ち</span> : undefined}
                />
              ))}
            </ListScroll>
            {target && targetStores.length === 0 && (
              <ErrorBox>このお客様には店舗がまだありません。先に店舗を作ってから移してください。</ErrorBox>
            )}
            {target && targetStores.length > 1 && (
              <div className="flex flex-col gap-2">
                <div className="text-[15px] font-bold">どの店舗に置きますか？</div>
                <div className="flex flex-col gap-2">
                  {targetStores.map((s) => (
                    <ChoiceRow
                      key={s.id}
                      selected={storeId === s.id}
                      onClick={() => setStoreId(s.id)}
                      title={s.name}
                      sub={s.id === machine.store_id ? 'いま置いている店舗です' : undefined}
                    />
                  ))}
                </div>
              </div>
            )}
            {sameCustomerSameStore && <ErrorBox>いまと同じ店舗です。別の移し先を選んでください。</ErrorBox>}
            <WizardFooter onBack={() => setStep(1)} onNext={goConfirm} nextLabel="次へ" nextDisabled={!canNext2} />
          </>
        )}

        {step === 3 && machine && target && (
          <>
            <StepTitle title="この内容でマシンを移します" lead="何が移って何が残るかを確かめて、よければ「マシンを移す」を押してください。" />
            <ConfirmTable
              rows={[
                { k: '移すマシン', v: `${machine.name}（番号 ${machine.serial}）` },
                { k: 'いまの持ち主', v: prevOwner || '—' },
                { k: '移し先', v: `${targetLabel}${storeName ? `（${storeName}）` : ''}` },
              ]}
            />
            {!preview && !previewError ? (
              <Loading text="移したときの影響を確かめています…" />
            ) : previewError ? (
              <ErrorBox>{previewError}</ErrorBox>
            ) : preview && sameCustomer ? (
              <div className="rounded-[10px] bg-secondary px-[18px] py-4 text-sm leading-relaxed text-foreground/85">
                同じお客様の中で、置いている店舗だけが変わります。売上の記録や設定はそのままです。
              </div>
            ) : preview ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-[10px] border px-[18px] py-4 text-sm leading-[1.9]">
                  <div className="mb-1 text-[15px] font-bold">新しい持ち主に引き継がれるもの</div>
                  <ul className="list-disc pl-5">
                    <li>マシンそのものと、これからの売上</li>
                    {preview.coin_setting_count > 0 && <li>投入の受付方法（現金・メダル）の設定</li>}
                    {preview.has_dedicated_pool && <li>このマシン専用の価格・演出の設定</li>}
                  </ul>
                </div>
                <div className="rounded-[10px] border px-[18px] py-4 text-sm leading-[1.9]">
                  <div className="mb-1 text-[15px] font-bold">前の持ち主に残るもの（新しい持ち主には見えません）</div>
                  <ul className="list-disc pl-5">
                    <li>
                      これまでの売上・抽選の記録
                      {(preview.coin_insertion_event_count > 0 || preview.gacha_draw_count > 0) &&
                        `（投入 ${preview.coin_insertion_event_count.toLocaleString('ja-JP')}件・抽選 ${preview.gacha_draw_count.toLocaleString('ja-JP')}件）`}
                      は {prevOwner || '前の持ち主'} の記録として残ります。
                    </li>
                  </ul>
                </div>
                {preview.group_membership_count > 0 && (
                  <div className="rounded-[10px] border border-warn/40 bg-warn/5 px-[18px] py-4 text-sm font-bold leading-relaxed">
                    このマシンは、いま入っているグループ（{preview.group_membership_count}件）から外れます。
                  </div>
                )}
                {target.id !== ownId && (
                  <div className="rounded-[10px] border border-warn/40 bg-warn/5 px-[18px] py-4 text-sm font-bold leading-relaxed">
                    移した時点で、これ以降の売上は {targetLabel} の分になります。
                  </div>
                )}
              </div>
            ) : null}
            {error && <ErrorBox>{error}</ErrorBox>}
            <WizardFooter onBack={() => setStep(2)} onNext={run} nextLabel="マシンを移す" busy={busy} nextDisabled={!preview} />
          </>
        )}

        {step === 4 && machine && (
          <div className="flex flex-col items-start gap-[18px]">
            <DoneMark />
            <h2 className="text-[22px] font-bold">「{machine.name}」を移しました</h2>
            <p className="text-[15px] leading-[1.8] text-foreground/80">
              移し先：{targetLabel}{storeName ? `（${storeName}）` : ''}
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Button asChild className="h-12 px-6 text-[15px]">
                <Link href={`/devices/${encodeURIComponent(machine.id)}`}>マシンの画面を開く</Link>
              </Button>
              <Button variant="outline" className="h-12 px-6 text-[15px]" onClick={restart}>
                続けて別のマシンを移す
              </Button>
              <Button asChild variant="outline" className="h-12 px-6 text-[15px]">
                <Link href="/">ホームに戻る</Link>
              </Button>
            </div>
          </div>
        )}
      </WizardCard>
    </div>
  );
}
