'use client';

import Link from 'next/link';
import { useCurrentUser } from '@/lib/use-current-user';

/** 弊社スタッフ（lv1_super）以外には中身を見せない。 */
export function StaffOnly({ children }: { children: React.ReactNode }) {
  const { ready, isStaff } = useCurrentUser();
  if (!ready) return null;
  if (!isStaff) {
    return (
      <div className="rounded-card border bg-card p-8 text-sm text-muted-foreground">
        この画面は弊社スタッフ専用です。
        <Link href="/" className="ml-2 font-bold text-foreground hover:text-primary">
          ホームに戻る →
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
