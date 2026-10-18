'use client';

// ★mobilenav(portal fix): ドロワーは fixed だが、ヘッダー内に置くと包含ブロックの影響を受けるため、
//   createPortal で document.body 直下に描画する。
// S262: 中身はサイドバーと同じ SidebarNav（ロール別メニュー）。
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { SidebarNav } from '@/components/layout/sidebar';
import { useLocale } from '@/store/useLocale';

const MOBILE_NAV_LABELS = {
  ja: { close: 'メニューを閉じる', open: 'メニューを開く' },
  en: { close: 'Close menu', open: 'Open menu' },
} as const;

export function MobileNav() {
  const pathname = usePathname();
  const locale = useLocale((s) => s.locale);
  const nl = locale === 'en' ? MOBILE_NAV_LABELS.en : MOBILE_NAV_LABELS.ja;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ルート遷移で閉じる
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 開いている間は背面スクロール抑止
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const drawer = (
    <div className="fixed inset-0 z-[100] lg:hidden">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside className="absolute left-0 top-0 h-full w-[260px] max-w-[85vw] overflow-y-auto bg-[#111111] px-3 py-5">
        <button
          type="button"
          aria-label={nl.close}
          onClick={() => setOpen(false)}
          className="absolute right-3 top-4 inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#D1D5DB] hover:bg-[#2A2A2A] hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarNav onNavigate={() => setOpen(false)} />
      </aside>
    </div>
  );

  return (
    <>
      <button
        type="button"
        aria-label={nl.open}
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-accent lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      {mounted && open ? createPortal(drawer, document.body) : null}
    </>
  );
}
