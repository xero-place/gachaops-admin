'use client';

// S262: ホーム。弊社スタッフ（lv1_super）と顧客で中身を分ける。
// 以前のダッシュボード（数字のまとめ）は /dashboard に移した。
import { AppShell } from '@/components/layout/app-shell';
import { useCurrentUser } from '@/lib/use-current-user';
import { useLocale } from '@/store/useLocale';
import { StaffHome } from './_components/staff-home';
import { CustomerHome } from './_components/customer-home';

export default function HomePage() {
  const { ready, isStaff } = useCurrentUser();
  const locale = useLocale((s) => s.locale);
  return (
    <AppShell title={locale === 'en' ? 'Home' : 'ホーム'}>
      {!ready ? null : isStaff ? <StaffHome /> : <CustomerHome />}
    </AppShell>
  );
}
