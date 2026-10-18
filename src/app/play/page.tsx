'use client';

/**
 * S262m: マシンで映像を流す・止める（案内つきの手順画面）。
 *
 * ★ 新しい API は使わない。既存画面が送っているのと同じ呼び出し・同じ中身だけを使う。
 *
 * | 使う呼び出し | 既存の送り元 (file:line) | method / path | 送る中身 |
 * |---|---|---|---|
 * | 映像を流す | stores/live-control-store.ts:71（LiveControlSheet → applySwitch） | POST /devices/bulk | { device_ids, command: { type: 'play_program', payload: { program_id }, expires_at: null } } |
 * | 再生の確認 | components/domain/live-control-sheet.tsx:135 | GET /devices?limit=200 | current_program_id === program_id を 2.5秒×6回 確認 |
 * | 映像を止める（計画配信に戻す） | stores/live-control-store.ts:121-123（devices 一覧「計画配信に戻す」→ restorePlan） | POST /devices/bulk | { device_ids, command: { type: 'stop', payload: {} } } |
 * | 映像の一覧 | components/domain/live-control-sheet.tsx:81 | GET /programs?limit=100 | 公開済み(published)のみ表示 |
 * | マシン・顧客の一覧 | app/devices/page.tsx:77 / app/customers/page.tsx:80 | GET /devices?limit=200, GET /customers?limit=200 | — |
 * | グループの一覧 | app/device-groups/page.tsx:69 | GET /device-groups?limit=200 | — |
 * | グループを作る | app/device-groups/page.tsx:741, 753 (CreateGroupDialog) | POST /device-groups → PATCH /device-groups/{id} | { name, parent_id: null, linked } → { effect_enabled_default: true, add_device_ids[, master_device_id] } |
 * | 既存グループの基準を変える | app/device-groups/page.tsx:501 (EditGroupDialog) | PATCH /device-groups/{id} | { name, linked, effect_enabled_default: true, add_device_ids: [], remove_device_ids: [], master_device_id } |
 * | つなぎの映像 | app/device-groups/page.tsx:504 (EditGroupDialog) | PUT /device-groups/{id}/rest-program | { rest_program_id: string \| null }（変わったときだけ） |
 *
 * 既存の仕組みに合わせた注意:
 *   - /devices/bulk は「つながっているマシン」だけに送る（サーバー側で status == online に絞る）。
 *     つながっていないマシンは、あとで自動では反映されないので、選べないようにしている。
 *   - 同じ映像を複数台に送ると、サーバーが同じ開始時刻(play_at)を付けるため、同時に始まる。
 *   - 既存のグループ作成画面は顧客IDを送らない（作るのはログイン中の会社のグループ）。そのため
 *     弊社スタッフが他の顧客のグループを新しく作ることはこの画面ではせず、「この顧客として操作する」へ案内する。
 *   - ビデオウォールの分割・反映は、グループ作成画面の編集ダイアログにある既存の仕組みを使う（ここでは作らない）。
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DoneMark } from '@/components/public/public-frame';
import {
  ChoiceRow,
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
import { useCurrentUser } from '@/lib/use-current-user';
import { friendlyError } from '@/lib/signup-admin';
import { cn } from '@/lib/utils';

interface Machine {
  id: string;
  name: string;
  serial?: string;
  status: string;
  customer_id: string;
  store_name?: string;
  current_program_id?: string | null;
  current_program_name?: string | null;
}
interface Customer {
  id: string;
  name: string;
}
interface Program {
  id: string;
  name: string;
  customer_id?: string;
  published?: boolean;
}
interface Group {
  id: string;
  customer_id?: string;
  name: string;
  linked: boolean;
  rest_program_id?: string | null;
  members: { device_id: string; is_master: boolean }[];
}

type Mode = 'each' | 'same' | 'wall' | 'stop';
type StepKey = 'customer' | 'mode' | 'machines' | 'sync' | 'program' | 'wall' | 'confirm';
type Line = { key: string; label: string; state: 'pending' | 'ok' | 'sent' | 'error'; text: string };

const asList = <T,>(r: { items?: T[] } | T[]): T[] => (Array.isArray(r) ? r : (r.items ?? []));

const STEP_LABEL: Record<StepKey, string> = {
  customer: '顧客',
  mode: '流し方',
  machines: 'マシン',
  sync: 'タイミング',
  program: '映像',
  wall: '並べ方',
  confirm: '確認',
};

const MODES: { key: Mode; title: string; desc: string }[] = [
  { key: 'each', title: 'マシンごとに別々の映像を流す', desc: '1台ずつ、流す映像を選びます。' },
  { key: 'same', title: '選んだマシンで同じ映像を流す', desc: '何台でも、同じ映像を流します。タイミングをそろえることもできます。' },
  { key: 'wall', title: '選んだマシンをつなげて、1つの大きな映像として流す（ビデオウォール）', desc: '並べたマシンの画面をつなげて、1本の映像を分けて映します。' },
  { key: 'stop', title: '映像を止める', desc: '手動で流している映像を止めて、いつもの流し方（計画配信）に戻します。' },
];

function sendError(e: unknown): string {
  if (e instanceof ApiError) {
    const raw = `${e.problem?.detail ?? ''}`.toLowerCase();
    if (e.status === 422 && raw.includes('online')) return 'オンラインのマシンがありませんでした。';
    if (e.status === 403) return 'この操作をする権限がありません。';
    if (e.status === 404) return '映像かマシンが見つかりませんでした。';
    return 'うまく送れませんでした。時間をおいてもう一度お試しください。';
  }
  return '通信できませんでした。インターネットにつながっているかを確かめてください。';
}

export default function PlayPage() {
  return (
    <AppShell title="マシンで映像を流す・止める" back={{ href: '/', label: 'ホームに戻る' }}>
      <PlayWizard />
    </AppShell>
  );
}

function PlayWizard() {
  const { ready, isStaff, user } = useCurrentUser();
  const ownId = user?.customer_id ?? null;

  const [machines, setMachines] = useState<Machine[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [stepIdx, setStepIdx] = useState(0);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [cq, setCq] = useState('');
  const [mode, setMode] = useState<Mode | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // B
  const [sync, setSync] = useState<boolean | null>(null);
  const [masterId, setMasterId] = useState<string>('');
  const [restId, setRestId] = useState<string>('');
  const [groupName, setGroupName] = useState('');
  // A/B(そろえない)/C
  const [saveGroup, setSaveGroup] = useState(false);
  const [saveName, setSaveName] = useState('');
  // 映像
  const [programId, setProgramId] = useState<string>('');
  const [perMachine, setPerMachine] = useState<Record<string, string>>({});
  // C
  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(2);
  // 実行
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [madeGroup, setMadeGroup] = useState<{ id: string; name: string; reused: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [d, c, p, g] = await Promise.all([
        api.get<{ items?: Machine[] } | Machine[]>('/devices?limit=200'),
        api.get<{ items?: Customer[] } | Customer[]>('/customers?limit=200').catch(() => [] as Customer[]),
        api.get<{ items?: Program[] } | Program[]>('/programs?limit=100').catch(() => [] as Program[]),
        api.get<{ items?: Group[] } | Group[]>('/device-groups?limit=200').catch(() => [] as Group[]),
      ]);
      setMachines(asList(d));
      setCustomers(asList(c));
      setPrograms(asList(p).filter((x) => x.published !== false));
      setGroups(asList(g).map((x) => ({ ...x, members: x.members ?? [] })));
    } catch (e) {
      setLoadError(friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // お客様のアカウントは自分の会社で固定
  useEffect(() => {
    if (ready && !isStaff && ownId) setCustomerId(ownId);
  }, [ready, isStaff, ownId]);

  const custName = useCallback(
    (id: string | null) => {
      if (!id) return '';
      if (isStaff && id === ownId) return '弊社';
      return customers.find((c) => c.id === id)?.name ?? user?.customer_name ?? '';
    },
    [customers, isStaff, ownId, user],
  );
  const isOwnTenant = customerId !== null && customerId === ownId;

  const custMachines = useMemo(
    () => machines.filter((m) => m.customer_id === customerId).sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [machines, customerId],
  );
  const onlineIds = custMachines.filter((m) => m.status === 'online').map((m) => m.id);
  const custPrograms = useMemo(
    () => programs.filter((p) => !isStaff || !p.customer_id || p.customer_id === customerId),
    [programs, isStaff, customerId],
  );
  const custGroups = useMemo(() => groups.filter((g) => !isStaff || g.customer_id === customerId), [groups, isStaff, customerId]);
  const pickedMachines = custMachines.filter((m) => picked.includes(m.id));
  // S262r: 2つ以上のグループに入っているマシン（連動再生がうまく動かない原因になる）
  const dupGroups = useMemo(() => {
    const m = new Map<string, Group[]>();
    for (const g of custGroups) for (const mem of g.members) {
      if (!m.has(mem.device_id)) m.set(mem.device_id, []);
      m.get(mem.device_id)!.push(g);
    }
    return new Map(Array.from(m.entries()).filter(([, gs]) => gs.length >= 2));
  }, [custGroups]);

  // そろえる（連動再生）で、同じマシンの組み合わせの連動グループが既にあれば使う
  const sameLinked = useMemo(() => {
    const want = [...picked].sort().join(',');
    return custGroups.find((g) => g.linked && g.members.map((m) => m.device_id).sort().join(',') === want) ?? null;
  }, [custGroups, picked]);
  const sameAny = useMemo(() => {
    const want = [...picked].sort().join(',');
    return custGroups.find((g) => g.members.map((m) => m.device_id).sort().join(',') === want) ?? null;
  }, [custGroups, picked]);
  const canCreateGroup = isOwnTenant || !isStaff;

  const steps: StepKey[] = useMemo(() => {
    const s: StepKey[] = [];
    if (isStaff) s.push('customer');
    s.push('mode', 'machines');
    if (mode === 'same') s.push('sync');
    if (mode === 'each' || mode === 'same') s.push('program');
    if (mode === 'wall') s.push('wall');
    s.push('confirm');
    return s;
  }, [isStaff, mode]);
  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const next = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setStepIdx((i) => Math.max(i - 1, 0));

  const chooseCustomer = (id: string) => {
    if (id !== customerId) {
      setPicked([]);
      setPerMachine({});
      setProgramId('');
    }
    setCustomerId(id);
  };
  const chooseMode = (m: Mode) => {
    setMode(m);
    // 既定：オンラインのマシンをすべて選ぶ
    setPicked(onlineIds);
    setSync(null);
  };
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const goSync = () => {
    const firstOnline = pickedMachines.find((m) => m.status === 'online');
    setMasterId(sameLinked?.members.find((m) => m.is_master)?.device_id ?? firstOnline?.id ?? picked[0] ?? '');
    setRestId(sameLinked?.rest_program_id ?? '');
    setGroupName(`${custName(customerId)} 連動 ${picked.length}台`);
    next();
  };
  const goNextFromMachines = () => {
    setSaveName(`${custName(customerId)} ${picked.length}台`);
    setCols(Math.max(1, picked.length));
    setRows(1);
    if (mode === 'same') goSync();
    else next();
  };

  // ── 実行 ──
  const playOne = async (ids: string[], pid: string): Promise<{ accepted: number }> => {
    // 既存 applySwitch と同じ中身
    const r = await api.post<{ accepted_count?: number }>('/devices/bulk', {
      device_ids: ids,
      command: { type: 'play_program', payload: { program_id: pid }, expires_at: null },
    });
    return { accepted: r?.accepted_count ?? ids.length };
  };

  // 既存 LiveControlSheet と同じ方法で、再生が始まったかを確かめる
  const verify = async (pairs: { id: string; pid: string }[]) => {
    const remaining = new Map(pairs.map((p) => [p.id, p.pid]));
    for (let i = 0; i < 6 && remaining.size > 0; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const res = await api.get<{ items?: Machine[] } | Machine[]>('/devices?limit=200');
        for (const d of asList(res)) {
          const want = remaining.get(d.id);
          if (want && d.current_program_id === want) {
            remaining.delete(d.id);
            setLines((ls) => ls.map((l) => (l.key === d.id ? { ...l, state: 'ok', text: '再生を確認しました' } : l)));
          }
        }
      } catch {
        /* 次の回で確かめる */
      }
    }
  };

  const ensureGroup = async (linked: boolean, name: string): Promise<{ id: string; name: string; reused: boolean }> => {
    if (linked && sameLinked) {
      const currentMaster = sameLinked.members.find((m) => m.is_master)?.device_id ?? '';
      if (masterId && masterId !== currentMaster) {
        // EditGroupDialog と同じ中身で保存
        await api.patch(`/device-groups/${sameLinked.id}`, {
          name: sameLinked.name,
          linked: true,
          effect_enabled_default: true,
          add_device_ids: [],
          remove_device_ids: [],
          master_device_id: masterId,
        });
      }
      if ((restId || '') !== (sameLinked.rest_program_id ?? '')) {
        await api.put(`/device-groups/${sameLinked.id}/rest-program`, { rest_program_id: restId || null });
      }
      return { id: sameLinked.id, name: sameLinked.name, reused: true };
    }
    if (!linked && sameAny) return { id: sameAny.id, name: sameAny.name, reused: true };
    // CreateGroupDialog と同じ中身で作成
    const created = await api.post<{ id: string }>('/device-groups', { name, parent_id: null, linked });
    const body: Record<string, unknown> = { effect_enabled_default: true, add_device_ids: picked };
    if (linked && masterId) body.master_device_id = masterId;
    await api.patch(`/device-groups/${created.id}`, body);
    if (linked && restId) {
      await api.put(`/device-groups/${created.id}/rest-program`, { rest_program_id: restId });
    }
    return { id: created.id, name, reused: false };
  };

  const nameOf = (id: string) => machines.find((m) => m.id === id)?.name ?? id;
  const progName = (id: string) => programs.find((p) => p.id === id)?.name ?? '';

  const run = async (onlyKeys?: string[]) => {
    setRunning(true);
    setDone(false);
    const doKey = (k: string) => !onlyKeys || onlyKeys.includes(k);
    const verifyPairs: { id: string; pid: string }[] = [];
    const setLine = (l: Line) => setLines((ls) => (ls.some((x) => x.key === l.key) ? ls.map((x) => (x.key === l.key ? l : x)) : [...ls, l]));

    if (!onlyKeys) setLines([]);

    // グループ（必要なとき）
    const needGroup = (mode === 'same' && sync) || ((mode === 'each' || mode === 'same') && !sync && saveGroup) || mode === 'wall';
    if (needGroup && doKey('group')) {
      const linked = mode === 'same' && !!sync;
      const label = linked ? '連動再生のグループ' : 'グループ';
      setLine({ key: 'group', label, state: 'pending', text: '準備しています…' });
      try {
        const g = await ensureGroup(linked, linked ? groupName.trim() || `${custName(customerId)} 連動` : saveName.trim() || `${custName(customerId)} ${picked.length}台`);
        setMadeGroup(g);
        setLine({ key: 'group', label: `${label}「${g.name}」`, state: 'ok', text: g.reused ? '同じ組み合わせの既存グループを使いました' : '作りました' });
      } catch (e) {
        setLine({ key: 'group', label, state: 'error', text: `作れませんでした：${sendError(e)}` });
        if (linked) {
          // 連動の準備ができなければ映像は送らない（ばらばらに始まるのを防ぐ）
          setRunning(false);
          setDone(true);
          return;
        }
      }
    }

    if (mode === 'stop') {
      if (doKey('stop')) {
        setLine({ key: 'stop', label: `${picked.length}台`, state: 'pending', text: '止めています…' });
        try {
          const r = await api.post<{ accepted_count?: number }>('/devices/bulk', {
            device_ids: picked,
            command: { type: 'stop', payload: {} },
          });
          const n = r?.accepted_count ?? picked.length;
          setLine({ key: 'stop', label: `${picked.length}台`, state: 'ok', text: `${n}台に「止める」を送りました（いつもの流し方に戻ります）` });
        } catch (e) {
          setLine({ key: 'stop', label: `${picked.length}台`, state: 'error', text: `送れませんでした：${sendError(e)}` });
        }
      }
    } else if (mode === 'each') {
      for (const id of picked) {
        if (!doKey(id)) continue;
        const pid = perMachine[id];
        setLine({ key: id, label: nameOf(id), state: 'pending', text: '送っています…' });
        try {
          await playOne([id], pid);
          setLine({ key: id, label: nameOf(id), state: 'sent', text: `「${progName(pid)}」を送りました（再生を確かめています）` });
          verifyPairs.push({ id, pid });
        } catch (e) {
          setLine({ key: id, label: nameOf(id), state: 'error', text: `送れませんでした：${sendError(e)}` });
        }
      }
    } else if (mode === 'same') {
      const targets = onlyKeys ? picked.filter((id) => onlyKeys.includes(id)) : picked;
      if (targets.length > 0) {
        targets.forEach((id) => setLine({ key: id, label: nameOf(id), state: 'pending', text: '送っています…' }));
        try {
          await playOne(targets, programId);
          targets.forEach((id) => {
            setLine({ key: id, label: nameOf(id), state: 'sent', text: `「${progName(programId)}」を送りました（再生を確かめています）` });
            verifyPairs.push({ id, pid: programId });
          });
        } catch (e) {
          const msg = sendError(e);
          targets.forEach((id) => setLine({ key: id, label: nameOf(id), state: 'error', text: `送れませんでした：${msg}` }));
        }
      }
    }
    setRunning(false);
    setDone(true);
    if (verifyPairs.length > 0) {
      await verify(verifyPairs);
      setLines((ls) => ls.map((l) => (l.state === 'sent' ? { ...l, text: l.text.replace('（再生を確かめています）', '（まだ再生を確認できていません。少し待ってマシンの画面で確かめてください）') } : l)));
    }
  };

  const failedKeys = lines.filter((l) => l.state === 'error').map((l) => l.key);

  const restart = () => {
    setStepIdx(isStaff ? 1 : 0);
    setMode(null);
    setPicked([]);
    setPerMachine({});
    setProgramId('');
    setSync(null);
    setSaveGroup(false);
    setLines([]);
    setDone(false);
    setMadeGroup(null);
    load();
  };

  if (!ready || loading) return <Loading />;
  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorBox>{loadError}</ErrorBox>
        <Button variant="outline" onClick={load}>もう一度読み込む</Button>
      </div>
    );
  }

  const offlinePicked = pickedMachines.filter((m) => m.status !== 'online');
  const programOptions = (
    <>
      <option value="">映像を選んでください</option>
      {custPrograms.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </>
  );
  const selectCls = 'h-12 w-full rounded-[10px] border border-input bg-card px-3 text-base';

  return (
    <div className="flex w-full max-w-[960px] flex-col gap-6">
      <Stepper labels={steps.map((s) => STEP_LABEL[s])} step={stepIdx + 1} />
      <WizardCard>
        {step === 'customer' && (
          <>
            <StepTitle title="どの顧客のマシンですか？" lead="弊社（在庫・自社）のマシンも選べます。" />
            <SearchBox value={cq} onChange={setCq} placeholder="顧客の名前で探す" />
            <ListScroll>
              {[...customers]
                .filter((c) => machines.some((m) => m.customer_id === c.id))
                .sort((a, b) => (a.id === ownId ? -1 : b.id === ownId ? 1 : a.name.localeCompare(b.name, 'ja')))
                .filter((c) => !cq.trim() || (c.id === ownId ? '弊社 在庫 自社' : c.name).toLowerCase().includes(cq.trim().toLowerCase()))
                .map((c) => {
                  const ms = machines.filter((m) => m.customer_id === c.id);
                  return (
                    <ChoiceRow
                      key={c.id}
                      selected={customerId === c.id}
                      onClick={() => chooseCustomer(c.id)}
                      title={c.id === ownId ? '弊社（在庫・自社）' : c.name}
                      sub={`マシン ${ms.length}台（オンライン ${ms.filter((m) => m.status === 'online').length}台）`}
                    />
                  );
                })}
            </ListScroll>
            <WizardFooter onNext={next} nextLabel="次へ" nextDisabled={!customerId} />
          </>
        )}

        {step === 'mode' && (
          <>
            <p className="text-[15px] font-bold">
              {isStaff ? `${custName(customerId)}の` : 'この会社の'}マシン：{custMachines.length}台（オンライン {onlineIds.length}台）
            </p>
            <StepTitle title="どう流しますか？" />
            <div className="grid gap-3 sm:grid-cols-2">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => chooseMode(m.key)}
                  aria-pressed={mode === m.key}
                  className={cn(
                    'flex min-h-[112px] flex-col gap-1.5 rounded-[12px] p-5 text-left transition-colors',
                    mode === m.key ? 'border border-primary bg-primary/5 ring-1 ring-inset ring-primary' : 'border bg-card hover:bg-accent',
                  )}
                >
                  <span className="text-[17px] font-bold leading-snug">{m.title}</span>
                  <span className="text-sm leading-relaxed text-muted-foreground">{m.desc}</span>
                </button>
              ))}
            </div>
            <WizardFooter onBack={isStaff ? back : undefined} onNext={next} nextLabel="次へ" nextDisabled={!mode} />
          </>
        )}

        {step === 'machines' && (
          <>
            <StepTitle
              title={mode === 'stop' ? 'どのマシンの映像を止めますか？' : 'どのマシンで流しますか？'}
              lead="はじめは、オンラインのマシンをすべて選んでいます。オフラインのマシンには送れないので選べません（オンラインになってから、もう一度操作してください）。"
            />
            {dupGroups.size > 0 && (
              <div role="alert" className="flex flex-col gap-2 rounded-[10px] border border-warn/50 bg-warn/5 px-4 py-3.5 text-sm">
                <span className="font-bold leading-relaxed">同じマシンが複数のグループに入っています。連動再生がうまく動かない原因になります。</span>
                <ul className="flex flex-col gap-0.5">
                  {Array.from(dupGroups.entries()).map(([did, gs]) => (
                    <li key={did}>{nameOf(did)}：{gs.map((g) => g.name).join('／')}</li>
                  ))}
                </ul>
                <Link href="/device-groups" className="self-start font-bold underline underline-offset-4 hover:text-primary">グループ作成で直す →</Link>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[15px] font-bold" aria-live="polite">{picked.length}台を選択中</span>
              <Button variant="outline" onClick={() => setPicked(picked.length === onlineIds.length ? [] : onlineIds)}>
                {picked.length === onlineIds.length ? '選択を外す' : 'オンラインのマシンをすべて選ぶ'}
              </Button>
            </div>
            {custMachines.length === 0 ? (
              <EmptyBox>この顧客のマシンはまだありません。</EmptyBox>
            ) : (
              <ListScroll>
                {custMachines.map((m) => {
                  const online = m.status === 'online';
                  const on = picked.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!online}
                      onClick={() => togglePick(m.id)}
                      aria-pressed={on}
                      className={cn(
                        'flex min-h-[60px] w-full shrink-0 items-center gap-3.5 rounded-[10px] px-4 py-3.5 text-left transition-colors',
                        on ? 'border border-primary bg-primary/5 ring-1 ring-inset ring-primary' : 'border bg-card hover:bg-accent',
                        !online && 'cursor-not-allowed opacity-55 hover:bg-card',
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
                          {STATUS_TEXT[m.status] ?? ''}
                          {m.current_program_name ? `・いま：${m.current_program_name}` : ''}
                          {!online && '・オフラインのため選べません'}
                        </span>
                        {dupGroups.has(m.id) && <span className="text-[12px] font-bold text-warn">複数のグループ</span>}
                      </span>
                    </button>
                  );
                })}
              </ListScroll>
            )}
            {mode === 'wall' && picked.length > 0 && picked.length < 2 && <ErrorBox>ビデオウォールには2台以上を選んでください。</ErrorBox>}
            <WizardFooter
              onBack={back}
              onNext={goNextFromMachines}
              nextLabel={picked.length > 0 ? `${picked.length}台を選んで次へ` : 'マシンを選んでください'}
              nextDisabled={picked.length === 0 || offlinePicked.length > 0 || (mode === 'wall' && picked.length < 2)}
            />
          </>
        )}

        {step === 'sync' && (
          <>
            <StepTitle title="タイミングをそろえますか？" />
            <div className="flex flex-col gap-2">
              <ChoiceRow
                selected={sync === true}
                onClick={() => setSync(true)}
                title="そろえる（連動再生：同じ映像を同時に再生。1台を基準にします）"
                sub={
                  sameLinked
                    ? `同じマシンの組み合わせの連動グループ「${sameLinked.name}」があるので、それを使います。`
                    : !canCreateGroup
                      ? 'この顧客の連動グループを新しく作るときは、顧客一覧の「この顧客として操作する」から行ってください。'
                      : '連動再生のグループを作って流します。'
                }
              />
              <ChoiceRow selected={sync === false} onClick={() => setSync(false)} title="そろえない（それぞれで再生）" />
            </div>
            {sync === true && !sameLinked && !canCreateGroup && (
              <ErrorBox>
                この画面では、弊社以外の顧客の連動グループを新しく作れません。顧客一覧で「この顧客として操作する」を押してから、もう一度この手順を進めてください。
              </ErrorBox>
            )}
            {sync === true && (sameLinked || canCreateGroup) && (
              <div className="flex flex-col gap-4 rounded-xl border p-[18px]">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="p-master" className="text-sm font-bold">基準のマシン</label>
                  <select id="p-master" value={masterId} onChange={(e) => setMasterId(e.target.value)} className={selectCls}>
                    {pickedMachines.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <span className="text-[13px] text-muted-foreground">ほかのマシンは、このマシンに合わせて再生します。</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="p-rest" className="text-sm font-bold">つなぎの映像（任意）</label>
                  <select id="p-rest" value={restId} onChange={(e) => setRestId(e.target.value)} className={selectCls}>
                    <option value="">使わない（いつものつなぎの映像）</option>
                    {custPrograms.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                {!sameLinked && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="p-gname" className="text-sm font-bold">グループの名前</label>
                    <Input id="p-gname" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="h-12 text-base" />
                  </div>
                )}
              </div>
            )}
            <WizardFooter
              onBack={back}
              onNext={next}
              nextLabel="次へ"
              nextDisabled={sync === null || (sync === true && !sameLinked && (!canCreateGroup || !groupName.trim() || !masterId))}
            />
          </>
        )}

        {step === 'program' && (
          <>
            <StepTitle title="どの映像を流しますか？" lead="公開済みの映像だけを表示しています。" />
            {custPrograms.length === 0 ? (
              <EmptyBox>
                流せる映像がまだありません。<Link href="/programs" className="font-bold underline-offset-4 hover:underline">映像の画面</Link>で映像を作ってください。
              </EmptyBox>
            ) : mode === 'each' ? (
              <div className="flex flex-col gap-3">
                {pickedMachines.map((m) => (
                  <div key={m.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                    <label htmlFor={`pm-${m.id}`} className="text-[15px] font-bold sm:w-[220px] sm:shrink-0">{m.name}</label>
                    <select
                      id={`pm-${m.id}`}
                      value={perMachine[m.id] ?? ''}
                      onChange={(e) => setPerMachine((x) => ({ ...x, [m.id]: e.target.value }))}
                      className={selectCls}
                    >
                      {programOptions}
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              <ListScroll>
                {custPrograms.map((p) => (
                  <ChoiceRow key={p.id} selected={programId === p.id} onClick={() => setProgramId(p.id)} title={p.name} />
                ))}
              </ListScroll>
            )}
            {!(mode === 'same' && sync) && (
              <label className={cn('flex items-start gap-3 rounded-[10px] bg-secondary px-4 py-3 text-sm', !canCreateGroup && 'opacity-60')}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={saveGroup}
                  disabled={!canCreateGroup}
                  onChange={(e) => setSaveGroup(e.target.checked)}
                />
                <span className="flex flex-col gap-1.5">
                  <span className="font-bold">このマシンの組み合わせをグループとして保存する</span>
                  {!canCreateGroup ? (
                    <span className="text-muted-foreground">弊社以外の顧客のグループは、「この顧客として操作する」から作れます。</span>
                  ) : sameAny ? (
                    <span className="text-muted-foreground">同じ組み合わせのグループ「{sameAny.name}」がすでにあります（新しくは作りません）。</span>
                  ) : (
                    saveGroup && <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} aria-label="グループの名前" className="h-11" />
                  )}
                </span>
              </label>
            )}
            <WizardFooter
              onBack={back}
              onNext={next}
              nextLabel="次へ"
              nextDisabled={mode === 'each' ? pickedMachines.some((m) => !perMachine[m.id]) : !programId}
            />
          </>
        )}

        {step === 'wall' && (
          <>
            <StepTitle
              title="マシンをどう並べますか？"
              lead="ビデオウォールの分割と反映は、グループ作成の画面にある「ビデオウォール分割」で行います。ここでは、そのためのグループを用意します。"
            />
            <div className="grid max-w-[360px] grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="w-rows" className="text-sm font-bold">行（たて）</label>
                <Input id="w-rows" type="number" min={1} max={20} value={rows} onChange={(e) => setRows(Math.max(1, Number(e.target.value) || 1))} className="h-12 text-base" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="w-cols" className="text-sm font-bold">列（よこ）</label>
                <Input id="w-cols" type="number" min={1} max={20} value={cols} onChange={(e) => setCols(Math.max(1, Number(e.target.value) || 1))} className="h-12 text-base" />
              </div>
            </div>
            {rows * cols !== picked.length && (
              <ErrorBox>行 × 列（{rows * cols}）を、選んだマシンの台数（{picked.length}台）と同じにしてください。</ErrorBox>
            )}
            <div className="flex flex-col gap-1.5">
              <div className="text-sm font-bold">並び順（左上から右へ）</div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(cols, 6)}, minmax(0, 1fr))` }}>
                {pickedMachines.map((m, i) => (
                  <div key={m.id} className="rounded-[10px] border bg-secondary px-3 py-2.5 text-sm">
                    <div className="text-[12px] text-muted-foreground">{Math.floor(i / cols) + 1}行{(i % cols) + 1}列</div>
                    <div className="truncate font-bold">{m.name}</div>
                  </div>
                ))}
              </div>
              <span className="text-[13px] text-muted-foreground">実際の割り当ては、分割したあとに「ビデオウォール分割」の画面で1枚ずつ選べます。</span>
            </div>
            {!canCreateGroup && !sameAny && (
              <ErrorBox>弊社以外の顧客のグループは、この画面では作れません。顧客一覧の「この顧客として操作する」から進めてください。</ErrorBox>
            )}
            {sameAny && <EmptyBox>同じ組み合わせのグループ「{sameAny.name}」があるので、それを使います。</EmptyBox>}
            {!sameAny && canCreateGroup && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="w-name" className="text-sm font-bold">グループの名前</label>
                <Input id="w-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} className="h-12 text-base" />
              </div>
            )}
            <WizardFooter onBack={back} onNext={next} nextLabel="次へ" nextDisabled={rows * cols !== picked.length || (!canCreateGroup && !sameAny)} />
          </>
        )}

        {step === 'confirm' && !done && !running && (
          <>
            <StepTitle title={mode === 'stop' ? 'この内容で映像を止めます' : 'この内容で進めます'} lead="よければ下のボタンを押してください。" />
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 rounded-xl border p-[18px] text-[15px] sm:grid-cols-[160px_minmax(0,1fr)]">
              {isStaff && (<><dt className="text-muted-foreground">顧客</dt><dd className="font-bold">{custName(customerId)}</dd></>)}
              <dt className="text-muted-foreground">流し方</dt>
              <dd className="font-bold">{MODES.find((m) => m.key === mode)?.title}</dd>
              <dt className="text-muted-foreground">マシン</dt>
              <dd className="font-bold">{picked.length}台（{pickedMachines.map((m) => m.name).join('、')}）</dd>
              {mode === 'same' && (
                <>
                  <dt className="text-muted-foreground">映像</dt>
                  <dd className="font-bold">{progName(programId)}</dd>
                  <dt className="text-muted-foreground">タイミング</dt>
                  <dd className="font-bold">
                    {sync ? `そろえる（基準のマシン：${nameOf(masterId)}）` : 'そろえない'}
                  </dd>
                </>
              )}
              {mode === 'each' && (
                <>
                  <dt className="text-muted-foreground">映像</dt>
                  <dd className="flex flex-col gap-0.5 font-bold">
                    {pickedMachines.map((m) => (
                      <span key={m.id}>{m.name} → {progName(perMachine[m.id])}</span>
                    ))}
                  </dd>
                </>
              )}
              {mode === 'wall' && (
                <>
                  <dt className="text-muted-foreground">並べ方</dt>
                  <dd className="font-bold">{rows}行 × {cols}列</dd>
                </>
              )}
            </dl>
            {mode === 'stop' && (
              <EmptyBox>手動で流している映像を止めて、いつもの流し方（計画配信）に戻します。</EmptyBox>
            )}
            {mode === 'wall' && (
              <EmptyBox>
                {sameAny ? `グループ「${sameAny.name}」を使います。` : `グループ「${saveName}」を作ります。`}
                そのあと、グループ作成の画面で分割と反映を行います（次の画面で手順を案内します）。
              </EmptyBox>
            )}
            <WizardFooter
              onBack={back}
              onNext={() => run()}
              nextLabel={mode === 'stop' ? '映像を止める' : mode === 'wall' ? 'グループを用意する' : '映像を流す'}
            />
          </>
        )}

        {step === 'confirm' && (running || done) && (
          <div className="flex flex-col gap-[18px]">
            {running ? (
              <div className="flex items-center gap-3 rounded-[10px] bg-secondary px-[18px] py-4 text-[15px] font-bold" aria-live="polite">
                <Loader2 className="h-5 w-5 animate-spin" />
                送っています…（この画面を閉じないでください）
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                {failedKeys.length === 0 && <DoneMark />}
                <h2 className="text-[22px] font-bold">
                  {failedKeys.length === 0
                    ? mode === 'stop' ? '映像を止めました' : mode === 'wall' ? 'グループを用意しました' : '映像を送りました'
                    : 'うまくいかなかったものがあります'}
                </h2>
              </div>
            )}
            <ul className="flex flex-col divide-y rounded-[10px] border">
              {lines.map((l) => (
                <li key={l.key} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span className="text-[15px] font-bold">{l.label}</span>
                  <span
                    className={cn(
                      'text-sm',
                      l.state === 'ok' ? 'font-bold text-ok' : l.state === 'error' ? 'font-bold text-destructive' : 'text-foreground/80',
                    )}
                  >
                    {l.text}
                  </span>
                </li>
              ))}
            </ul>
            {done && mode === 'wall' && madeGroup && (
              <div className="flex flex-col gap-2 rounded-xl border p-[18px] text-[15px] leading-relaxed">
                <div className="font-bold">このあとの手順</div>
                <ol className="list-decimal pl-5">
                  <li>下の「グループ作成を開く」を押す</li>
                  <li>グループ「{madeGroup.name}」の「編集」を押す</li>
                  <li>「ビデオウォール分割」にチェックを入れ、元の映像を選び、行に {rows}、列に {cols} を入れて「作成」</li>
                  <li>「分割実行」が終わったら、1枚ずつマシンを選んで「実機に反映」</li>
                </ol>
              </div>
            )}
            {done && (
              <div className="flex flex-wrap gap-2.5">
                {failedKeys.length > 0 && (
                  <Button className="h-12 px-6 text-[15px]" onClick={() => run(failedKeys.includes('group') ? undefined : failedKeys)}>
                    うまくいかなかったものだけもう一度試す
                  </Button>
                )}
                {mode === 'wall' ? (
                  <Button asChild className="h-12 px-6 text-[15px]">
                    <Link href="/device-groups">グループ作成を開く</Link>
                  </Button>
                ) : (
                  <Button asChild variant="outline" className="h-12 px-6 text-[15px]">
                    <Link href={picked.length === 1 ? `/devices/${encodeURIComponent(picked[0])}` : '/devices'}>マシンの画面を開く</Link>
                  </Button>
                )}
                {mode !== 'wall' && madeGroup && (
                  <Button asChild variant="outline" className="h-12 px-6 text-[15px]">
                    <Link href="/device-groups">グループ作成を開く</Link>
                  </Button>
                )}
                <Button variant="outline" className="h-12 px-6 text-[15px]" onClick={restart}>
                  続けて別の操作をする
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
