'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowDownRight,
  ArrowUpRight,
  Activity,
  AlertTriangle,
  Boxes,
  ReceiptText,
  Wifi,
  Zap,
  Loader2,
} from 'lucide-react';
import { fmtYen, fmtRelative } from '@/lib/format';
import { DeviceStatusBadge } from '@/components/domain/status-badges';
import Link from 'next/link';
import { SalesTrendChart } from './_components/sales-trend-chart';
import { useDashboardData, useOfflineDevicesList } from '@/lib/dashboard-data';

export default function DashboardPage() {
  const { overview, salesStats, loading, error } = useDashboardData();
  const { items: offlineDevices } = useOfflineDevicesList(6);

  if (loading || !overview) {
    return (
      <AppShell title="ダッシュボード" breadcrumb={['ホーム']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const onlinePct = overview.device_total > 0
    ? Math.round((overview.device_online / overview.device_total) * 100)
    : 0;

  let salesDelta = 0;
  if (salesStats.length >= 2) {
    const today = salesStats[salesStats.length - 1];
    const yesterday = salesStats[salesStats.length - 2];
    if (yesterday.revenue_yen > 0) {
      salesDelta = ((today.revenue_yen - yesterday.revenue_yen) / yesterday.revenue_yen) * 100;
    }
  }

  const totalSalesIn14d = salesStats.reduce((a, s) => a + s.revenue_yen, 0);
  const totalOrdersIn14d = salesStats.reduce((a, s) => a + s.orders, 0);

  return (
    <AppShell title="ダッシュボード" breadcrumb={['ホーム']}>
      {error && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          データ取得エラー: {error}
        </div>
      )}

      <Link
        href="/live-control"
        className="block mb-5 rounded-lg border border-primary/40 bg-gradient-to-r from-primary/15 to-primary/5 p-4 hover:bg-primary/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
            <Zap className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">ライブ操作センター</div>
            <div className="text-xs text-muted-foreground">
              全マシンの映像を遠隔で即時切替・店舗単位/グループ単位の一斉配信
            </div>
          </div>
          <span className="text-xs text-primary font-medium">→</span>
        </div>
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="本日の売上"
          value={fmtYen(overview.revenue_today_yen)}
          delta={salesStats.length >= 2 ? salesDelta : undefined}
          deltaLabel="前日比"
          icon={<ReceiptText className="h-4 w-4" />}
          accent="primary"
        />
        <KpiCard
          label="本日の注文"
          value={String(overview.orders_today)}
          deltaLabel={`過去14日: ${totalOrdersIn14d}件`}
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiCard
          label="稼働中の端末"
          value={`${overview.device_online} / ${overview.device_total}`}
          deltaLabel={overview.device_total > 0 ? `稼働率 ${onlinePct}%` : '端末未登録'}
          icon={<Wifi className="h-4 w-4" />}
          accent={onlinePct >= 90 ? 'ok' : onlinePct >= 50 ? undefined : 'warn'}
        />
        <KpiCard
          label="低在庫アラート"
          value={String(overview.low_stock_inventories)}
          deltaLabel={`配信中タスク: ${overview.active_tasks}`}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent={overview.low_stock_inventories > 5 ? 'warn' : undefined}
        />
      </div>

      <Card className="mb-6">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>売上推移 (過去14日)</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              通算 {fmtYen(totalSalesIn14d)} / 注文 {totalOrdersIn14d}件
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/orders">注文一覧へ →</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {salesStats.length > 0 ? (
            <SalesTrendChart
              data={salesStats.map((s) => ({
                date: s.date,
                orders: s.orders,
                revenue_yen: s.revenue_yen,
                refunded_count: 0,
                refunded_yen: 0,
              }))}
            />
          ) : (
            <div className="text-center text-sm text-muted-foreground py-12">
              データがまだありません
            </div>
          )}
        </CardContent>
      </Card>

      {offlineDevices.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              オフライン端末 ({offlineDevices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {offlineDevices.map((d) => (
                <div key={d.id} className="flex items-center gap-3 p-2 rounded-md bg-card">
                  <Boxes className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{d.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      最終接続 {fmtRelative(d.last_heartbeat_at ?? null)}
                    </div>
                  </div>
                  <DeviceStatusBadge status={d.status as 'online' | 'offline' | 'maintenance' | 'never_connected'} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  icon,
  accent,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  icon?: React.ReactNode;
  accent?: 'primary' | 'ok' | 'warn';
}) {
  const accentClass =
    accent === 'primary'
      ? 'text-primary'
      : accent === 'ok'
        ? 'text-ok'
        : accent === 'warn'
          ? 'text-warn'
          : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className={`text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</div>
        {(deltaLabel || delta !== undefined) && (
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {delta !== undefined && (
              <span className={delta >= 0 ? 'text-ok' : 'text-destructive'}>
                {delta >= 0 ? <ArrowUpRight className="inline h-3 w-3" /> : <ArrowDownRight className="inline h-3 w-3" />}
                {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
              </span>
            )}
            <span>{deltaLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
