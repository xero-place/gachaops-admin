'use client';

// S262: 承認まわりの部品（登録内容の表示・お渡しするマシンの選択・お断りダイアログ）。
import { useMemo, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  fmtDate,
  fmtDateTime,
  friendlyError,
  signupAdmin,
  type SignupRequest,
  type StockDevice,
} from '@/lib/signup-admin';

export function RequestSummary({ request }: { request: SignupRequest }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-[18px]">
      <div className="text-sm font-bold">登録された内容</div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 text-[15px] sm:grid-cols-[140px_minmax(0,1fr)]">
        <dt className="text-muted-foreground">会社名</dt>
        <dd className="font-bold">{request.company_name}</dd>
        <dt className="text-muted-foreground">ご担当者</dt>
        <dd className="font-bold">{request.contact_name}</dd>
        <dt className="text-muted-foreground">メールアドレス</dt>
        <dd className="break-all font-bold">
          {request.email}
          {request.verified_at ? '（本人確認済み）' : ''}
        </dd>
        <dt className="text-muted-foreground">申し込み日時</dt>
        <dd>{fmtDateTime(request.verified_at ?? request.created_at)}</dd>
      </dl>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  online: 'つながっています',
  offline: 'つながっていません',
  maintenance: 'メンテナンス中',
  never_connected: 'まだつないでいません',
};

export function StockDevicePicker({
  devices,
  loading,
  error,
  onReload,
  selected,
  onChange,
  title = 'お渡しするマシンを選ぶ',
  description = 'まだどの顧客にも割り当てていないマシンだけを表示しています。選ばずに承認して、後から追加することもできます。',
  alwaysSearch = false,
}: {
  devices: StockDevice[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  selected: string[];
  onChange: (ids: string[]) => void;
  title?: string;
  description?: string;
  /** 台数が少なくても検索欄を出す */
  alwaysSearch?: boolean;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter(
      (d) => d.name.toLowerCase().includes(q) || (d.serial ?? '').toLowerCase().includes(q),
    );
  }, [devices, query]);
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const selectedNames = devices.filter((d) => selected.includes(d.id)).map((d) => d.name);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[15px] font-bold">{title}</div>
        <div className="mt-1 text-[13px] text-muted-foreground">{description}</div>
      </div>
      {(devices.length > 6 || alwaysSearch) && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="マシンの名前や番号で探す"
            className="pl-10"
            aria-label="マシンを探す"
          />
        </div>
      )}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          マシンを読み込んでいます…
        </div>
      ) : error ? (
        <div className="flex flex-col items-start gap-3 rounded-[10px] border border-destructive/30 bg-destructive/5 p-4 text-sm font-bold text-destructive">
          {error}
          <Button variant="outline" onClick={onReload}>
            もう一度読み込む
          </Button>
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-[10px] bg-secondary p-4 text-sm text-foreground/80">
          割り当てられるマシンがいまはありません。マシンを選ばずに承認し、後から「顧客にマシンを追加する」で割り当てられます。
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[10px] bg-secondary p-4 text-sm text-foreground/80">
          「{query}」に当てはまるマシンはありません。
        </div>
      ) : (
        <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
          {filtered.map((d) => {
            const on = selected.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggle(d.id)}
                aria-pressed={on}
                className={cn(
                  'flex min-h-[56px] w-full shrink-0 items-center gap-3.5 rounded-[10px] px-4 py-3.5 text-left text-foreground transition-colors',
                  on ? 'border border-primary bg-primary/5 ring-1 ring-inset ring-primary' : 'border bg-card hover:bg-accent',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                    on ? 'bg-primary text-primary-foreground' : 'border-2 border-[#9CA3AF] bg-card',
                  )}
                  aria-hidden="true"
                >
                  {on && <Check className="h-4 w-4" strokeWidth={3} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="break-words text-base font-bold">{d.name}</span>
                  <span className="break-words text-[13px] text-muted-foreground">
                    番号 {d.serial || '—'}
                    {d.last_heartbeat_at ? `・最後につながった日 ${fmtDate(d.last_heartbeat_at)}` : ''}
                  </span>
                  <span className="text-[13px] text-foreground/70 sm:hidden">
                    {STATUS_LABEL[d.status] ?? '未割当'}
                  </span>
                </span>
                <span className="hidden shrink-0 text-[13px] text-foreground/70 sm:inline">
                  {STATUS_LABEL[d.status] ?? '未割当'}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="text-sm text-foreground/80">
        選んだマシン：<b>{selected.length}台</b>（{selectedNames.length ? selectedNames.join('、') : 'なし'}）
      </div>
    </div>
  );
}

export function RejectDialog({
  request,
  onClose,
  onRejected,
}: {
  request: SignupRequest;
  onClose: () => void;
  onRejected: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await signupAdmin.reject(request.id, reason.trim() || undefined);
      onRejected();
    } catch (e) {
      setError(friendlyError(e, 'reject'));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>この申し込みをお断りしますか？</DialogTitle>
          <DialogDescription>
            {request.company_name}（{request.email}）にお断りのメールが届きます。この操作は取り消せません。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reject-reason" className="text-sm font-bold">
            お断りの理由（任意・メールに書かれます）
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-[10px] border border-input bg-card px-3.5 py-2.5 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
            placeholder="例：お申し込みの内容を確認できなかったため"
          />
        </div>
        {error && (
          <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/5 p-3 text-sm font-bold text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            やめる
          </Button>
          <Button variant="destructive" onClick={run} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            お断りする
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
