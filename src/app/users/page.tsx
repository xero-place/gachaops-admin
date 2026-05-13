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
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';

type User = {
  id: string;
  customer_id?: string;
  email: string;
  name: string;
  role: UserRole;
  two_factor_enabled: boolean;
  last_login_at?: string | null;
  created_at?: string;
};
import { fmtRelative } from '@/lib/format';
import { Plus, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { UserRole } from '@/types/domain';

const ROLE_LABEL: Record<UserRole, string> = {
  lv1_super: 'スーパー管理者',
  lv2_admin: '管理者',
  lv3_operator: '運用担当',
  lv4_viewer: '閲覧専用',
};
const ROLE_VARIANT: Record<UserRole, 'default' | 'destructive' | 'ok' | 'muted'> = {
  lv1_super: 'destructive',
  lv2_admin: 'default',
  lv3_operator: 'ok',
  lv4_viewer: 'muted',
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

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
      <AppShell title="ユーザ" breadcrumb={['ホーム', 'ユーザ']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="ユーザ" breadcrumb={['ホーム', 'ユーザ']}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{users.length} ユーザ</p>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />ユーザを招待
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ユーザ</TableHead>
              <TableHead>メール</TableHead>
              <TableHead>ロール</TableHead>
              <TableHead>2FA</TableHead>
              <TableHead>最終ログイン</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center text-xs font-bold text-primary-foreground">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{u.name}</div>
                      <div className="text-[10.5px] font-mono text-muted-foreground">{u.id}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-xs">{u.email}</TableCell>
                <TableCell><Badge variant={ROLE_VARIANT[u.role]}>{ROLE_LABEL[u.role]}</Badge></TableCell>
                <TableCell>
                  {u.two_factor_enabled ? (
                    <span className="inline-flex items-center gap-1 text-ok text-xs">
                      <ShieldCheck className="h-3.5 w-3.5" />有効
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                      <ShieldAlert className="h-3.5 w-3.5" />未設定
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtRelative(u.last_login_at)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="h-7 text-xs">編集</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
