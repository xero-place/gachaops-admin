// src/i18n/useT.ts
// 現在の言語の辞書と、通貨フォーマッタを返すフック。
//
// 料金は「円で入力・保存」のまま。表示だけを言語で切り替える:
//   ja → 「700 円」
//   en → 「$7.00」  （固定レート 100円 = $1.00、為替とは無関係の表示換算）
//
// この換算は表示専用。DB・API・決済実体には一切影響しない。

import { dictionaries, type Dictionary } from "@/i18n/dictionaries";
import { useLocale } from "@/store/useLocale";

// 100円 = 1.00 USD（固定・表示専用）
const YEN_PER_USD = 100;

export function useT(): {
  t: Dictionary;
  locale: "ja" | "en";
  /** 円の数値を、現在の言語に合わせた通貨文字列にする（入力・保存は常に円） */
  formatPrice: (yen: number | null | undefined) => string;
  /** 円→ドルの表示用換算値（数値）。en 側UIで併記したいとき用 */
  yenToUsd: (yen: number) => number;
} {
  const locale = useLocale((s) => s.locale);
  const t = dictionaries[locale];

  const yenToUsd = (yen: number) => yen / YEN_PER_USD;

  const formatPrice = (yen: number | null | undefined) => {
    const n = typeof yen === "number" && isFinite(yen) ? yen : 0;
    if (locale === "en") {
      const usd = n / YEN_PER_USD;
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(usd);
    }
    // ja: 整数円 + 単位
    return `${new Intl.NumberFormat("ja-JP").format(n)} ${t.common.yen}`;
  };

  return { t, locale, formatPrice, yenToUsd };
}
