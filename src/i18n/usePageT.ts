// src/i18n/usePageT.ts
// ページ単位の軽量i18nフック。中央 Dictionary 型に依存せず、各ページが
// 自分専用の辞書 { ja, en } を渡す。未対応ページは従来どおり日本語のまま動く（非破壊）。
//
// 使い方:
//   import { usePageT } from '@/i18n/usePageT';
//   const dict = { ja: { title: 'ダッシュボード' }, en: { title: 'Dashboard' } } as const;
//   const t = usePageT(dict);  // t.title が現在言語で返る
//
// 型: dict[locale] は ja型 | en型 のユニオン。両方に存在するキーのみアクセス可＝
//     en の訳し忘れ（キー欠落）は型エラーで検出される。
import { useLocale } from "@/store/useLocale";

export function usePageT<J, E>(dict: { ja: J; en: E }): J | E {
  const locale = useLocale((s) => s.locale);
  return locale === "en" ? dict.en : dict.ja;
}
