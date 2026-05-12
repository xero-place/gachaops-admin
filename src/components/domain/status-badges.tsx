import { Badge } from '@/components/ui/badge';
import type {
  DeviceStatus,
  PlayMode,
  TaskStatus,
  OrderStatus,
} from '@/types/domain';
import { cn } from '@/lib/utils';

const DEVICE_LABELS: Record<DeviceStatus, string> = {
  online: 'オンライン',
  offline: 'オフライン',
  maintenance: '保守中',
  never_connected: '未接続',
};

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  if (status === 'online') {
    return (
      <Badge variant="ok" className="gap-1.5">
        <span className="live-dot" />
        {DEVICE_LABELS.online}
      </Badge>
    );
  }
  if (status === 'maintenance') return <Badge variant="warn">{DEVICE_LABELS.maintenance}</Badge>;
  if (status === 'offline') return <Badge variant="destructive">{DEVICE_LABELS.offline}</Badge>;
  return <Badge variant="muted">{DEVICE_LABELS.never_connected}</Badge>;
}

const PLAY_LABELS: Record<PlayMode, string> = {
  plan: '計画モード',
  manual: '手動モード',
  idle: '待機',
};
export function PlayModeBadge({ mode }: { mode: PlayMode }) {
  const cls =
    mode === 'plan'
      ? 'bg-blue-500/15 text-blue-400 border-transparent'
      : mode === 'manual'
        ? 'bg-purple-500/15 text-purple-400 border-transparent'
        : 'bg-muted text-muted-foreground border-transparent';
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs', cls)}>{PLAY_LABELS[mode]}</span>;
}

const TASK_LABELS: Record<TaskStatus, string> = {
  draft: '下書き',
  scheduled: '予約',
  distributing: '配信中',
  completed: '完了',
  partial_success: '一部成功',
  failed: '失敗',
  cancelled: 'キャンセル',
};
const TASK_VARIANT: Record<TaskStatus, 'default' | 'ok' | 'warn' | 'destructive' | 'muted' | 'secondary'> = {
  draft: 'muted',
  scheduled: 'secondary',
  distributing: 'default',
  completed: 'ok',
  partial_success: 'warn',
  failed: 'destructive',
  cancelled: 'muted',
};
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant={TASK_VARIANT[status]}>{TASK_LABELS[status]}</Badge>;
}

const ORDER_LABELS: Record<OrderStatus, string> = {
  pending: '処理中',
  paid: '支払済',
  failed: '失敗',
  cancelled: 'キャンセル',
  refunded: '返金済',
  expired: '期限切れ',
};
const ORDER_VARIANT: Record<OrderStatus, 'default' | 'ok' | 'warn' | 'destructive' | 'muted' | 'secondary'> = {
  pending: 'warn',
  paid: 'ok',
  failed: 'destructive',
  cancelled: 'muted',
  refunded: 'secondary',
  expired: 'muted',
};
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={ORDER_VARIANT[status]}>{ORDER_LABELS[status]}</Badge>;
}
