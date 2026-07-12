// src/i18n/dictionaries.ts
// GachaOps 管理画面 i18n 辞書（実ファイル src/app/devices/[id]/page.tsx に整合）。
// ライブラリ非依存・App Router のルーティングを変更しない軽量方式。
// 日本語をソース・オブ・トゥルースとし、英語はキー完全一致（訳し忘れは型エラー）。

export const ja = {
  common: {
    save: "保存する",
    saving: "保存中...",
    preparing: "準備中...",
    yen: "円",
    back: "一覧へ戻る",
  },
  device: {
    tabs: {
      overview: "概要",
      pricing: "価格",
      effects: "演出",
      screenshots: "スクリーンショット",
      powerSchedule: "電源スケジュール",
      apkHistory: "APK履歴",
      inventory: "在庫",
    },
    basicInfo: {
      title: "基本情報",
      id: "ID",
      serial: "シリアル",
      store: "店舗",
      lastSeen: "最終接続",
      created: "作成",
    },
    techInfo: {
      title: "技術情報",
      app: "アプリ",
      os: "OS",
      ip: "IP",
    },
  },
  pricing: {
    title: "料金・支払い",
    machineMissing: "この端末はまだ設定ができません（什器が未登録です）。",
    noPool: "この端末専用の設定がまだありません。下のボタンで用意してください。",
    ensureButton: "この端末専用の設定を用意する",
    acceptMethod: {
      title: "投入の受付方法",
      description: "この什器に投入されたものをどう扱うかを設定します。1台につき一つです。",
      cash: {
        label: "現金",
        description: "100円玉・500円玉を売上（円）として計上します。",
      },
      token: {
        label: "メダル",
        description: "トークンメダルを枚数として記録します（売上には含めません）。",
      },
      none: {
        label: "受け付けない",
        description: "無料ガチャ、またはQR決済のみで運用します。",
      },
    },
    pricePerPlay: {
      label: "1回の料金",
      suffix: "円（ハンドル1回ぶん）",
    },
    qr: {
      title: "QRコード決済",
      checkbox: "QRコード決済を受け付ける",
      note: "ONにするとモニターにQRを表示します（チェックで即時反映・契約先には表示されません）",
    },
  },
  language: {
    label: "言語",
    ja: "日本語",
    en: "English",
  },
} as const;

// ja は `as const` なので葉がリテラル型になる。en に日本語そのものを要求しないよう、
// 葉を string に広げつつキー構造を保つ Widen 型を挟む。
type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
export type Dictionary = Widen<typeof ja>;

export const en: Dictionary = {
  common: {
    save: "Save",
    saving: "Saving...",
    preparing: "Preparing...",
    yen: "yen",
    back: "Back to list",
  },
  device: {
    tabs: {
      overview: "Overview",
      pricing: "Pricing",
      effects: "Effects",
      screenshots: "Screenshots",
      powerSchedule: "Power schedule",
      apkHistory: "APK history",
      inventory: "Inventory",
    },
    basicInfo: {
      title: "Basic info",
      id: "ID",
      serial: "Serial",
      store: "Store",
      lastSeen: "Last seen",
      created: "Created",
    },
    techInfo: {
      title: "Technical info",
      app: "App",
      os: "OS",
      ip: "IP",
    },
  },
  pricing: {
    title: "Payments",
    machineMissing: "This device can't be configured yet (machine not registered).",
    noPool: "This device has no dedicated settings yet. Create them with the button below.",
    ensureButton: "Create settings for this device",
    acceptMethod: {
      title: "Accepted input",
      description: "Choose how this machine handles what's inserted. One setting per machine.",
      cash: {
        label: "Cash",
        // 米国運用のため、円建て計上の説明は英語では表示しない。
        description: "",
      },
      token: {
        label: "Medal",
        description: "Records token medals as a count (not included in sales).",
      },
      none: {
        label: "None",
        description: "Free play, or QR payment only.",
      },
    },
    pricePerPlay: {
      label: "Price per play",
      suffix: "yen (one handle turn)",
    },
    qr: {
      title: "QR payment",
      checkbox: "Accept QR payment",
      note: "When on, a QR code is shown on the monitor (applies instantly; not shown to the client).",
    },
  },
  language: {
    label: "Language",
    ja: "日本語",
    en: "English",
  },
};

export const dictionaries = { ja, en } as const;
export type Locale = keyof typeof dictionaries;
export const LOCALES: Locale[] = ["ja", "en"];
export const DEFAULT_LOCALE: Locale = "ja";
