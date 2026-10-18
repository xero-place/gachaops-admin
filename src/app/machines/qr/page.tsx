'use client';

// S262c: キャッシュレス決済をON / OFFする。
// 1. マシンを選ぶ → 2. そのマシンの画面（「価格」タブ）で切り替える。
// 切り替えそのものは既存のマシン詳細画面の仕組みを使う（ここでは保存しない）。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { StaffOnly } from '@/components/domain/staff-only';
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
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/signup-admin';

interface MachineRow {
  id: string;
  name: string;
  serial: string;
  status: string;
  customer_name?: string;
  store_name?: string;
  qr_enabled?: boolean;
}

export default function QrPickPage() {
  return (
    <AppShell title="キャッシュレス決済をON / OFFする" back={{ href: '/', label: 'ホームに戻る' }}>
      <StaffOnly>
        <QrPick />
      </StaffOnly>
    </AppShell>
  );
}

function QrPick() {
  const router = useRouter();
  const [rows, setRows] = useState<MachineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<MachineRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ items?: MachineRow[] } | MachineRow[]>('/devices?limit=200');
      setRows(Array.isArray(r) ? r : (r.items ?? []));
    } catch (e) {
      setError(friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((m) => [m.name, m.serial, m.customer_name ?? '', m.store_name ?? ''].some((v) => v.toLowerCase().includes(s)));
  }, [rows, q]);

  const open = () => {
    if (picked) router.push(`/devices/${encodeURIComponent(picked.id)}?tab=settings`);
  };

  return (
    <div className="flex w-full max-w-[960px] flex-col gap-6">
      <Stepper labels={['マシンを選ぶ', 'マシンの画面で切り替える']} step={1} />
      <WizardCard>
        <StepTitle
          title="どのマシンのキャッシュレス決済を切り替えますか？"
          lead="マシンを選ぶと、そのマシンの「価格」の画面が開きます。「QRコード決済」の欄で切り替えてください（切り替えるとすぐに反映されます）。"
        />
        <SearchBox value={q} onChange={setQ} placeholder="マシンの名前・番号・お客様の名前で探す" />
        {loading ? (
          <Loading />
        ) : error ? (
          <div className="flex flex-col items-start gap-3">
            <ErrorBox>{error}</ErrorBox>
            <Button variant="outline" onClick={load}>もう一度読み込む</Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyBox>{q ? `「${q}」に当てはまるマシンはありません。` : 'マシンがありません。'}</EmptyBox>
        ) : (
          <ListScroll>
            {filtered.map((m) => (
              <ChoiceRow
                key={m.id}
                selected={picked?.id === m.id}
                onClick={() => setPicked(m)}
                title={m.name}
                sub={
                  <>
                    <span className={m.qr_enabled ? 'font-bold text-foreground' : ''}>
                      QR決済：{m.qr_enabled ? '受け付けている' : '受け付けていない'}
                    </span>
                    {`・${m.customer_name ? m.customer_name : ''}${m.store_name ? `（${m.store_name}）` : ''}`}
                  </>
                }
                right={STATUS_TEXT[m.status] ?? ''}
              />
            ))}
          </ListScroll>
        )}
        <WizardFooter onNext={open} nextLabel="このマシンの画面を開く" nextDisabled={!picked} />
      </WizardCard>
    </div>
  );
}
