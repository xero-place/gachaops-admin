'use client';

// S262b: お客様にマシンを追加する（ホームの「お客様にマシンを追加する」から）。
// 1. お客様を選ぶ（登録待ちのお客様も含む） → 2. 在庫のマシンを選んで移す（確認の説明つき）
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StaffOnly } from '@/components/domain/staff-only';
import { AssignDevicesDialog } from '@/components/domain/customer-prep';
import { api } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';
import { friendlyError, signupAdmin, type PendingCustomer } from '@/lib/signup-admin';

interface Row {
  id: string;
  name: string;
  sub: string;
}

export default function AssignMachinesPage() {
  return (
    <AppShell title="お客様にマシンを追加する" back={{ href: '/', label: 'ホームに戻る' }}>
      <StaffOnly>
        <AssignMachines />
      </StaffOnly>
    </AppShell>
  );
}

function AssignMachines() {
  const [pending, setPending] = useState<Row[]>([]);
  const [active, setActive] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Row | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pc, cs] = await Promise.all([
        signupAdmin.pendingCustomers().catch(() => [] as PendingCustomer[]),
        api.get<{ items?: { id: string; name: string; device_count?: number }[] } | { id: string; name: string; device_count?: number }[]>(
          '/customers?limit=200',
        ),
      ]);
      const pendingIds = new Set(pc.map((c) => c.customer_id));
      setPending(pc.map((c) => ({ id: c.customer_id, name: c.name, sub: `マシン ${c.device_count}台・${c.signup_request?.status === 'pending_approval' ? '登録済み・承認待ち' : 'まだ登録していません'}` })));
      const list = Array.isArray(cs) ? cs : (cs.items ?? []);
      // 弊社（在庫）の会社自身は移し先にできない（サーバーも 409 stock_tenant で拒否する）
      const ownId = tokenStore.getUser()?.customer_id;
      setActive(
        list
          .filter((c) => !pendingIds.has(c.id) && c.id !== ownId)
          .map((c) => ({ id: c.id, name: c.name, sub: typeof c.device_count === 'number' ? `マシン ${c.device_count}台` : '' })),
      );
    } catch (e) {
      setError(friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const match = useCallback(
    (r: Row) => !query.trim() || r.name.toLowerCase().includes(query.trim().toLowerCase()),
    [query],
  );
  const fp = useMemo(() => pending.filter(match), [pending, match]);
  const fa = useMemo(() => active.filter(match), [active, match]);

  const group = (title: string, rows: Row[]) => (
    <section className="flex flex-col gap-2">
      <h2 className="text-[15px] font-bold">{title}</h2>
      {rows.length === 0 ? (
        <div className="rounded-[10px] bg-secondary px-4 py-3 text-sm text-foreground/80">該当するお客様はいません。</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => { setNotice(null); setTarget(r); }}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 rounded-[12px] border bg-card px-5 py-3.5 text-left transition-colors hover:bg-accent"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-base font-bold">{r.name}</span>
                  {r.sub && <span className="text-[13px] text-muted-foreground">{r.sub}</span>}
                </span>
                <span className="shrink-0 text-sm font-bold">選ぶ →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-5">
      <p className="text-[15px] text-muted-foreground">
        マシンを渡すお客様を選んでください。次の画面で、在庫のマシンから選びます。
      </p>
      {notice && (
        <div role="status" className="rounded-[10px] border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">
          {notice}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="お客様の名前で探す" className="pl-10" aria-label="お客様を探す" />
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          読み込んでいます…
        </div>
      ) : error ? (
        <div className="flex flex-col items-start gap-3">
          <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive">
            {error}
          </div>
          <Button variant="outline" onClick={load}>もう一度読み込む</Button>
        </div>
      ) : (
        <>
          {group('登録待ちのお客様', fp)}
          {group('ご利用中のお客様', fa)}
        </>
      )}
      {target && (
        <AssignDevicesDialog
          customerId={target.id}
          customerName={target.name}
          onClose={() => setTarget(null)}
          onAssigned={(n) => {
            setNotice(`${target.name} に${n}台のマシンをお渡ししました。`);
            setTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}
