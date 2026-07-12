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

  useEffect(() => {
    loadForUser(userId);
  }, [userId, loadForUser]);

  return null;
}
