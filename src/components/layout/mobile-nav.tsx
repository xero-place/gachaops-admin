'use client';

// ★mobilenav: スマホ/タブレット(lg未満)ではサイドバー(hidden lg:flex)が非表示になり
//   メニューへ到達する手段が無かった。ヘッダー左端のハンバーガー→ドロワーで解決。
//   デスクトップ(lg以上)では非表示(lg:hidden)で、従来のサイドバーと相補。
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tokenStore } from '@/lib/token-store';
import { NAV_GROUPS } from '@/components/layout/sidebar';

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    setRole(tokenStore.getUser()?.role ?? null);
  }, []);
  const isSuper = role === 'lv1_super';

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="メニューを開く"
        onClick={() => setOpen(true)}
        className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r bg-card shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-white">
                  <Image
                    src="/logo-gtchax.png"
                    alt="GTCHAXAPP"
                    width={28}
                    height={28}
                    className="object-contain"
                  />
                </div>
                <div className="text-sm font-semibold">GTCHAXAPP</div>
              </div>
              <button
                type="button"
                aria-label="メニューを閉じる"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4">
              {NAV_GROUPS.map((group) => {
                const items = group.items.filter((item) => !item.superOnly || isSuper);
                if (items.length === 0) return null;
                return (
                  <div key={group.label} className="mb-5">
                    <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                      {group.label}
                    </div>
                    <ul className="space-y-0.5">
                      {items.map((item) => {
                        const active =
                          pathname === item.href ||
                          (item.href !== '/' && pathname?.startsWith(item.href));
                        const Icon = item.icon;
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              onClick={() => setOpen(false)}
                              className={cn(
                                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                                active
                                  ? 'bg-primary/15 font-medium text-primary'
                                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                              )}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{item.label}</span>
                              {item.badge && (
                                <span className="ml-auto rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                  {item.badge}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
