'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Monitor,
  MapPinned,
  Users2,
  Boxes,
  CalendarRange,
  ClipboardList,
  Layers3,
  ShoppingBag,
  PackageSearch,
  Receipt,
  Smartphone,
  ShieldCheck,
  Activity,
  TerminalSquare,
  Building2,
  Settings,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'コア',
    items: [
      { href: '/', label: 'ダッシュボード', icon: LayoutDashboard },
      { href: '/live-control', label: 'ライブ操作', icon: Zap, badge: 'NEW' },
      { href: '/devices', label: '端末', icon: Monitor },
      { href: '/devices/map', label: '端末マップ', icon: MapPinned },
      { href: '/device-groups', label: 'グループ', icon: Layers3 },
      { href: '/orders', label: '注文', icon: Receipt },
      { href: '/inventories', label: '在庫', icon: Boxes },
    ],
  },
  {
    label: 'コンテンツ配信',
    items: [
      { href: '/programs', label: 'プログラム', icon: ClipboardList },
      { href: '/assets', label: '素材', icon: PackageSearch },
      { href: '/tasks', label: '配信タスク', icon: Activity },
      { href: '/plan-schedules', label: '時間割', icon: CalendarRange },
    ],
  },
  {
    label: '設定',
    items: [
      { href: '/stores', label: '店舗', icon: Building2 },
      { href: '/products', label: '商品', icon: ShoppingBag },
      { href: '/users', label: 'ユーザ', icon: Users2 },
      { href: '/apk', label: 'APK', icon: Smartphone },
    ],
  },
  {
    label: 'システム',
    items: [
      { href: '/audit-logs', label: '監査ログ', icon: ShieldCheck },
      { href: '/ws-console', label: 'WSデバッグコンソール', icon: TerminalSquare },
      { href: '/settings', label: '環境設定', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r bg-card/40">
      <div className="flex h-14 items-center px-5 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-white">
            <Image
              src="/logo-gtchax.png"
              alt="GTCHAXAPP"
              width={28}
              height={28}
              className="object-contain"
              priority
            />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">GTCHAXAPP</div>
            <div className="text-[10px] text-muted-foreground tracking-wider uppercase">
              admin · v0.1
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="px-3 mb-1.5 text-[10px] font-semibold text-muted-foreground/70 tracking-widest uppercase">
              {group.label}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/' && pathname?.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-primary/15 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                      )}
                    >
                      <item.icon className="h-4 w-4" strokeWidth={2} />
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto text-[10px] rounded-full bg-primary/20 text-primary px-1.5 py-0.5">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t p-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span>モックモード (NEXT_PUBLIC_API_BASE_URL 未設定)</span>
        </div>
      </div>
    </aside>
  );
}
