'use client';

// S262: 黒いサイドバー（#111111）。メニューはロール別（nav-config.ts）。
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/useLocale';
import { ManualButton } from '@/components/domain/manual-button';
import { useCurrentUser } from '@/lib/use-current-user';
import {
  SHELL_NAV_EN,
  activeHref,
  navFor,
  type ShellNavItem,
} from '@/components/layout/nav-config';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { ready, isStaff } = useCurrentUser();
  const locale = useLocale((s) => s.locale);
  const tr = (ja: string) => (locale === 'en' ? (SHELL_NAV_EN[ja] ?? ja) : ja);
  const nav = navFor(isStaff);
  const current = activeHref(nav, pathname);
  const moreActive = !!current && nav.more.some((i) => i.href === current);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (moreActive) setMoreOpen(true);
  }, [moreActive]);

  const item = (it: ShellNavItem, small = false) => {
    const active = it.href === current;
    return (
      <li key={it.href}>
        <Link
          href={it.href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'block rounded-lg px-3 transition-colors',
            small ? 'py-2 text-[13px]' : 'py-[11px] text-sm',
            active
              ? 'bg-[#2A2A2A] font-semibold text-white'
              : 'text-[#D1D5DB] hover:bg-[#1C1C1C] hover:text-white',
          )}
        >
          {tr(it.label)}
        </Link>
      </li>
    );
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center px-3 pb-5 pt-1 text-white">
        {/* S262d: 正式ロゴ（白） / S262f: 「運営」はロゴの縦中央に区切り線つきで揃える */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/gtchax-logo-white.png" alt="GTCHA X" className="h-[20px] w-auto" />
        {ready && isStaff && (
          <>
            <span aria-hidden="true" className="mx-3 h-4 w-px bg-white/25" />
            <span className="text-[12px] font-medium leading-none tracking-[0.12em] text-[#9CA3AF]">運営</span>
          </>
        )}
      </div>
      {ready && (
        <nav aria-label="メインメニュー" className="flex flex-col">
          <ul className="flex flex-col gap-1">{nav.main.map((it) => item(it))}</ul>
          <div className="my-3 h-px bg-[#2A2A2A]" />
          <ul className="flex flex-col gap-1">{nav.bottom.map((it) => item(it))}</ul>
          {nav.more.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] text-[#9CA3AF] hover:text-white"
              >
                {tr('その他')}
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')}
                />
              </button>
              {moreOpen && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {nav.more.map((it) => item(it, true))}
                </ul>
              )}
            </div>
          )}
        </nav>
      )}
      {/* S262: WEBマニュアル（スタッフ・顧客とも） */}
      <div className="mt-6 border-t border-[#2A2A2A] pt-4">
        <ManualButton tone="dark" className="w-full" />
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    // 黒い帯はページの高さいっぱいに伸ばし、メニュー自体は画面上部に固定する
    <aside className="hidden w-[232px] shrink-0 bg-[#111111] lg:block">
      <div className="sticky top-0 h-screen overflow-y-auto px-3 py-5">
        <SidebarNav />
      </div>
    </aside>
  );
}
