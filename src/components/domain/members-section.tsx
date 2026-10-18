'use client';

// S262: 設定 >「メンバー」。顧客の管理者が、一緒に使う人を招待・取り消しする。
// 弊社スタッフは顧客を選んで同じ操作ができる（?customer_id=）。
import { useCallback, useEffect, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  ROLE_LABELS,
  fmtDate,
  fmtDateTime,
  friendlyError,
  membersApi,
  roleLabel,
  type Member,
  type PendingMemberInvite,
} from '@/lib/signup-admin';

const GRANTABLE_ROLES = ['lv3_operator', 'lv4_viewer', 'lv2_admin'] as const;
const DEFAULT_ROLE = 'lv3_operator';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MembersSection({ isStaff }: { isStaff: boolean }) {
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [customerId, setCustomerId] = useState<string>('');
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<PendingMemberInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (!isStaff) return;
    api
      .get<{ items?: { id: string; name: string }[] } | { id: string; name: string }[]>('/customers?limit=200')
      .then((r) => setCustomers(Array.isArray(r) ? r : (r.items ?? [])))
      .catch(() => setCustomers([]));
  }, [isStaff]);

  const target = isStaff ? customerId || undefined : undefined;
  const canLoad = !isStaff || !!customerId;

  const load = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError(null);
    try {
      const r = await membersApi.list(target);
      setMembers(r.items ?? []);
      setPending(r.pending_invites ?? []);
    } catch (e) {
      setError(friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, [canLoad, target]);

  useEffect(() => {
    setMembers([]);
    setPending([]);
    setNotice(null);
    load();
  }, [load]);

  const revoke = async (inv: PendingMemberInvite) => {
    if (!window.confirm(`${inv.email} への招待を取り消します。届いたメールのリンクは使えなくなります。よろしいですか？`)) return;
    setRevoking(inv.id);
    try {
      await membersApi.revoke(inv.id, target);
      setNotice(`${inv.email} への招待を取り消しました。`);
      load();
    } catch (e) {
      window.alert(friendlyError(e, 'revoke'));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <section id="members" className="flex scroll-mt-24 flex-col gap-4 rounded-card border bg-card p-5 sm:p-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold">メンバー</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            一緒に管理画面を使う人を追加できます。招待した人にはメールが届き、本人がパスワードを決めるとすぐに使えるようになります。
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} disabled={!canLoad}>
          <UserPlus />
          メンバーを追加する
        </Button>
      </div>

      {isStaff && (
        <div className="flex flex-col gap-1.5 sm:max-w-[420px]">
          <label htmlFor="members-customer" className="text-sm font-bold">
            顧客を選ぶ
          </label>
          <select
            id="members-customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="h-11 rounded-[10px] border border-input bg-card px-3 text-[15px]"
          >
            <option value="">選んでください</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {notice && (
        <div role="status" className="rounded-[10px] border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">
          {notice}
        </div>
      )}

      {!canLoad ? null : loading && members.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          読み込んでいます…
        </div>
      ) : error ? (
        <div className="flex flex-col items-start gap-3">
          <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/5 p-4 text-sm font-bold text-destructive">
            {error}
          </div>
          <Button variant="outline" onClick={load}>
            もう一度読み込む
          </Button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col divide-y rounded-[10px] border">
            {members.length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">メンバーはまだいません。</li>
            ) : (
              members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-bold">{m.name || m.email}</span>
                    <span className="break-all text-[13px] text-muted-foreground">{m.email}</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 text-[13px] text-muted-foreground">
                    <span className="font-bold text-foreground">{roleLabel(m.role)}</span>
                    <span>最後のログイン {m.last_login_at ? fmtDateTime(m.last_login_at) : 'まだありません'}</span>
                  </div>
                </li>
              ))
            )}
          </ul>

          {pending.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-sm font-bold">招待中（まだ登録していない人）</div>
              <ul className="flex flex-col divide-y rounded-[10px] border">
                {pending.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="break-all font-bold">{p.email}</span>
                      <span className="text-[13px] text-muted-foreground">
                        {roleLabel(p.role)}・リンクの有効期限 {fmtDate(p.expires_at)}
                      </span>
                    </div>
                    <Button variant="outline" onClick={() => revoke(p)} disabled={revoking === p.id}>
                      {revoking === p.id && <Loader2 className="animate-spin" />}
                      招待を取り消す
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {inviteOpen && (
        <InviteMemberDialog
          customerId={target}
          onClose={() => setInviteOpen(false)}
          onInvited={(email) => {
            setInviteOpen(false);
            setNotice(`${email} に招待メールを送りました。7日以内にメールのリンクから登録すると、使えるようになります。`);
            load();
          }}
        />
      )}
    </section>
  );
}

function InviteMemberDialog({
  customerId,
  onClose,
  onInvited,
}: {
  customerId?: string;
  onClose: () => void;
  onInvited: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>(DEFAULT_ROLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    const em = email.trim();
    if (!em) return setError('メールアドレスを入力してください。');
    if (!EMAIL_RE.test(em)) return setError('メールアドレスの形が正しくありません（例：yamada@example.co.jp）。');
    setBusy(true);
    try {
      await membersApi.invite({ email: em, name: name.trim() || undefined, role }, customerId);
      onInvited(em);
    } catch (e) {
      setError(friendlyError(e, 'member'));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-xl">
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>メンバーを追加する</DialogTitle>
            <DialogDescription>
              入力したメールアドレスに招待メールが届きます。本人がメールのリンクからパスワードを決めると、すぐに使えるようになります。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mem-email" className="text-sm font-bold">メールアドレス（必須）</label>
            <Input id="mem-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="例：yamada@example.co.jp" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mem-name" className="text-sm font-bold">お名前（任意）</label>
            <Input id="mem-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：山田 太郎" />
            <div className="text-[13px] text-muted-foreground">本人が登録するときに直せます。</div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-bold">できること</legend>
            {GRANTABLE_ROLES.map((r) => {
              const on = role === r;
              return (
                <label
                  key={r}
                  className={cn(
                    'flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[10px] px-4 py-3',
                    on ? 'border-2 border-foreground' : 'border hover:bg-accent',
                  )}
                >
                  <input
                    type="radio"
                    name="mem-role"
                    value={r}
                    checked={on}
                    onChange={() => setRole(r)}
                    className="h-4 w-4 accent-[#111827]"
                  />
                  <span className="flex flex-col">
                    <span className="font-bold">{ROLE_LABELS[r].label}</span>
                    <span className="text-[13px] text-muted-foreground">{ROLE_LABELS[r].desc}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {error && (
            <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/5 p-3 text-sm font-bold text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              やめる
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              招待メールを送る
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
