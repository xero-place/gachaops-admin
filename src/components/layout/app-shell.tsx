import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { AuthGate } from '@/components/layout/auth-gate';

interface ShellProps {
  title: string;
  breadcrumb?: string[];
  children: React.ReactNode;
}

export function AppShell({ title, breadcrumb, children }: ShellProps) {
  return (
    <AuthGate>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header title={title} breadcrumb={breadcrumb} />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </AuthGate>
  );
}
