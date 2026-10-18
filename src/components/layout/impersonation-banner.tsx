'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, tokenStore } from '@/lib/api';
import { UserCog, LogOut } from 'lucide-react';
import { usePageT } from '@/i18n/usePageT';
import { impersonationBannerDict } from '@/i18n/ns/impersonationBanner';

/**
 * S157: shown across every authenticated page while the operator (lv1_super)
 * is impersonating another account. Gives a constant, hard-to-miss reminder
 * plus a one-click "return to operator" action.
 */
export function ImpersonationBanner() {
  const router = useRouter();
  const t = usePageT(impersonationBannerDict);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      if (tokenStore.isImpersonating()) {
        const u = tokenStore.getUser();
        const person = u?.name ?? u?.email ?? impersonationBannerDict.ja.otherAccount;
        // S262: どのお客様の画面かがすぐ分かるよう、会社名を先に出す
        setName(u?.customer_name && u.customer_name !== person ? `${u.customer_name}（${person}）` : person);
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
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm lg:px-8">
      <div className="flex items-center gap-2 text-destructive">
        <UserCog className="h-4 w-4 shrink-0" />
        <span>
          {t.asPrefix}<span className="font-semibold">{name}</span>{t.asSuffix}
        </span>
      </div>
      <button
        onClick={onReturn}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[10px] border border-destructive/40 bg-card px-3.5 text-sm font-bold text-destructive hover:bg-destructive/10"
      >
        <LogOut className="h-3.5 w-3.5" />
        {t.returnToOperator}
      </button>
    </div>
  );
}
