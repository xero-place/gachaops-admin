// S262: ホーム画面の部品（やりたいことカード・数字のタイル）。見た目はモックアップどおり。
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function HomeIcon({ d, accent = false }: { d: React.ReactNode; accent?: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke={accent ? 'hsl(var(--primary))' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d}
    </svg>
  );
}

export function ActionCard({
  href,
  icon,
  title,
  desc,
  primary = false,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  primary?: boolean;
  /** 「はじめる →」などの一言。省略すると出さない */
  cta?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col gap-2.5 rounded-card bg-card p-[22px] text-foreground transition-colors',
        primary ? 'border-2 border-primary' : 'border hover:border-foreground/25',
      )}
    >
      <HomeIcon d={icon} accent={primary} />
      <div className="text-lg font-bold leading-snug group-hover:text-primary">{title}</div>
      <div className="text-sm leading-[1.7] text-muted-foreground">{desc}</div>
      {cta && (
        <div className={cn('text-sm font-bold', primary ? 'text-primary' : 'text-foreground')}>{cta}</div>
      )}
    </Link>
  );
}

export function StatTile({
  label,
  value,
  unit,
  href,
}: {
  label: string;
  value: number | string | null;
  unit: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[30px] font-bold leading-tight tabular-nums">
        {value === null ? '—' : value}
        {value !== null && <span className="text-sm font-normal text-muted-foreground"> {unit}</span>}
      </span>
    </>
  );
  const cls = 'flex flex-col gap-1 rounded-[10px] bg-secondary p-4 text-foreground';
  return href ? (
    <Link href={href} className={cn(cls, 'transition-colors hover:bg-accent')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-card border bg-card p-[22px]">
      <h2 className="text-[17px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** モックアップのアイコン（SVG path）。 */
export const ICONS = {
  addUser: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-4 3-6 7-6s7 2 7 6" />
      <path d="M19 8v6M16 11h6" />
    </>
  ),
  addMachine: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 12h6M12 9v6" />
    </>
  ),
  move: <path d="M4 7h13l-3-3M20 17H7l3 3" />,
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  play: (
    <>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M10 8l5 3-5 3z" />
      <path d="M8 21h8" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  star: <path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" />,
  tag: (
    <>
      <path d="M20 12l-8 8-9-9V3h8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  refill: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
};
