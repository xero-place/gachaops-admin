'use client';

// S262b: 「登録待ちのお客様」— 登録リンクは作ったが、まだ本人が登録していない（または承認前の）お客様。
// 弊社が先に準備する・リンクを作り直す・マシンを追加する、ができる。
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Link2, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AssignDevicesDialog,
  PrepareButton,
  ReissueInviteDialog,
} from '@/components/domain/customer-prep';
import { fmtDate, fmtDateTime, friendlyError, signupAdmin, type PendingCustomer } from '@/lib/signup-admin';

function statusLine(c: PendingCustomer): { text: string; strong: boolean } {
  if (c.signup_request?.status === 'pending_approval') return { text: 'お客様の登録が済みました。承認を待っています。', strong: true };
  if (c.active_invite) return { text: `登録リンクを送付済み（${fmtDateTime(c.active_invite.expires_at)} まで有効）`, strong: false };
  return { text: '有効な登録リンクがありません。作り直して送ってください。', strong: true };
}

export function PendingCustomersSection() {
  const [items, setItems] = useState<PendingCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<PendingCustomer | null>(null);
  const [reissueFor, setReissueFor] = useState<PendingCustomer | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await signupAdmin.pendingCustomers());
    } catch (e) {
      setError(friendlyError(e, 'load'));
      setItems([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <section aria-labelledby="pending-customers" className="flex flex-col gap-4 rounded-card border bg-card p-5 sm:p-[22px]">
      <div className="flex flex-col gap-1">
        <h2 id="pending-customers" className="text-[17px] font-bold">登録待ちのお客様</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          登録リンクを作ったお客様のうち、まだご本人が使い始めていないお客様です。登録の前でも、このお客様として映像や価格を準備できます。
        </p>
      </div>

      {notice && (
        <div role="status" className="rounded-[10px] border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">
          {notice}
        </div>
      )}

      {items === null ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
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
      ) : items.length === 0 ? (
        <div className="rounded-[10px] bg-secondary p-4 text-sm text-foreground/80">登録待ちのお客様はいません。</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => {
            const st = statusLine(c);
            return (
              <li key={c.customer_id} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border p-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="text-base font-bold">{c.name}</div>
                  <div className="text-[13px] text-muted-foreground">
                    作成 {fmtDate(c.created_at)}・マシン {c.device_count}台
                    {c.devices.length > 0 && `（${c.devices.map((d) => d.name).join('、')}）`}
                  </div>
                  <div className={st.strong ? 'text-[13px] font-bold text-foreground' : 'text-[13px] text-foreground/80'}>
                    {st.text}
                    {c.signup_request?.status === 'pending_approval' && (
                      <Link
                        href={`/customers/invite?request=${encodeURIComponent(c.signup_request.id)}`}
                        className="ml-2 font-bold text-primary underline-offset-4 hover:underline"
                      >
                        承認する →
                      </Link>
                    )}
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                  <PrepareButton customerId={c.customer_id} customerName={c.name} className="col-span-2" />
                  <Button variant="outline" className="col-span-2" onClick={() => setReissueFor(c)}>
                    <Link2 />
                    登録リンクを作り直す
                  </Button>
                  <Button variant="outline" className="col-span-2" onClick={() => setAssignFor(c)}>
                    <Plus />
                    マシンを追加する
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {assignFor && (
        <AssignDevicesDialog
          customerId={assignFor.customer_id}
          customerName={assignFor.name}
          onClose={() => setAssignFor(null)}
          onAssigned={(n) => {
            setNotice(`${assignFor.name} に${n}台のマシンをお渡ししました。`);
            setAssignFor(null);
            load();
          }}
        />
      )}
      {reissueFor && (
        <ReissueInviteDialog
          customerId={reissueFor.customer_id}
          customerName={reissueFor.name}
          onClose={(changed) => {
            setReissueFor(null);
            if (changed) load();
          }}
        />
      )}
    </section>
  );
}
