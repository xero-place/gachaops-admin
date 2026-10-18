'use client';

// S262c: お客様にマシンを追加する（4ステップ）。
// 1. お客様を選ぶ → 2. お渡しするマシンを選ぶ → 3. 確認 → 4. 完了
// 在庫（弊社）のマシンだけを移せる。POST /admin/customers/{id}/assign-devices。
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { StaffOnly } from '@/components/domain/staff-only';
import { DoneMark } from '@/components/public/public-frame';
import { StockDevicePicker } from '@/components/domain/signup-approval';
import { OwnershipNotice, PrepareButton } from '@/components/domain/customer-prep';
import {
  ChoiceRow,
  ConfirmTable,
  EmptyBox,
  ErrorBox,
  ListScroll,
  Loading,
  SearchBox,
  StepTitle,
  Stepper,
  WizardCard,
  WizardFooter,
} from '@/components/domain/wizard';
import { api } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';
import { friendlyError, signupAdmin, type PendingCustomer, type StockDevice } from '@/lib/signup-admin';

interface CustomerChoice {
  id: string;
  name: string;
  pending: boolean;
  sub: string;
}

const STEPS = ['お客様を選ぶ', 'お渡しするマシンを選ぶ', '確認', '完了'];

export default function AssignMachinesPage() {
  return (
    <AppShell title="お客様にマシンを追加する" back={{ href: '/', label: 'ホームに戻る' }}>
      <StaffOnly>
        <AssignWizard />
      </StaffOnly>
    </AppShell>
  );
}

function AssignWizard() {
  const [step, setStep] = useState(1);

  // step 1
  const [customers, setCustomers] = useState<CustomerChoice[]>([]);
  const [custLoading, setCustLoading] = useState(true);
  const [custError, setCustError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [customer, setCustomer] = useState<CustomerChoice | null>(null);

  // step 2
  const [devices, setDevices] = useState<StockDevice[]>([]);
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  // step 3
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(0);

  const loadCustomers = useCallback(async () => {
    setCustLoading(true);
    setCustError(null);
    try {
      const [pc, cs] = await Promise.all([
        signupAdmin.pendingCustomers().catch(() => [] as PendingCustomer[]),
        api.get<{ items?: { id: string; name: string; device_count?: number }[] } | { id: string; name: string; device_count?: number }[]>(
          '/customers?limit=200',
        ),
      ]);
      const pendingIds = new Set(pc.map((c) => c.customer_id));
      // 弊社（在庫）の会社自身は移し先にできない（サーバーも 409 stock_tenant で拒否する）
      const ownId = tokenStore.getUser()?.customer_id;
      const list = Array.isArray(cs) ? cs : (cs.items ?? []);
      setCustomers([
        ...pc.map((c) => ({
          id: c.customer_id,
          name: c.name,
          pending: true,
          sub: `マシン ${c.device_count}台・${c.signup_request?.status === 'pending_approval' ? '登録済み（承認待ち）' : 'まだ登録していません'}`,
        })),
        ...list
          .filter((c) => !pendingIds.has(c.id) && c.id !== ownId)
          .map((c) => ({
            id: c.id,
            name: c.name,
            pending: false,
            sub: typeof c.device_count === 'number' ? `マシン ${c.device_count}台` : '',
          })),
      ]);
    } catch (e) {
      setCustError(friendlyError(e, 'load'));
    } finally {
      setCustLoading(false);
    }
  }, []);

  const loadDevices = useCallback(async () => {
    setDevLoading(true);
    setDevError(null);
    try {
      setDevices(await signupAdmin.stockDevices());
    } catch (e) {
      setDevError('在庫のマシンを読み込めませんでした。' + friendlyError(e, 'load'));
    } finally {
      setDevLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
    loadDevices();
  }, [loadCustomers, loadDevices]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;
  }, [customers, query]);

  const pickedNames = devices.filter((d) => picked.includes(d.id)).map((d) => d.name);

  const assign = async () => {
    if (!customer || picked.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await signupAdmin.assignDevices(customer.id, picked);
      setDoneCount(r?.assigned_device_ids?.length ?? picked.length);
      setStep(4);
    } catch (e) {
      setError(friendlyError(e, 'assign'));
      loadDevices();
    } finally {
      setBusy(false);
    }
  };

  const again = () => {
    setPicked([]);
    setError(null);
    setStep(2);
    loadDevices();
  };

  return (
    <div className="flex w-full max-w-[960px] flex-col gap-6">
      <Stepper labels={STEPS} step={step} />
      <WizardCard>
        {step === 1 && (
          <>
            <StepTitle title="どのお客様にマシンを渡しますか？" lead="登録待ちのお客様（まだ本人が使い始めていないお客様）も選べます。" />
            <SearchBox value={query} onChange={setQuery} placeholder="お客様の名前で探す" />
            {custLoading ? (
              <Loading />
            ) : custError ? (
              <div className="flex flex-col items-start gap-3">
                <ErrorBox>{custError}</ErrorBox>
                <Button variant="outline" onClick={loadCustomers}>もう一度読み込む</Button>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyBox>{query ? `「${query}」に当てはまるお客様はいません。` : 'お客様がまだいません。'}</EmptyBox>
            ) : (
              <ListScroll>
                {filtered.map((c) => (
                  <ChoiceRow
                    key={c.id}
                    selected={customer?.id === c.id}
                    onClick={() => setCustomer(c)}
                    title={c.name}
                    sub={c.sub}
                    right={c.pending ? <span className="text-muted-foreground">登録待ち</span> : undefined}
                  />
                ))}
              </ListScroll>
            )}
            <WizardFooter
              onNext={() => setStep(2)}
              nextLabel="次へ"
              nextDisabled={!customer}
            />
          </>
        )}

        {step === 2 && customer && (
          <>
            <StepTitle title={`${customer.name} にお渡しするマシンを選んでください`} lead="弊社の在庫にあるマシンだけを表示しています。何台でも選べます。" />
            <StockDevicePicker
              devices={devices}
              loading={devLoading}
              error={devError}
              onReload={loadDevices}
              selected={picked}
              onChange={setPicked}
              title="お渡しするマシン"
              description="名前や番号で探せます。"
              alwaysSearch
            />
            <WizardFooter
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
              nextLabel={picked.length > 0 ? `${picked.length}台を選んで次へ` : 'マシンを選んでください'}
              nextDisabled={picked.length === 0}
            />
          </>
        )}

        {step === 3 && customer && (
          <>
            <StepTitle title="この内容でマシンを渡します" lead="内容を確かめて、よければ「マシンを渡す」を押してください。" />
            <ConfirmTable
              rows={[
                { k: 'お客様', v: <>{customer.name}{customer.pending && <span className="ml-2 text-sm font-normal text-muted-foreground">登録待ち</span>}</> },
                { k: 'お渡しするマシン', v: `${picked.length}台（${pickedNames.join('、')}）` },
              ]}
            />
            <OwnershipNotice />
            {error && <ErrorBox>{error}</ErrorBox>}
            <WizardFooter
              onBack={() => setStep(2)}
              onNext={assign}
              nextLabel="マシンを渡す"
              busy={busy}
            />
          </>
        )}

        {step === 4 && customer && (
          <div className="flex flex-col items-start gap-[18px]">
            <DoneMark />
            <h2 className="text-[22px] font-bold">{customer.name} に{doneCount}台のマシンを渡しました</h2>
            <p className="text-[15px] leading-[1.8] text-foreground/80">
              {pickedNames.join('、')}
              <br />
              これからの売上は {customer.name} の分になります。
              {customer.pending && '登録の前に、このお客様として映像や価格を準備しておけます。'}
            </p>
            <div className="flex flex-wrap gap-2.5">
              {customer.pending && (
                <PrepareButton customerId={customer.id} customerName={customer.name} variant="default" className="h-12 px-6 text-[15px]" />
              )}
              <Button variant="outline" className="h-12 px-6 text-[15px]" onClick={again}>
                続けて別のマシンを追加する
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
