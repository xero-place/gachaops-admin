import { Badge } from '@/components/ui/badge';
import type {
  DeviceStatus,
  PlayMode,
  TaskStatus,
  OrderStatus,
} from '@/types/domain';
import { cn } from '@/lib/utils';
import { usePageT } from '@/i18n/usePageT';
import { statusBadgesDict } from '@/i18n/ns/statusBadges';

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const t = usePageT(statusBadgesDict);
  if (status === 'online') {
    return (
      <Badge variant="ok" className="gap-1.5 whitespace-nowrap">
        <span className="live-dot" />
        {t.device.online}
      </Badge>
    );
  }
  if (status === 'maintenance') return <Badge variant="warn">{t.device.maintenance}</Badge>;
  if (status === 'offline') return <Badge variant="destructive">{t.device.offline}</Badge>;
  return <Badge variant="muted">{t.device.never_connected}</Badge>;
}

export function PlayModeBadge({ mode }: { mode: PlayMode }) {
  const t = usePageT(statusBadgesDict);
  const cls =
    mode === 'plan'
      ? 'bg-blue-500/15 text-blue-400 border-transparent'
      : mode === 'manual'
        ? 'bg-purple-500/15 text-purple-400 border-transparent'
        : 'bg-muted text-muted-foreground border-transparent';
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs', cls)}>{t.play[mode]}</span>;
}

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
  const t = usePageT(statusBadgesDict);
  return <Badge variant={TASK_VARIANT[status]}>{t.task[status]}</Badge>;
}

const ORDER_VARIANT: Record<OrderStatus, 'default' | 'ok' | 'warn' | 'destructive' | 'muted' | 'secondary'> = {
  pending: 'warn',
  paid: 'ok',
  failed: 'destructive',
  cancelled: 'muted',
  refunded: 'secondary',
  expired: 'muted',
};
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = usePageT(statusBadgesDict);
  return <Badge variant={ORDER_VARIANT[status]}>{t.order[status]}</Badge>;
}
