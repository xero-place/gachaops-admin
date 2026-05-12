'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { tokenStore } from '@/lib/token-store';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';

/**
 * Wraps protected pages. If the user has no access token AND we're not in
 * mock mode, redirect to /login. In mock mode, the UI works without auth
 * so this gate is a no-op.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Mock mode: skip auth entirely
    if (api.isMockMode) {
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
