'use client';

// S262c: 手順を1つずつ案内する画面の共通部品（/customers/invite と同じ見た目）。
// 上に4つの手順バー、白いカードに「1画面1つの質問」、下に「戻る」と朱色の主ボタン。
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const COLS: Record<number, string> = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 5: 'sm:grid-cols-5', 6: 'sm:grid-cols-6' };

export function Stepper({ labels, step }: { labels: string[]; step: number }) {
  return (
    <ol aria-label="手順" className={cn('grid grid-cols-2 gap-2', COLS[labels.length] ?? 'sm:grid-cols-4')}>
      {labels.map((label, i) => {
        const n = i + 1;
        return (
          <li key={label} className="flex flex-col gap-2" aria-current={n === step ? 'step' : undefined}>
            <div className={cn('h-1.5 rounded-full', n <= step ? 'bg-primary' : 'bg-border')} />
            <div className={cn('text-sm', n === step ? 'font-bold text-foreground' : 'text-muted-foreground')}>
              {n}. {label}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function WizardCard({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-[22px] rounded-card border bg-card p-5 sm:p-7">{children}</section>;
}

export function StepTitle({ title, lead }: { title: string; lead?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-[22px] font-bold leading-snug">{title}</h2>
      {lead && <p className="text-sm leading-relaxed text-muted-foreground">{lead}</p>}
    </div>
  );
}

export function WizardFooter({
  onBack,
  backLabel = '戻る',
  onNext,
  nextLabel,
  nextDisabled,
  busy,
}: {
  onBack?: () => void;
  backLabel?: string;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2.5 border-t pt-5">
      <Button
        variant="outline"
        className={cn('h-12 px-6 text-base', !onBack && 'invisible')}
        onClick={onBack}
        disabled={!onBack || busy}
      >
        {backLabel}
      </Button>
      {onNext && nextLabel && (
        <Button className="h-12 px-7 text-base" onClick={onNext} disabled={nextDisabled || busy}>
          {busy && <Loader2 className="animate-spin" />}
          {nextLabel}
        </Button>
      )}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-12 pl-10 text-base" aria-label={placeholder} />
    </div>
  );
}

/** 1つだけ選ぶ一覧の行（選ぶと朱色の枠） */
export function ChoiceRow({
  selected,
  onClick,
  title,
  sub,
  right,
}: {
  selected: boolean;
  onClick: () => void;
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex min-h-[60px] w-full shrink-0 items-center gap-3.5 rounded-[10px] px-4 py-3.5 text-left text-foreground transition-colors',
        selected ? 'border border-primary bg-primary/5 ring-1 ring-inset ring-primary' : 'border bg-card hover:bg-accent',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-primary' : 'border-[#9CA3AF]',
        )}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="break-words text-base font-bold">{title}</span>
        {sub && <span className="break-words text-[13px] text-muted-foreground">{sub}</span>}
      </span>
      {right && <span className="hidden shrink-0 text-[13px] text-foreground/70 sm:inline">{right}</span>}
    </button>
  );
}

export function ListScroll({ children }: { children: React.ReactNode }) {
  return <div className="flex max-h-[460px] flex-col gap-2 overflow-y-auto pr-1">{children}</div>;
}

export function Loading({ text = '読み込んでいます…' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-4 py-3.5 text-sm font-bold text-destructive">
      {children}
    </div>
  );
}

export function EmptyBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] bg-secondary px-[18px] py-4 text-sm leading-relaxed text-foreground/80">{children}</div>;
}

/** 確認画面の「項目：内容」表 */
export function ConfirmTable({ rows }: { rows: { k: string; v: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 rounded-xl border p-[18px] text-[15px] sm:grid-cols-[160px_minmax(0,1fr)]">
      {rows.map((r) => (
        <div key={r.k} className="contents">
          <dt className="text-muted-foreground">{r.k}</dt>
          <dd className="break-words font-bold">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const STATUS_TEXT: Record<string, string> = {
  online: 'オンライン',
  offline: 'オフライン',
  maintenance: 'メンテナンス中',
  never_connected: '未接続',
};
