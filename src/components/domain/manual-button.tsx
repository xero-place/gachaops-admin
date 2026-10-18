// S262: 「WEBマニュアルを見る」ボタン（新しいタブで開く）。
import { BookOpen, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EXTERNAL, MANUAL_URL } from '@/lib/manual-links';

export function ManualButton({
  tone = 'light',
  className,
}: {
  /** light: 白いカード上 / dark: 黒いサイドバー上 */
  tone?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <a
      href={MANUAL_URL}
      {...EXTERNAL}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-4 text-sm font-bold transition-colors',
        tone === 'dark'
          ? 'gap-1.5 border border-[#3A3A3A] px-3 text-[13px] text-white hover:bg-[#1C1C1C]'
          : 'border border-input bg-card text-foreground hover:bg-accent',
        className,
      )}
    >
      <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
      WEBマニュアルを見る
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" aria-label="（新しいタブで開きます）" />
    </a>
  );
}
