'use client';

// S262h: マシンを別の顧客へ移す（4ステップ・同じ持ち主のマシンなら何台でもまとめて移せる）。
// 1. 移すマシンを選ぶ（まず顧客を選ぶ → その顧客のマシンにチェック）
// 2. 移し先の顧客（と店舗）を選ぶ
// 3. 確認（1台ずつ GET /devices/{id}/reassign-preview を呼び、合計を表示）
// 4. 実行（POST /devices/{id}/reassign を1台ずつ順番に）と結果
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';

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
type MoveResult = { id: string; ok: boolean; reason?: string };

const STEPS = ['移すマシンを選ぶ', '移し先を選ぶ', '確認', '移す'];
const STOCK_LABEL = '弊社の在庫に戻す';

const asList = <T,>(r: { items?: T[] } | T[]): T[] => (Array.isArray(r) ? r : (r.items ?? []));

/** 1台ずつの結果に出す理由（やさしい日本語） */
function moveErrorReason(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409) return '移し先の顧客に、同じ番号のマシンがすでにあります。';
    if (e.status === 404) return 'マシンか移し先の店舗が見つかりませんでした。画面を読み込み直してください。';
    if (e.status === 403) return 'この操作をする権限がありません。';
    if (e.status === 429) return '短い時間に操作が続きました。少し待ってからもう一度お試しください。';
    return 'うまく処理できませんでした。時間をおいて、もう一度お試しください。';
  }
  return '通信できませんでした。インターネットにつながっているかを確かめてください。';
}

/** 同時に動かす数を limit に抑えて順に実行する */
async function mapLimited<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export default function MoveMachinePage() {
  return (
    <AppShell title="マシンを別の顧客へ移す" back={{ href: '/', label: 'ホームに戻る' }}>
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

  // step 1
  const [owner, setOwner] = useState<string>(''); // '' = すべての顧客から探す
  const [mq, setMq] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [ownerNotice, setOwnerNotice] = useState<string | null>(null);

  // step 2
  const [cq, setCq] = useState('');
  const [target, setTarget] = useState<CustomerRow | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

  // step 3
  const [previews, setPreviews] = useState<(Preview | null)[] | null>(null);
  const [previewFailed, setPreviewFailed] = useState(0);

  // step 4
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [queue, setQueue] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, MoveResult>>({});

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
  const ownerLabel = useCallback(
    (m: MachineRow) => (m.customer_id === ownId ? '弊社の在庫' : (m.customer_name || custName(m.customer_id))),
    [ownId, custName],
  );

  // 顧客の選択肢：弊社の在庫を先頭に、マシンを持っている顧客
  const ownerOptions = useMemo(() => {
    const withMachines = new Set(machines.map((m) => m.customer_id));
    const list = customers.filter((c) => withMachines.has(c.id));
    const own = list.filter((c) => c.id === ownId);
    const others = list.filter((c) => c.id !== ownId).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return [...own, ...others].map((c) => ({
      id: c.id,
      label: c.id === ownId ? '弊社の在庫' : c.name,
      count: machines.filter((m) => m.customer_id === c.id).length,
    }));
  }, [customers, machines, ownId]);

  const visible = useMemo(() => {
    const q = mq.trim().toLowerCase();
    return machines.filter((m) => {
      if (owner && m.customer_id !== owner) return false;
      if (!q) return true;
      return [m.name, m.serial, ownerLabel(m), m.store_name ?? ''].some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [machines, owner, mq, ownerLabel]);

  const selectedOwner = selected.length > 0 ? machines.find((m) => m.id === selected[0])?.customer_id ?? null : null;
  const selectedMachines = machines.filter((m) => selected.includes(m.id));

  const changeOwner = (id: string) => {
    // 「すべての顧客から探す」に戻すだけなら選択は残す（別の顧客のマシンは選べない）
    if (selected.length > 0 && id !== '' && id !== selectedOwner) {
      setOwnerNotice('顧客を切り替えたので、選んでいたマシンの選択を外しました。');
      setSelected([]);
    } else {
      setOwnerNotice(null);
    }
    setOwner(id);
  };

  const toggle = (m: MachineRow) => {
    if (selected.includes(m.id)) {
      setSelected(selected.filter((x) => x !== m.id));
      return;
    }
    if (selectedOwner && m.customer_id !== selectedOwner) {
      setOwnerNotice(
        `一度に移せるのは、同じ顧客のマシンだけです。いま「${custName(selectedOwner)}」のマシンを選んでいます。別の顧客のマシンを移すときは、先に選択を外してください。`,
      );
      return;
    }
    setOwnerNotice(null);
    if (!owner) setOwner(m.customer_id); // 検索から選んだら、その顧客のマシンだけの表示に切り替える
    setSelected([...selected, m.id]);
  };

  const ownerMachines = owner ? machines.filter((m) => m.customer_id === owner) : [];
  const allOwnerSelected = ownerMachines.length > 0 && ownerMachines.every((m) => selected.includes(m.id));
  const toggleAll = () => {
    if (!owner) return;
    setOwnerNotice(null);
    setSelected(allOwnerSelected ? [] : ownerMachines.map((m) => m.id));
  };

  // step 2
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
  const alreadyThere = selectedMachines.filter((m) => target && m.customer_id === target.id && m.store_id === storeId);
  const canNext2 = !!target && !!storeId && alreadyThere.length === 0;
  const targetLabel = target ? (target.id === ownId ? '弊社の在庫' : target.name) : '';
  const storeName = stores.find((s) => s.id === storeId)?.name ?? '';
  const sameCustomer = !!target && selectedOwner === target.id;
  const prevOwner = selectedOwner ? custName(selectedOwner) : '';

  const goConfirm = async () => {
    setStep(3);
    setPreviews(null);
    setPreviewFailed(0);
    const ps = await mapLimited(selected, 3, async (id) => {
      try {
        return await api.get<Preview>(`/devices/${encodeURIComponent(id)}/reassign-preview`);
      } catch {
        return null;
      }
    });
    setPreviewFailed(ps.filter((p) => p === null).length);
    setPreviews(ps);
  };

  const sum = useMemo(() => {
    const ok = (previews ?? []).filter((p): p is Preview => !!p);
    return {
      coin: ok.reduce((a, p) => a + p.coin_insertion_event_count, 0),
      draws: ok.reduce((a, p) => a + p.gacha_draw_count, 0),
      settings: ok.some((p) => p.coin_setting_count > 0),
      pool: ok.some((p) => p.has_dedicated_pool),
      groupLeavers: ok.filter((p) => p.group_membership_count > 0),
    };
  }, [previews]);

  const runMoves = async (ids: string[]) => {
    if (!storeId) return;
    setStep(4);
    setRunning(true);
    setQueue(ids);
    setResults((r) => {
      const next = { ...r };
      ids.forEach((id) => delete next[id]);
      return next;
    });
    setProgress(0);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      setProgress(i + 1);
      try {
        await api.post(`/devices/${encodeURIComponent(id)}/reassign`, { target_store_id: storeId });
        setResults((r) => ({ ...r, [id]: { id, ok: true } }));
      } catch (e) {
        setResults((r) => ({ ...r, [id]: { id, ok: false, reason: moveErrorReason(e) } }));
      }
    }
    setRunning(false);
  };

  // 移している途中で画面を閉じようとしたら確認を出す
  useEffect(() => {
    if (!running) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [running]);

  const failedIds = Object.values(results).filter((r) => !r.ok).map((r) => r.id);
  const okCount = Object.values(results).filter((r) => r.ok).length;

  const restart = () => {
    setStep(1);
    setSelected([]);
    setOwner('');
    setMq('');
    setOwnerNotice(null);
    setTarget(null);
    setStoreId(null);
    setPreviews(null);
    setResults({});
    setQueue([]);
    load();
  };

  const nameOf = (id: string) => machines.find((m) => m.id === id)?.name ?? id;

  return (
    <div className="flex w-full max-w-[960px] flex-col gap-6">
      <Stepper labels={STEPS} step={step} />
      <WizardCard>
        {step === 1 && (
          <>
            <StepTitle title="どの顧客のマシンを移しますか？" lead="顧客を選ぶと、その顧客のマシンだけが表示されます。同じ顧客のマシンなら、何台でもまとめて移せます。" />
            {loading ? (
              <Loading />
            ) : loadError ? (
              <div className="flex flex-col items-start gap-3">
                <ErrorBox>{loadError}</ErrorBox>
                <Button variant="outline" onClick={load}>もう一度読み込む</Button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="move-owner" className="text-sm font-bold">いまの持ち主（顧客）</label>
                  <select
                    id="move-owner"
                    value={owner}
                    onChange={(e) => changeOwner(e.target.value)}
                    className="h-12 rounded-[10px] border border-input bg-card px-3 text-base"
                  >
                    <option value="">すべての顧客から探す</option>
                    {ownerOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}（{o.count}台）
                      </option>
                    ))}
                  </select>
                </div>
                <SearchBox value={mq} onChange={setMq} placeholder="マシンの名前・番号で探す" />
                {ownerNotice && (
                  <div role="status" className="rounded-[10px] border border-warn/40 bg-warn/5 px-4 py-3 text-sm font-bold leading-relaxed">
                    {ownerNotice}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[15px] font-bold" aria-live="polite">
                    {selected.length}台を選択中
                    {selectedOwner && <span className="ml-2 text-sm font-normal text-muted-foreground">（{custName(selectedOwner)}のマシン）</span>}
                  </div>
                  {owner && ownerMachines.length > 0 && (
                    <Button variant="outline" onClick={toggleAll}>
                      {allOwnerSelected ? '選択を外す' : 'この顧客のマシンをすべて選ぶ'}
                    </Button>
                  )}
                </div>
                {visible.length === 0 ? (
                  <EmptyBox>{mq ? `「${mq}」に当てはまるマシンはありません。` : 'この顧客のマシンはありません。'}</EmptyBox>
                ) : (
                  <ListScroll>
                    {visible.map((m) => {
                      const on = selected.includes(m.id);
                      const blocked = !on && !!selectedOwner && m.customer_id !== selectedOwner;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggle(m)}
                          aria-pressed={on}
                          className={cn(
                            'flex min-h-[60px] w-full shrink-0 items-center gap-3.5 rounded-[10px] px-4 py-3.5 text-left text-foreground transition-colors',
                            on ? 'border border-primary bg-primary/5 ring-1 ring-inset ring-primary' : 'border bg-card hover:bg-accent',
                            blocked && 'opacity-50',
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                              on ? 'bg-primary text-primary-foreground' : 'border-2 border-[#9CA3AF] bg-card',
                            )}
                          >
                            {on && <Check className="h-4 w-4" strokeWidth={3} />}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="break-words text-base font-bold">{m.name}</span>
                            <span className="break-words text-[13px] text-muted-foreground">
                              {!owner && `${ownerLabel(m)}・`}
                              {m.store_name ? `${m.store_name}・` : ''}番号 {m.serial}
                            </span>
                          </span>
                          <span className="hidden shrink-0 text-[13px] text-foreground/70 sm:inline">{STATUS_TEXT[m.status] ?? ''}</span>
                        </button>
                      );
                    })}
                  </ListScroll>
                )}
              </>
            )}
            <WizardFooter
              onNext={() => setStep(2)}
              nextLabel={selected.length > 0 ? `${selected.length}台を選んで次へ` : 'マシンを選んでください'}
              nextDisabled={selected.length === 0}
            />
          </>
        )}

        {step === 2 && (
          <>
            <StepTitle
              title={`${selected.length}台のマシンをどこへ移しますか？`}
              lead="移し先の顧客を選んでください。顧客に店舗がいくつかあるときは、店舗も選びます。"
            />
            <SearchBox value={cq} onChange={setCq} placeholder="顧客の名前で探す" />
            <ListScroll>
              {targets.map((c) => (
                <ChoiceRow
                  key={c.id}
                  selected={target?.id === c.id}
                  onClick={() => chooseTarget(c)}
                  title={c.id === ownId ? STOCK_LABEL : c.name}
                  sub={
                    c.id === ownId
                      ? '顧客から外して、弊社の在庫に戻します'
                      : c.id === selectedOwner
                        ? 'いまの持ち主です（店舗だけを変えるとき）'
                        : undefined
                  }
                  right={pendingIds.has(c.id) ? <span className="text-muted-foreground">登録待ち</span> : undefined}
                />
              ))}
            </ListScroll>
            {target && targetStores.length === 0 && (
              <ErrorBox>この顧客には店舗がまだありません。先に店舗を作ってから移してください。</ErrorBox>
            )}
            {target && targetStores.length > 1 && (
              <div className="flex flex-col gap-2">
                <div className="text-[15px] font-bold">どの店舗に置きますか？</div>
                <div className="flex flex-col gap-2">
                  {targetStores.map((s) => (
                    <ChoiceRow key={s.id} selected={storeId === s.id} onClick={() => setStoreId(s.id)} title={s.name} />
                  ))}
                </div>
              </div>
            )}
            {alreadyThere.length > 0 && (
              <ErrorBox>
                {alreadyThere.map((m) => m.name).join('、')} は、すでにこの店舗にあります。別の移し先を選ぶか、前の画面で選択を外してください。
              </ErrorBox>
            )}
            <WizardFooter onBack={() => setStep(1)} onNext={goConfirm} nextLabel="次へ" nextDisabled={!canNext2} />
          </>
        )}

        {step === 3 && target && (
          <>
            <StepTitle title="この内容でマシンを移します" lead="何が移って何が残るかを確かめて、よければ「マシンを移す」を押してください。" />
            <ConfirmTable
              rows={[
                { k: '移すマシン', v: `${selected.length}台` },
                { k: 'いまの持ち主', v: prevOwner || '—' },
                { k: '移し先', v: `${targetLabel}${storeName ? `（${storeName}）` : ''}` },
              ]}
            />
            <ul className="flex flex-col divide-y rounded-[10px] border">
              {selectedMachines.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                  <span className="text-[15px] font-bold">{m.name}</span>
                  <span className="text-[13px] text-muted-foreground">番号 {m.serial}{m.store_name ? `・${m.store_name}` : ''}</span>
                </li>
              ))}
            </ul>
            {previews === null ? (
              <Loading text="移したときの影響を確かめています…" />
            ) : sameCustomer ? (
              <div className="rounded-[10px] bg-secondary px-[18px] py-4 text-sm leading-relaxed text-foreground/85">
                同じ顧客の中で、置いている店舗だけが変わります。売上の記録や設定はそのままです。
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {previewFailed > 0 && (
                  <ErrorBox>{previewFailed}台は影響を確かめられませんでした。移すことはできますが、件数はその分を含みません。</ErrorBox>
                )}
                <div className="rounded-[10px] border px-[18px] py-4 text-sm leading-[1.9]">
                  <div className="mb-1 text-[15px] font-bold">新しい持ち主に引き継がれるもの</div>
                  <ul className="list-disc pl-5">
                    <li>マシンそのものと、これからの売上</li>
                    {sum.settings && <li>投入の受付方法（現金・メダル）の設定</li>}
                    {sum.pool && <li>マシン専用の価格・演出の設定</li>}
                  </ul>
                </div>
                <div className="rounded-[10px] border px-[18px] py-4 text-sm leading-[1.9]">
                  <div className="mb-1 text-[15px] font-bold">前の持ち主に残るもの（新しい持ち主には見えません）</div>
                  <ul className="list-disc pl-5">
                    <li>
                      これまでの売上・抽選の記録
                      {(sum.coin > 0 || sum.draws > 0) &&
                        `（${selected.length}台の合計：投入 ${sum.coin.toLocaleString('ja-JP')}件・抽選 ${sum.draws.toLocaleString('ja-JP')}件）`}
                      は {prevOwner || '前の持ち主'} の記録として残ります。
                    </li>
                  </ul>
                </div>
                {sum.groupLeavers.length > 0 && (
                  <div className="rounded-[10px] border border-warn/40 bg-warn/5 px-[18px] py-4 text-sm font-bold leading-relaxed">
                    次のマシンは、いま入っているグループから外れます：
                    {sum.groupLeavers.map((p) => `${p.device_name}（${p.group_membership_count}件）`).join('、')}
                  </div>
                )}
                {target.id !== ownId && (
                  <div className="rounded-[10px] border border-warn/40 bg-warn/5 px-[18px] py-4 text-sm font-bold leading-relaxed">
                    移した時点で、これ以降の売上は {targetLabel} の分になります。
                  </div>
                )}
              </div>
            )}
            <WizardFooter
              onBack={() => setStep(2)}
              onNext={() => { setResults({}); runMoves(selected); }}
              nextLabel={`${selected.length}台のマシンを移す`}
              nextDisabled={previews === null}
            />
          </>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-[18px]">
            {running ? (
              <div className="flex items-center gap-3 rounded-[10px] bg-secondary px-[18px] py-4 text-[15px] font-bold" aria-live="polite">
                <Loader2 className="h-5 w-5 animate-spin" />
                {progress} / {queue.length} 台を移しています…（この画面を閉じないでください）
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                {failedIds.length === 0 && <DoneMark />}
                <h2 className="text-[22px] font-bold">
                  {failedIds.length === 0
                    ? `${okCount}台のマシンを移しました`
                    : `${okCount}台を移しました。${failedIds.length}台は移せませんでした`}
                </h2>
                <p className="text-[15px] text-foreground/80">
                  移し先：{targetLabel}{storeName ? `（${storeName}）` : ''}
                </p>
              </div>
            )}
            <ul className="flex flex-col divide-y rounded-[10px] border">
              {selected.map((id) => {
                const r = results[id];
                return (
                  <li key={id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <span className="text-[15px] font-bold">{nameOf(id)}</span>
                    <span
                      className={cn(
                        'text-sm',
                        !r ? 'text-muted-foreground' : r.ok ? 'font-bold text-ok' : 'font-bold text-destructive',
                      )}
                    >
                      {!r ? (queue.includes(id) ? 'まだです' : '—') : r.ok ? '移しました' : `移せませんでした：${r.reason}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            {!running && (
              <div className="flex flex-wrap gap-2.5">
                {failedIds.length > 0 && (
                  <Button className="h-12 px-6 text-[15px]" onClick={() => runMoves(failedIds)}>
                    移せなかったマシンだけもう一度試す
                  </Button>
                )}
                <Button asChild variant={failedIds.length > 0 ? 'outline' : 'default'} className="h-12 px-6 text-[15px]">
                  <Link href="/devices">マシンの一覧を開く</Link>
                </Button>
                <Button variant="outline" className="h-12 px-6 text-[15px]" onClick={restart}>
                  続けて別のマシンを移す
                </Button>
                <Button asChild variant="outline" className="h-12 px-6 text-[15px]">
                  <Link href="/">ホームに戻る</Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </WizardCard>
    </div>
  );
}
