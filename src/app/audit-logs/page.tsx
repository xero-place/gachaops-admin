'use client';

import { useState, useMemo, useEffect } from 'react';
import { tokenStore } from '@/lib/token-store';
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
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');  // S146: 期間絞り込み
  const [dateTo, setDateTo] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<string>('all');  // S146: 顧客絞り込み
  const [customers, setCustomers] = useState<{id:string; name:string}[]>([]);
  const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';

  const filtered = useMemo(() => {
    const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const toMs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;
    return auditLogs.filter((log) => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (userFilter !== 'all' && log.user_id !== userFilter) return false;
      if (customerFilter !== 'all' && log.customer_id !== customerFilter) return false;
      if (fromMs !== null || toMs !== null) {
        const t = new Date(log.created_at).getTime();
        if (fromMs !== null && t < fromMs) return false;
        if (toMs !== null && t > toMs) return false;
      }
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
  }, [auditLogs, search, actionFilter, userFilter, dateFrom, dateTo, customerFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // S147: 監査ログは next_cursor を辿って全件取得（200件で頭打ちにしない）
        const fetchAllAuditLogs = async (): Promise<AuditLog[]> => {
          const all: AuditLog[] = [];
          let cursor: string | null = null;
          for (let i = 0; i < 50; i++) {
            const qs: string = cursor
              ? `/audit-logs?limit=200&cursor=${encodeURIComponent(cursor)}`
              : '/audit-logs?limit=200';
            const res = await api.get<{ items?: AuditLog[]; pagination?: { next_cursor?: string | null } } | AuditLog[]>(qs);
            const items = Array.isArray(res) ? res : (res.items ?? []);
            all.push(...items);
            const next = Array.isArray(res) ? null : (res.pagination?.next_cursor ?? null);
            if (!next) break;
            cursor = next;
          }
          return all;
        };

        const [aArr, uRes] = await Promise.all([
          fetchAllAuditLogs(),
          api.get<{items?: User[]} | User[]>('/users?limit=200'),
        ]);
        if (cancelled) return;
        const uArr = Array.isArray(uRes) ? uRes : (uRes.items ?? []);
        setAuditLogs(aArr);
        setUsers(uArr);
        // S146: lv1_super 時は顧客一覧を取得（顧客絞り込み用）
        if (tokenStore.getUser()?.role === 'lv1_super') {
          try {
            const cRes = await api.get<{items?: {id:string;name:string}[]} | {id:string;name:string}[]>('/customers?limit=200');
            if (!cancelled) setCustomers(Array.isArray(cRes) ? cRes : (cRes.items ?? []));
          } catch (e2) { console.error('[audit-logs] customers fetch failed:', e2); }
        }
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
          {isSuperAdmin && (
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="顧客" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全顧客</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}（{c.id}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs" title="開始日" />
            <span className="text-xs text-muted-foreground">〜</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs" title="終了日" />
            {(dateFrom || dateTo) && (
              <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-[10.5px] text-muted-foreground hover:underline ml-1">クリア</button>
            )}
          </div>
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
              <TableHead>顧客</TableHead>
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
                <TableCell className="text-xs">
                  {log.customer_id
                    ? <span className="font-mono text-[10.5px] text-amber-500/90">{log.customer_id}</span>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
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
