// src/components/LocaleBootstrap.tsx
"use client";

import { useEffect } from "react";
import { useLocale } from "@/store/useLocale";

/**
 * ログインユーザーの言語設定を読み込む初期化コンポーネント。
 * レイアウト（認証済みエリア）に一度だけ置く。
 *
 * userId には「ログイン中ユーザーの識別子」を渡す。
 *   - 既にユーザー情報を持つ Context / store があるなら、そこから渡す。
 *   - まだ無いなら、ログイン時に保存している値（例: localStorage の user id や
 *     JWT の sub）を渡す。null なら "guest" キーで保持される。
 *
 * これにより「言語切替はログインユーザーごと」を backend 改修なしで満たす。
 */
export function LocaleBootstrap({ userId }: { userId: string | null }) {
  const loadForUser = useLocale((s) => s.loadForUser);
  const locale = useLocale((s) => s.locale);

  useEffect(() => {
    loadForUser(userId);
  }, [userId, loadForUser]);

  // 選択中の言語に合わせてブラウザタブのタイトルと <html lang> を同期する。
  // （メタデータはサーバ側静的なので、クライアントで locale 反映する）
  useEffect(() => {
    if (typeof document === "undefined") return;
    const en = locale === "en";
    document.documentElement.lang = en ? "en" : "ja";
    document.title = en ? "GTCHAXAPP Admin" : "GTCHAXAPP 管理画面";
  }, [locale]);

  return null;
}
