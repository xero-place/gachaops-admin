'use client';

import { useState, useMemo, useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';

type AuditLog = {
  id: string;
  customer_id?: string;
  user_id: string | null;
  user_email?: string | null;
  user_name?: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type User = {
  id: string;
  name: string;
  email: string;
};
import { fmtDate } from '@/lib/format';
import { Search, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AuditAction } from '@/types/domain';

const ACTION_LABEL: Record<AuditAction, string> = {
  create: '作成',
  update: '更新',
  delete: '削除',
  login: 'ログイン',
  logout: 'ログアウト',
  distribute: '配信',
  refund: '返金',
  command: 'コマンド',
};

const ACTION_VARIANT: Record<AuditAction, 'ok' | 'default' | 'destructive' | 'warn' | 'secondary' | 'muted'> = {
  create: 'ok',
  update: 'default',
  delete: 'destructive',
  login: 'muted',
  logout: 'muted',
  distribute: 'default',
  refund: 'warn',
  command: 'secondary',
};

export default function AuditLogsPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [aRes, uRes] = await Promise.all([
          api.get<{items?: AuditLog[]} | AuditLog[]>('/audit-logs?limit=200'),
          api.get<{items?: User[]} | User[]>('/users?limit=200'),
        ]);
        if (cancelled) return;
        const aArr = Array.isArray(aRes) ? aRes : (aRes.items ?? []);
        const uArr = Array.isArray(uRes) ? uRes : (uRes.items ?? []);
        setAuditLogs(aArr);
        setUsers(uArr);
      } catch (e) {
        console.error('[audit-logs] fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <AppShell title="監査ログ" breadcrumb={['ホーム', '監査ログ']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return auditLogs.filter((log) => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (userFilter !== 'all' && log.user_id !== userFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !log.resource_type.toLowerCase().includes(s) &&
          !(log.resource_id ?? '').toLowerCase().includes(s) &&
          !(log.user_email ?? '').toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [auditLogs, search, actionFilter, userFilter]);

  return (
    <AppShell title="監査ログ" breadcrumb={['ホーム', '監査ログ']}>
      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="リソース種別 / ID / メール..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="操作種別" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全ての操作</SelectItem>
              {(Object.keys(ACTION_LABEL) as AuditAction[]).map((a) => (
                <SelectItem key={a} value={a}>{ACTION_LABEL[a]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="ユーザ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全ユーザ</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} / {auditLogs.length} 件
          </div>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="h-3.5 w-3.5" />CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日時</TableHead>
              <TableHead>ユーザ</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>リソース</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>変更内容</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 100).map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                  {fmtDate(log.created_at)}
                </TableCell>
                <TableCell className="text-xs">{log.user_email}</TableCell>
                <TableCell><Badge variant={ACTION_VARIANT[log.action]}>{ACTION_LABEL[log.action]}</Badge></TableCell>
                <TableCell className="text-xs">
                  <div className="font-medium">{log.resource_type}</div>
                  {log.resource_id && (
                    <div className="font-mono text-[10.5px] text-muted-foreground">{log.resource_id}</div>
                  )}
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{log.ip_address}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                  {log.action === 'update' && log.before && log.after
                    ? `${JSON.stringify(log.before)} → ${JSON.stringify(log.after)}`
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
