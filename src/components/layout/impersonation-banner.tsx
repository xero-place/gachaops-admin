'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, tokenStore } from '@/lib/api';
import { UserCog, LogOut } from 'lucide-react';

/**
 * S157: shown across every authenticated page while the operator (lv1_super)
 * is impersonating another account. Gives a constant, hard-to-miss reminder
 * plus a one-click "return to operator" action.
 */
export function ImpersonationBanner() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      if (tokenStore.isImpersonating()) {
        const u = tokenStore.getUser();
        setName(u?.name ?? u?.email ?? '別アカウント');
      } else {
        setName(null);
      }
    };
    sync();
    // Re-check on focus so the banner stays correct across tabs/navigations.
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);

  if (!name) return null;

  const onReturn = () => {
    auth.stopImpersonation();
    router.replace('/');
    // Force a clean reload so all data refetches under the operator token.
    if (typeof window !== 'undefined') window.location.href = '/';
  };

  return (
    <div className="flex items-center justify-between gap-3 px-6 py-2 bg-destructive/15 border-b border-destructive/30 text-sm">
      <div className="flex items-center gap-2 text-destructive">
        <UserCog className="h-4 w-4 shrink-0" />
        <span>
          現在 <span className="font-semibold">{name}</span> として操作中です（運営による成り代わり）
        </span>
      </div>
      <button
        onClick={onReturn}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
      >
        <LogOut className="h-3.5 w-3.5" />
        運営に戻る
      </button>
    </div>
  );
}
