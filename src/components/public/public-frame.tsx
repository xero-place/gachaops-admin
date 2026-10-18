// S262: ログイン不要ページ（登録リンク・メンバー登録）の外枠。サイドバーやログイン確認は通さない。
import { cn } from '@/lib/utils';

export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-background px-4 py-10 text-foreground sm:py-14">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/gtchax-logo-dark.png" alt="GTCHA X" className="h-[28px] w-auto" />
      <main className="flex w-full max-w-[520px] flex-col gap-5 rounded-2xl border bg-card p-6 sm:p-8">
        {children}
      </main>
      <p className="text-center text-xs text-muted-foreground">
        ご不明な点は gtchax@xeroplace.jp までお問い合わせください。
      </p>
    </div>
  );
}

export function PublicTitle({ title, lead }: { title: string; lead?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-[20px] font-bold leading-snug sm:text-[22px]">{title}</h1>
      {lead && <p className="text-sm leading-relaxed text-muted-foreground">{lead}</p>}
    </div>
  );
}

export function FormField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      {children}
      {error ? (
        <div id={`${id}-error`} className="text-[13px] font-bold text-destructive">
          {error}
        </div>
      ) : hint ? (
        <div className="text-[13px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

/** 画面上部に出すお知らせ。tone=error は赤文字＋淡い赤背景、info は灰色背景。 */
export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'error' | 'success';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-[10px] px-4 py-3.5 text-sm leading-relaxed',
        tone === 'error' && 'border border-destructive/30 bg-destructive/5 font-bold text-destructive',
        tone === 'info' && 'bg-secondary text-foreground/80',
        tone === 'success' && 'border border-ok/30 bg-ok/5 text-ok',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DoneMark({ label = '完了' }: { label?: string }) {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#15803D"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M7 12l3 3 7-7" />
    </svg>
  );
}

export const bigInput = 'h-12 text-base';
