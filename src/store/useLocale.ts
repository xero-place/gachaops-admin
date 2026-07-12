// src/store/useLocale.ts
// 言語設定をログインユーザーごとに保持する zustand ストア。
// backend 改修なしのフロント完結。ユーザー識別子ごとに localStorage キーを分ける。
//
// userId が変わったら（ログインユーザー切替）loadForUser を呼んで読み直す。
// 未ログイン時は "guest" 扱い。

import { create } from "zustand";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/i18n/dictionaries";

const KEY_PREFIX = "gachaops.admin.locale.";

function storageKey(userId: string | null): string {
  return KEY_PREFIX + (userId && userId.length > 0 ? userId : "guest");
}

function readStored(userId: string | null): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const v = window.localStorage.getItem(storageKey(userId));
    if (v && (LOCALES as string[]).includes(v)) return v as Locale;
  } catch {
    // localStorage が使えない環境（プライベートモード等）はデフォルトに落とす
  }
  return DEFAULT_LOCALE;
}

interface LocaleState {
  userId: string | null;
  locale: Locale;
  loadForUser: (userId: string | null) => void;
  setLocale: (locale: Locale) => void;
}

export const useLocale = create<LocaleState>((set, get) => ({
  userId: null,
  locale: DEFAULT_LOCALE,
  loadForUser: (userId) => {
    set({ userId, locale: readStored(userId) });
  },
  setLocale: (locale) => {
    const { userId } = get();
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey(userId), locale);
      } catch {
        // 保存に失敗してもUI言語は即時切り替える
      }
    }
    // <html lang> も更新（アクセシビリティ／SEO整合）
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
    set({ locale });
  },
}));
