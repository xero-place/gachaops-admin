'use client';

import { LOCALES, type Locale } from '@/i18n/dictionaries';
import { useLocale } from '@/store/useLocale';

const SHORT: Record<Locale, string> = { ja: 'JA', en: 'EN' };
const FULL: Record<Locale, string> = { ja: '日本語', en: 'English' };

/**
 * 画面上部（ヘッダー）に置く言語スイッチャー。デフォルト日本語。
 * 選択は zustand 経由でログインユーザーごとに localStorage 保持される。
 * shadcn/ui のトークン（border/primary/muted）に合わせた Tailwind スタイル。
 */
export function LanguageSwitcher() {
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center gap-0.5 rounded-[10px] border border-input bg-card p-0.5"
    >
      {LOCALES.map((lc) => {
        const active = lc === locale;
        return (
          <button
            key={lc}
            type="button"
            onClick={() => setLocale(lc)}
            aria-pressed={active}
            title={FULL[lc]}
            className={
              'rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ' +
              (active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            {SHORT[lc]}
          </button>
        );
      })}
    </div>
  );
}
