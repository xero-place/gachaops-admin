'use client';

// S262: ログイン中ユーザーとロールを返す共通フック。
// SSR とのずれを避けるため、マウント後に localStorage から読む（それまでは ready=false）。
import { useEffect, useState } from 'react';
import { tokenStore, type StoredUser } from '@/lib/token-store';

export interface CurrentUser {
  ready: boolean;
  user: StoredUser | null;
  role: string | null;
  /** 弊社スタッフ（lv1_super） */
  isStaff: boolean;
  /** お客様の管理者（lv2_admin、店舗限定アカウントは除く）＝メンバーを追加できる */
  isCustomerAdmin: boolean;
}

export function useCurrentUser(): CurrentUser {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(tokenStore.getUser());
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'gachaops_user') setUser(tokenStore.getUser());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const role = user?.role ?? null;
  return {
    ready,
    user,
    role,
    isStaff: role === 'lv1_super',
    isCustomerAdmin: role === 'lv2_admin' && !user?.store_id,
  };
}
