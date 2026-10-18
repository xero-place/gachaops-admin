// S262: ロール別のメニュー定義（サイドバーとモバイルメニューの唯一の出所）。
// 既存ページは削除せず、それぞれの作業ができる既存ページへ割り当てる。
// 運営専用ページ（顧客・キャッシュレス決済・アプリの更新・操作の記録など）は顧客メニューに出さない。

export interface ShellNavItem {
  href: string;
  label: string;
}

export interface ShellNav {
  /** 上段のメインメニュー */
  main: ShellNavItem[];
  /** 区切り線の下（設定など） */
  bottom: ShellNavItem[];
  /** 「その他」にまとめる既存ページ */
  more: ShellNavItem[];
}

export const STAFF_NAV: ShellNav = {
  main: [
    { href: '/', label: 'ホーム' },
    { href: '/customers', label: '顧客' },
    { href: '/devices', label: 'マシン' },
    { href: '/device-groups', label: 'グループ作成' },
    { href: '/sales-events', label: '売上' },
    { href: '/orders', label: 'キャッシュレス決済' },
    { href: '/programs', label: '映像' },
    { href: '/apk', label: 'アプリの更新' },
  ],
  bottom: [
    { href: '/settings', label: '設定' },
    { href: '/help', label: '困ったとき' },
  ],
  more: [
    { href: '/dashboard', label: '数字のまとめ' },
    { href: '/devices/map', label: 'マシンの地図' },
    { href: '/plan-schedules', label: '日時を決めて流す' },
    { href: '/live', label: 'リンク再生' },
    { href: '/stores', label: '店舗' },
    { href: '/audit-logs', label: '操作の記録' },
    { href: '/ws-console', label: '通信の確認（開発用）' },
  ],
};

export const CUSTOMER_NAV: ShellNav = {
  main: [
    { href: '/', label: 'ホーム' },
    { href: '/devices', label: 'マシン' },
    { href: '/device-groups', label: 'グループ作成' },
    { href: '/programs', label: '映像' },
    { href: '/sales-events', label: '売上' },
  ],
  bottom: [
    { href: '/settings', label: '設定' },
    { href: '/help', label: '困ったとき' },
  ],
  more: [
    { href: '/dashboard', label: '数字のまとめ' },
    { href: '/plan-schedules', label: '日時を決めて流す' },
    { href: '/live', label: 'リンク再生' },
    { href: '/stores', label: '店舗' },
  ],
};

export const SHELL_NAV_EN: Record<string, string> = {
  'ホーム': 'Home',
  '顧客': 'Customers',
  'グループ作成': 'Groups',
  'マシン': 'Machines',
  '売上': 'Sales',
  'キャッシュレス決済': 'Cashless payments',
  '映像': 'Videos',
  'アプリの更新': 'App updates',
  '設定': 'Settings',
  '当たりの演出': 'Win effects',
  '困ったとき': 'Help',
  'その他': 'More',
  '数字のまとめ': 'Overview',
  'マシンの地図': 'Machine map',
  'マシンのグループ': 'Machine groups',
  '映像の素材': 'Video files',
  '日時を決めて流す': 'Scheduled playback',
  'リンク再生': 'Link playback',
  '店舗': 'Stores',
  '操作の記録': 'Audit log',
  '通信の確認（開発用）': 'Connection check (dev)',
};

export function navFor(isStaff: boolean): ShellNav {
  return isStaff ? STAFF_NAV : CUSTOMER_NAV;
}

/** いちばん長く一致するメニュー項目の href を返す（/devices と /devices/map が両方光らないように）。 */
export function activeHref(nav: ShellNav, pathname: string | null): string | null {
  if (!pathname) return null;
  const all = [...nav.main, ...nav.bottom, ...nav.more];
  let best: string | null = null;
  for (const item of all) {
    const hit =
      item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname.startsWith(item.href + '/');
    if (hit && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}
