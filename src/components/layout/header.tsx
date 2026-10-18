'use client';

// S262: 白いヘッダー。左にページ名（必要なら「← 戻る」リンク）、右に利用者名とメニュー。
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Languages, LogOut, Settings as SettingsIcon, UserRound } from 'lucide-react';
import { useLocale } from '@/store/useLocale';
import { AlertCenter } from '@/components/domain/alert-center';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { tokenStore, type StoredUser } from '@/lib/token-store';
import { auth } from '@/lib/api';
import { MobileNav } from '@/components/layout/mobile-nav';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LocaleBootstrap } from '@/components/LocaleBootstrap';
import { usePageT } from '@/i18n/usePageT';
import { headerDict } from '@/i18n/ns/header';

export interface HeaderProps {
  title: string;
  /** 互換のため受け取るが、S262 では表示しない（戻り先は back で示す） */
  breadcrumb?: string[];
  back?: { href: string; label: string };
}

export function Header({ title, back }: HeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const t = usePageT(headerDict);
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);

  useEffect(() => {
    const u = tokenStore.getUser();
    setUser(u);
    // S216: user欠落時、または顧客名未取得の既存セッション時のみ /auth/me で復元。
    if (tokenStore.isAuthenticated() && (!u || (!!u.customer_id && !u.customer_name))) {
      auth.me()
        .then((fresh) => { tokenStore.setUser(fresh); setUser(fresh); })
        .catch(() => { /* 本物の認証切れは api 側で /login にリダイレクトされる */ });
    }
    // 別タブでのログイン/ログアウト/成り代わりに追従。
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'gachaops_user') setUser(tokenStore.getUser());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const onLogout = async () => {
    await auth.logout();
    router.replace('/login');
  };

  const isStaff = user?.role === 'lv1_super';
  const personName = user?.name || user?.email || t.guest;
  const displayName =
    !isStaff && user?.customer_name && user.customer_name !== personName
      ? `${user.customer_name}　${personName}`
      : personName;

  return (
    <header className="sticky top-0 z-30 flex min-h-[64px] items-center gap-3 border-b bg-card px-4 py-2.5 lg:min-h-[68px] lg:px-8 lg:py-3">
      <MobileNav />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {back && (
          <Link href={back.href} className="text-[13px] text-muted-foreground hover:text-primary">
            ← {back.label}
          </Link>
        )}
        <h1 className="line-clamp-2 text-base font-bold leading-snug sm:truncate sm:text-lg lg:text-xl">{title}</h1>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <LocaleBootstrap userId={user?.id ?? null} />
        <div className="hidden sm:block">
          <LanguageSwitcher />
        </div>
        <AlertCenter />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <span className="hidden max-w-[260px] truncate sm:inline">{displayName}</span>
              <UserRound className="h-5 w-5 sm:hidden" aria-label={displayName} />
              <ChevronDown className="hidden h-4 w-4 opacity-60 sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <div className="text-sm">{displayName}</div>
              {user && (
                <div className="mt-0.5 text-xs font-normal text-muted-foreground">{user.email}</div>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <SettingsIcon className="mr-2 h-4 w-4" />
              {t.settings}
            </DropdownMenuItem>
            {/* スマホではヘッダーに言語切り替えを置かないので、ここから切り替える */}
            <DropdownMenuItem className="sm:hidden" onClick={() => setLocale(locale === 'ja' ? 'en' : 'ja')}>
              <Languages className="mr-2 h-4 w-4" />
              {locale === 'ja' ? 'English' : '日本語'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              {t.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
