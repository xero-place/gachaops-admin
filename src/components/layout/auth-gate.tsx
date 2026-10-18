'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { tokenStore } from '@/lib/token-store';
import { Loader2 } from 'lucide-react';

/**
 * Wraps protected pages. If the user has no access token AND we're not in
 * so this gate is a no-op.
 */
// S262: ログイン不要のページ（登録リンク・メンバー登録）。AppShell を使わない作りだが、念のためここでも通す。
const PUBLIC_PREFIXES = ['/join/', '/member/'];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pathname && PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
      setReady(true);
      return;
    }
    if (!tokenStore.isAuthenticated()) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}
