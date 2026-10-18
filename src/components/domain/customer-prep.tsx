'use client';

// S262b: お客様の登録前に、弊社がマシンを渡して画面を準備するための部品。
// ・OwnershipNotice      … マシンを移すときに必ず出す説明（売上の持ち主が変わること）
// ・InviteLinkPanel      … 登録リンクと、お客様に送る文章（コピー用）
// ・AssignDevicesDialog  … 在庫のマシンを選んでお客様に移す
// ・ReissueInviteDialog  … 登録リンクを作り直す
// ・PrepareButton        … 「このお客様として準備する」
import { useCallback, useEffect, useState } from 'react';
import { Loader2, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CopyButton } from '@/components/domain/copy-button';
import { StockDevicePicker } from '@/components/domain/signup-approval';
import {
  fmtDateTime,
  friendlyError,
  signupAdmin,
  startPrepareSession,
  type CreatedInvite,
  type DeviceRef,
  type StockDevice,
} from '@/lib/signup-admin';

export const OWNERSHIP_SENTENCE =
  'この時点でマシンはこのお客様のものになり、これ以降の売上はこのお客様の分になります。これまでの売上の記録はお客様には見えません。';

export function OwnershipNotice({ className }: { className?: string }) {
  return (
    <div
      className={
        'rounded-[10px] border border-warn/40 bg-warn/5 px-4 py-3.5 text-sm font-bold leading-relaxed text-foreground ' +
        (className ?? '')
      }
    >
      {OWNERSHIP_SENTENCE}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive">
      {children}
    </div>
  );
}

export function inviteMessageText(url: string) {
  return [
    'GTCHA X 管理画面のご登録をお願いいたします。',
    '下のリンクを開き、お使いになるメールアドレスとパスワードをご自身で決めてご登録ください。',
    '弊社で確認が済みしだい、ご登録のメールアドレスにお知らせが届き、すぐにお使いいただけます。',
    '（リンクの有効期限：7日間）',
    url,
  ].join('\n');
}

export function InviteLinkPanel({ invite }: { invite: CreatedInvite }) {
  const msg = inviteMessageText(invite.url);
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0 flex-[1_1_320px] break-all rounded-[10px] border border-input bg-secondary px-3.5 py-3 text-[15px]">
          {invite.url}
        </div>
        <CopyButton text={invite.url} label="リンクをコピー" className="h-12" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-sm font-bold">お客様に送る文章</div>
        <div className="whitespace-pre-line break-all rounded-[10px] border px-[18px] py-4 text-sm leading-[1.9] text-foreground/80">
          {msg}
        </div>
      </div>
      <CopyButton text={msg} label="文章ごとコピー" className="self-start" />
      <div className="rounded-[10px] bg-secondary px-[18px] py-4 text-sm leading-relaxed text-foreground/80">
        「{invite.company_name_hint}」向けのリンクです。有効期限は {fmtDateTime(invite.expires_at)} までです。
        <br />
        このリンクはこの画面でしか表示されません。閉じる前にコピーして送ってください。
      </div>
    </div>
  );
}

/** お客様にお渡し済みのマシン（読み取りのみ） */
export function AssignedDeviceList({ devices, title = 'すでにお渡ししているマシン' }: { devices: DeviceRef[]; title?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[15px] font-bold">
        {title}（{devices.length}台）
      </div>
      {devices.length === 0 ? (
        <div className="rounded-[10px] bg-secondary px-4 py-3 text-sm text-foreground/80">まだありません。</div>
      ) : (
        <ul className="flex flex-col divide-y rounded-[10px] border">
          {devices.map((d) => (
            <li key={d.id} className="px-4 py-3 text-[15px] font-bold">
              {d.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PrepareButton({
  customerId,
  customerName,
  variant = 'outline',
  className,
}: {
  customerId: string;
  customerName: string;
  variant?: 'default' | 'outline';
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await startPrepareSession(customerId, customerName);
      window.location.href = '/';
    } catch (e) {
      window.alert('このお客様の画面を開けませんでした。' + friendlyError(e, 'prepare'));
      setBusy(false);
    }
  };
  return (
    <Button variant={variant} className={className} onClick={run} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <UserCog />}
      このお客様として準備する
    </Button>
  );
}

export function AssignDevicesDialog({
  customerId,
  customerName,
  onClose,
  onAssigned,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onAssigned: (count: number, names: string[]) => void;
}) {
  const [devices, setDevices] = useState<StockDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setDevices(await signupAdmin.stockDevices());
    } catch (e) {
      setLoadError('割り当てられるマシンを読み込めませんでした。' + friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async () => {
    if (picked.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await signupAdmin.assignDevices(customerId, picked);
      const ids = r?.assigned_device_ids ?? picked;
      onAssigned(ids.length, devices.filter((d) => ids.includes(d.id)).map((d) => d.name));
    } catch (e) {
      setError(friendlyError(e, 'assign'));
      setBusy(false);
      load();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customerName} にマシンを移す</DialogTitle>
          <DialogDescription>移すマシンを選んでください。</DialogDescription>
        </DialogHeader>
        <StockDevicePicker
          devices={devices}
          loading={loading}
          error={loadError}
          onReload={load}
          selected={picked}
          onChange={setPicked}
          title="移すマシンを選ぶ"
          description="まだどのお客様にも割り当てていないマシンだけを表示しています。"
        />
        <OwnershipNotice />
        {error && <ErrorBox>{error}</ErrorBox>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            やめる
          </Button>
          <Button onClick={run} disabled={busy || picked.length === 0}>
            {busy && <Loader2 className="animate-spin" />}
            {picked.length > 0 ? `${picked.length}台をこのお客様に移す` : 'マシンを選んでください'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReissueInviteDialog({
  customerId,
  customerName,
  onClose,
}: {
  customerId: string;
  customerName: string;
  onClose: (changed: boolean) => void;
}) {
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setInvite(await signupAdmin.reissueInvite(customerId));
    } catch (e) {
      setError(friendlyError(e, 'invite'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(!!invite); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customerName} の登録リンクを作り直す</DialogTitle>
          <DialogDescription>
            {invite
              ? '新しいリンクができました。お客様に送ってください。'
              : '新しいリンクを作ると、前に送ったリンクは使えなくなります。お渡し済みのマシンと準備した内容はそのまま残ります。'}
          </DialogDescription>
        </DialogHeader>
        {invite && <InviteLinkPanel invite={invite} />}
        {error && <ErrorBox>{error}</ErrorBox>}
        <DialogFooter className="gap-2">
          {invite ? (
            <Button variant="outline" onClick={() => onClose(true)}>
              閉じる
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onClose(false)} disabled={busy}>
                やめる
              </Button>
              <Button onClick={run} disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                新しいリンクを作る
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
