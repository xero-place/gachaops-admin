'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Monitor,
  MapPinned,
  CalendarRange,
  ClipboardList,
  Layers3,
  PackageSearch,
  Coins,
  Smartphone,
  ShieldCheck,
  TerminalSquare,
  Building2,
  Briefcase,
  Settings,
  Zap,
  Sparkles,
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
      // ガチャ演出(/gacha/draw-effects)は端末詳細の「演出」タブに一本化したため非表示。ページは温存。
      { href: '/gacha/effect-packs', label: '演出パック', icon: Sparkles, badge: 'NEW' },
      // デフォルト演出(/gacha/account-default)はL2フォールバック(cust_demo向け)で運営が日常的に触らないため非表示。ページは温存。
      // 抽選プール(/gacha/pools)は1端末1専用プール化により表から不要。端末詳細(価格/演出タブ)に集約。ページ・engine.pyは温存。
      { href: '/devices', label: '端末', icon: Monitor },
      { href: '/devices/map', label: '端末マップ', icon: MapPinned },
      { href: '/device-groups', label: 'グループ', icon: Layers3 },
      // S127: 注文ページは売上管理(統合ビュー)に集約。返金機能のため実体は温存・直リンク到達可
      // { href: '/orders', label: '注文', icon: Receipt },
      { href: '/sales-events', label: '売上管理', icon: Coins },
      // 在庫(/inventories)は系統B(空箱・engine.py非参照)のため非表示。実在庫は端末詳細の在庫タブ(系統A)。
    ],
  },
  {
    label: 'コンテンツ配信',
    items: [
      { href: '/programs', label: 'プログラム', icon: ClipboardList },
      { href: '/assets', label: '素材', icon: PackageSearch },
      { href: '/plan-schedules', label: '計画配信', icon: CalendarRange },
    ],
  },
  {
    label: '設定',
    items: [
      { href: '/customers', label: '顧客', icon: Briefcase },
      { href: '/stores', label: '店舗', icon: Building2 },
      { href: '/apk', label: 'アップデート', icon: Smartphone },
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
          <span>
            {process.env.NEXT_PUBLIC_API_BASE_URL
              ? '実 API モード (本番)'
              : 'モックモード (NEXT_PUBLIC_API_BASE_URL 未設定)'}
          </span>
        </div>
      </div>
    </aside>
  );
}
