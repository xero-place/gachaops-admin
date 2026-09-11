// src/store/useLocale.ts
// 言語設定をログインユーザーごとに保持する zustand ストア。
// backend 改修なしのフロント完結。ユーザー識別子ごとに localStorage キーを分ける。
//
// userId が変わったら（ログインユーザー切替）loadForUser を呼んで読み直す。
// 未ログイン時は "guest" 扱い。

import { create } from "zustand";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/i18n/dictionaries";

const KEY_PREFIX = "gachaops.admin.locale.";
// ★S237: 直近の選択を保持する共有キー。ユーザー別キーが未設定のときのフォールバック。
//   ヘッダーは初回レンダーで user=null のため LocaleBootstrap が一瞬 userId=null で走る。
//   そこで "guest" キー(通常は未設定=ja)を読んでしまうと、EN を選んでいても
//   リロードのたびに日本語へ戻って見える。__last を挟んでこれを防ぐ。
const LAST_KEY = KEY_PREFIX + "__last";

function storageKey(userId: string | null): string {
  return KEY_PREFIX + (userId && userId.length > 0 ? userId : "guest");
}

function isLocale(v: string | null): v is Locale {
  return !!v && (LOCALES as string[]).includes(v);
}

function readStored(userId: string | null): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    // 言語設定は「ログインユーザーごと」。ここでは __last へフォールバックしない
    // （別ユーザーの選択が引き継がれないようにするため）。
    const v = window.localStorage.getItem(storageKey(userId));
    if (isLocale(v)) return v;
  } catch {
    // localStorage が使えない環境（プライベートモード等）はデフォルトに落とす
  }
  return DEFAULT_LOCALE;
}

interface LocaleState {
  userId: string | null;
  locale: Locale;
  loadForUser: (userId: string | null) => void;
  /** S237: ユーザー確定前でも直近の選択言語を復元する（ちらつき・戻り防止） */
  hydrateFromLast: () => void;
  setLocale: (locale: Locale) => void;
}

export const useLocale = create<LocaleState>((set, get) => ({
  userId: null,
  // 初期値はサーバー描画と揃えるため DEFAULT_LOCALE のまま。実際の言語は
  // LocaleBootstrap の loadForUser / hydrateFromLast で復元する。
  locale: DEFAULT_LOCALE,
  loadForUser: (userId) => {
    // ★S237: userId が未確定(null)の初回マウントでは、すでに決まっている表示言語を
    //   維持する。ここで "guest" を読んで上書きすると EN→JA に戻って見えるため。
    if (!userId) {
      set({ userId: null });
      return;
    }
    set({ userId, locale: readStored(userId) });
  },
  hydrateFromLast: () => {
    if (typeof window === "undefined") return;
    try {
      const last = window.localStorage.getItem(LAST_KEY);
      if (isLocale(last) && last !== get().locale) set({ locale: last });
    } catch {
      // 読めなければ何もしない
    }
  },
  setLocale: (locale) => {
    const { userId } = get();
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey(userId), locale);
        // ★S237: 直近の選択も保存。ユーザー別キーが無い状況でも言語が戻らないようにする。
        window.localStorage.setItem(LAST_KEY, locale);
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
