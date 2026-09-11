'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useState, useEffect } from 'react';
import { api, auth, tokenStore } from '@/lib/api';
import { Loader2, UserCog } from 'lucide-react';
import { useRouter } from 'next/navigation';

type User = {
  id: string;
  customer_id?: string;
  email: string;
  name: string;
  customer_name?: string;
  role: UserRole;
  two_factor_enabled: boolean;
  last_login_at?: string | null;
  created_at?: string;
};
import { fmtRelative } from '@/lib/format';
import { Plus, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { UserRole } from '@/types/domain';
import { usePageT } from '@/i18n/usePageT';
import { usersDict } from '@/i18n/ns/users';

const ROLE_VARIANT: Record<UserRole, 'default' | 'destructive' | 'ok' | 'muted'> = {
  lv1_super: 'destructive',
  lv2_admin: 'default',
  lv3_operator: 'ok',
  lv4_viewer: 'muted',
};

export default function UsersPage() {
  const t = usePageT(usersDict);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const me = tokenStore.getUser();
  const isSuper = me?.role === 'lv1_super';

  const onImpersonate = async (targetId: string) => {
    try {
      await auth.impersonate(targetId);
      if (typeof window !== 'undefined') window.location.href = '/';
      else router.replace('/');
    } catch (e) {
      console.error('[impersonate] failed:', e);
      alert(t.impersonateFailed);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{items?: User[]} | User[]>('/users?limit=200');
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : (res.items ?? []);
        setUsers(arr);
      } catch (e) {
        console.error('[users] fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{t.userCount(users.length)}</p>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />{t.inviteUser}
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.colUser}</TableHead>
              <TableHead>{t.colEmail}</TableHead>
              <TableHead>{t.colRole}</TableHead>
              <TableHead>{t.col2fa}</TableHead>
              <TableHead>{t.colLastLogin}</TableHead>
              <TableHead className="text-right">{t.colAction}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center text-xs font-bold text-primary-foreground">
                      {(u.customer_name || u.name).charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{u.customer_name || u.name}</div>
                      <div className="text-[10.5px] font-mono text-muted-foreground">{u.id}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-xs">{u.email}</TableCell>
                <TableCell><Badge variant={ROLE_VARIANT[u.role]}>{t.roleLabels[u.role] ?? u.role}</Badge></TableCell>
                <TableCell>
                  {u.two_factor_enabled ? (
                    <span className="inline-flex items-center gap-1 text-ok text-xs">
                      <ShieldCheck className="h-3.5 w-3.5" />{t.enabled}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                      <ShieldAlert className="h-3.5 w-3.5" />{t.notSet}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtRelative(u.last_login_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    {isSuper && me && u.id !== me.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => onImpersonate(u.id)}
                      >
                        <UserCog className="h-3.5 w-3.5" />{t.operateAsAccount}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-xs">{t.edit}</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
