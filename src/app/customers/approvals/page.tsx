'use client';

// S262: 承認待ちのお客様（登録リンクから申し込まれたもの）と、発行済みの登録リンク。
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { StaffOnly } from '@/components/domain/staff-only';
import { RejectDialog } from '@/components/domain/signup-approval';
import {
  fmtDateTime,
  friendlyError,
  signupAdmin,
  type CustomerInvite,
  type SignupRequest,
} from '@/lib/signup-admin';

export default function ApprovalsPage() {
  return (
    <AppShell title="承認待ちのお客様" back={{ href: '/customers', label: 'お客様の一覧に戻る' }}>
      <StaffOnly>
        <Approvals />
      </StaffOnly>
    </AppShell>
  );
}

function Approvals() {
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SignupRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [invites, setInvites] = useState<CustomerInvite[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await signupAdmin.listRequests('pending_approval'));
    } catch (e) {
      setError(friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInvites = useCallback(async () => {
    setInvLoading(true);
    setInvError(null);
    try {
      setInvites(await signupAdmin.listInvites('active'));
    } catch (e) {
      setInvError(friendlyError(e, 'load'));
    } finally {
      setInvLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadInvites();
  }, [load, loadInvites]);

  const revoke = async (inv: CustomerInvite) => {
    if (!window.confirm(`「${inv.company_name_hint}」向けの登録リンクを取り消します。取り消したリンクは使えなくなります。よろしいですか？`)) return;
    setRevoking(inv.id);
    try {
      await signupAdmin.revokeInvite(inv.id);
      setNotice(`「${inv.company_name_hint}」向けの登録リンクを取り消しました。`);
      loadInvites();
    } catch (e) {
      window.alert(friendlyError(e, 'revoke'));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="flex w-full max-w-[1000px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-muted-foreground">
          登録リンクから申し込まれたお客様です。内容を確かめて、承認するかお断りするかを決めてください。
        </p>
        <Button asChild>
          <Link href="/customers/invite">新しいお客様の管理画面を発行する</Link>
        </Button>
      </div>

      {notice && (
        <div role="status" className="rounded-[10px] border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">
          {notice}
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-card border bg-card p-5 sm:p-[22px]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold">承認待ち</h2>
          <Button variant="ghost" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            読み込み直す
          </Button>
        </div>
        {loading && requests.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            読み込んでいます…
          </div>
        ) : error ? (
          <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/5 p-4 text-sm font-bold text-destructive">
            {error}
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-[10px] bg-secondary p-4 text-sm text-foreground/80">
            承認待ちのお客様はいません。
          </div>
        ) : (
          <ul className="flex flex-col divide-y">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="text-base font-bold">{r.company_name}</div>
                  <div className="break-all text-sm text-muted-foreground">
                    {r.contact_name}・{r.email}
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    申し込み {fmtDateTime(r.verified_at ?? r.created_at)}
                  </div>
                </div>
                <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRejectTarget(r)}>
                    お断りする
                  </Button>
                  <Button asChild variant="secondary" className="w-full sm:w-auto">
                    <Link href={`/customers/invite?request=${encodeURIComponent(r.id)}`}>
                      内容を確かめて承認する
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-card border bg-card p-5 sm:p-[22px]">
        <div>
          <h2 className="text-[17px] font-bold">まだ使われていない登録リンク</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            送ったけれど、まだお客様が登録していないリンクです。間違えて作ったときや、送り先を変えたいときは取り消してください。
          </p>
        </div>
        {invLoading && invites.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            読み込んでいます…
          </div>
        ) : invError ? (
          <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/5 p-4 text-sm font-bold text-destructive">
            {invError}
          </div>
        ) : invites.length === 0 ? (
          <div className="rounded-[10px] bg-secondary p-4 text-sm text-foreground/80">
            まだ使われていない登録リンクはありません。
          </div>
        ) : (
          <ul className="flex flex-col divide-y">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="font-bold">{inv.company_name_hint}</div>
                  <div className="text-[13px] text-muted-foreground">
                    作成 {fmtDateTime(inv.created_at)}
                    {inv.created_by_name ? `（${inv.created_by_name}）` : ''}・有効期限 {fmtDateTime(inv.expires_at)}
                  </div>
                </div>
                <Button variant="outline" onClick={() => revoke(inv)} disabled={revoking === inv.id}>
                  {revoking === inv.id && <Loader2 className="animate-spin" />}
                  取り消す
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rejectTarget && (
        <RejectDialog
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onRejected={() => {
            setNotice(`${rejectTarget.company_name} の申し込みをお断りしました。`);
            setRejectTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}
