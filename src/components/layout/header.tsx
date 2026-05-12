'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronDown, LogOut, User as UserIcon, Settings as SettingsIcon } from 'lucide-react';
import { AlertCenter } from '@/components/domain/alert-center';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { tokenStore, type StoredUser } from '@/lib/token-store';
import { auth, api } from '@/lib/api';

export function Header({ title, breadcrumb }: { title: string; breadcrumb?: string[] }) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    setUser(tokenStore.getUser());
  }, []);

  const onLogout = async () => {
    await auth.logout();
    router.replace('/login');
  };

  const displayName = user?.name || (api.isMockMode ? '運営 太郎' : 'ゲスト');
  const initial = displayName.slice(0, 1);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-card/70 backdrop-blur px-6">
      <div className="flex flex-col">
        <h1 className="text-base font-semibold leading-tight">{title}</h1>
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="text-[11px] text-muted-foreground">
            {breadcrumb.join(' / ')}
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {!api.isMockMode && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-ok/15 text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            LIVE API
          </span>
        )}
        {api.isMockMode && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-warn/15 text-warn">
            MOCK
          </span>
        )}
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="検索 (端末名、注文ID, ...)"
            className="w-[280px] pl-8 h-8 text-xs bg-background/60"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden lg:inline-flex h-5 px-1 items-center rounded border text-[10px] text-muted-foreground bg-muted">
            ⌘K
          </kbd>
        </div>
        <AlertCenter />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 px-2 gap-2">
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                {initial}
              </div>
              <span className="text-xs hidden sm:inline">{displayName}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="text-xs">{displayName}</div>
              {user && (
                <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                  {user.email} · {user.role}
                </div>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <UserIcon className="h-3.5 w-3.5 mr-2" />
              プロフィール
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <SettingsIcon className="h-3.5 w-3.5 mr-2" />
              設定
            </DropdownMenuItem>
            {!api.isMockMode && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-destructive">
                  <LogOut className="h-3.5 w-3.5 mr-2" />
                  ログアウト
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
