'use client';

import { useState, useMemo } from 'react';
import { useAdminAlerts, type AdminAlert } from '@/lib/use-admin-alerts';
import { Bell, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Tier 2-G: Alert center - shows recent admin alerts.
 *
 * Renders:
 * - A bell icon with unread count badge in the header
 * - A dropdown panel with alert list + clear button
 * - Live updates via WebSocket
 */
export function AlertCenter() {
  const { alerts, connected, clear } = useAdminAlerts();
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  const unreadCount = useMemo(() => {
    return alerts.filter((a) => !seenIds.has(a.alert_id)).length;
  }, [alerts, seenIds]);

  const handleOpen = () => {
    setOpen((o) => {
      const willOpen = !o;
      if (willOpen) {
        // Mark all as seen on open
        setSeenIds(new Set(alerts.map((a) => a.alert_id)));
      }
      return willOpen;
    });
  };

  const sortedAlerts = useMemo(
    () => [...alerts].sort((a, b) => b.ts_ms - a.ts_ms),
    [alerts]
  );

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        className="relative h-8 w-8 p-0"
        title={connected ? 'アラートセンター (接続中)' : 'アラートセンター (切断中)'}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        {!connected && (
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-yellow-500" />
        )}
      </Button>

      {open && (
        <div
          className="absolute right-0 top-10 z-50 w-80 rounded-md border bg-popover shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="text-sm font-medium">アラート ({alerts.length})</span>
              {connected ? (
                <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] text-green-700 dark:text-green-400">
                  接続中
                </span>
              ) : (
                <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] text-yellow-700 dark:text-yellow-400">
                  再接続中
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {alerts.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clear}
                  className="h-7 text-xs"
                >
                  クリア
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                className="h-7 w-7 p-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {sortedAlerts.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                アラートはありません
              </div>
            ) : (
              sortedAlerts.map((alert) => <AlertItem key={alert.alert_id} alert={alert} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertItem({ alert }: { alert: AdminAlert }) {
  const Icon =
    alert.severity === 'critical'
      ? AlertCircle
      : alert.severity === 'warning'
      ? AlertTriangle
      : Info;
  const iconClass =
    alert.severity === 'critical'
      ? 'text-red-500'
      : alert.severity === 'warning'
      ? 'text-yellow-500'
      : 'text-blue-500';

  const dateStr = new Date(alert.ts_ms).toLocaleTimeString('ja-JP');

  const description = formatAlertDescription(alert);

  return (
    <div className="border-b px-3 py-2 last:border-b-0">
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium truncate">{kindToLabel(alert.kind)}</span>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">{dateStr}</span>
          </div>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function kindToLabel(kind: string): string {
  const map: Record<string, string> = {
    memory_warning: 'メモリ使用量警告',
    memory_critical: 'メモリ使用量危険',
    force_refresh: '強制リフレッシュ実行',
    emergency_stop: '緊急停止実行',
    drift_detected: '同期ずれ検出',
    drift_corrected: '同期ずれ自動修正',
  };
  return map[kind] ?? kind;
}

function formatAlertDescription(alert: AdminAlert): string {
  const p = alert.payload;
  if (alert.kind === 'memory_warning' || alert.kind === 'memory_critical') {
    return `${p.device_id ?? '?'}: ${p.memory_mb ?? '?'}MB (閾値 ${p.threshold_mb ?? '?'}MB)`;
  }
  if (p.device_id) return `${p.device_id}`;
  return '';
}
