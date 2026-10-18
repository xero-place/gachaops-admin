// S262: WEBマニュアル（GTCHA X 本体・管理画面の使い方）へのリンク集。
export const MANUAL_BASE = 'https://new-iot-gtchax.netlify.app';
export const MANUAL_URL = `${MANUAL_BASE}/#/`;

export const MANUAL_SECTIONS: { label: string; href: string }[] = [
  { label: '本体とシステムの両方で設定する', href: `${MANUAL_BASE}/#/a/admin-dual` },
  { label: '料金（A004）', href: `${MANUAL_BASE}/#/a/code-a004` },
  { label: '在庫（A007）', href: `${MANUAL_BASE}/#/a/code-a007` },
  { label: '設定ロック（A009）', href: `${MANUAL_BASE}/#/a/code-a009` },
  { label: '売り切れでも販売（A00A）', href: `${MANUAL_BASE}/#/a/code-a00a` },
  { label: '料金の単位（A00F）', href: `${MANUAL_BASE}/#/a/code-a00f` },
  { label: '硬貨の登録', href: `${MANUAL_BASE}/#/a/coin-register` },
];

export const MANUAL_VIDEOS = {
  a004: `${MANUAL_BASE}/a004_web.mp4`,
  a00f: `${MANUAL_BASE}/a00f_web.mp4`,
  a007: `${MANUAL_BASE}/a007_web.mp4`,
};

export const SUPPORT_PHONE = '050-1724-5360';
export const SUPPORT_PHONE_HOURS = '平日10:00〜19:00';
export const SUPPORT_EMAIL = 'gtchax@xeroplace.jp';

/** 新しいタブで開くリンクに付ける属性 */
export const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;
