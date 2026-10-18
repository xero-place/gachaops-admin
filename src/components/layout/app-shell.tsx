import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { AuthGate } from '@/components/layout/auth-gate';
import { ImpersonationBanner } from '@/components/layout/impersonation-banner';

interface ShellProps {
  title: string;
  breadcrumb?: string[];
  /** S262: ヘッダーに「← 戻る」リンクを出す */
  back?: { href: string; label: string };
  children: React.ReactNode;
}

export function AppShell({ title, breadcrumb, back, children }: ShellProps) {
  return (
    <AuthGate>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header title={title} breadcrumb={breadcrumb} back={back} />
          <ImpersonationBanner />
          <main className="min-w-0 flex-1 overflow-x-clip p-4 lg:px-8 lg:py-7">{children}</main>
        </div>
      </div>
    </AuthGate>
  );
}
