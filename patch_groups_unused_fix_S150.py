#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_groups_unused_fix_S150.py  (admin / Mac ~/Documents/gachaops-admin)

目的:
  前パッチ(patch_groups_open_S150.py)で isSuperAdmin の参照が EditGroupDialog 内から
  全て無くなったため、未使用変数エラー（272:29）が発生。
  isSuperAdmin に関する4箇所を整合的に削除して解消する。

削除する4箇所:
  (48行)  const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';
  (132行) isSuperAdmin={isSuperAdmin}            ← EditGroupDialog への prop 渡し
  (272行) 引数分割代入の isSuperAdmin,            ← 受け取り
  (277行) isSuperAdmin: boolean;                 ← 型定義

方式:
  .bak 退避 + 各アンカー count==1 アサート + npm run build で検証。
  行まるごと（改行込み）で除去する。前後の構造は不変。
"""
import hashlib
import shutil
import sys

PATH = "src/app/device-groups/page.tsx"

# (48) 宣言行を丸ごと削除
ANCHOR_DECL = "  const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';\n"
REPLACE_DECL = ""

# (132) prop 渡し行を丸ごと削除
ANCHOR_PROP = "          isSuperAdmin={isSuperAdmin}\n"
REPLACE_PROP = ""

# (272) 引数分割代入から isSuperAdmin, を除去（前後の識別子はそのまま残す）
ANCHOR_ARG = "  group, devices, programs, isSuperAdmin, onClose, onSaved,\n"
REPLACE_ARG = "  group, devices, programs, onClose, onSaved,\n"

# (277) 型定義行を丸ごと削除
ANCHOR_TYPE = "  isSuperAdmin: boolean;\n"
REPLACE_TYPE = ""


def md5_of(b: bytes) -> str:
    return hashlib.md5(b).hexdigest()


def replace_once(text: str, anchor: str, repl: str, label: str) -> str:
    cnt = text.count(anchor)
    if cnt != 1:
        raise SystemExit(f"[FAIL] anchor {label} count={cnt} (期待 1)。中断。")
    print(f"[ok] anchor {label} count==1")
    return text.replace(anchor, repl)


def main() -> int:
    with open(PATH, "rb") as f:
        raw = f.read()
    print(f"[info] before md5: {md5_of(raw)}")

    text = raw.decode("utf-8")
    text = replace_once(text, ANCHOR_DECL, REPLACE_DECL, "宣言(48)")
    text = replace_once(text, ANCHOR_PROP, REPLACE_PROP, "prop渡し(132)")
    text = replace_once(text, ANCHOR_ARG, REPLACE_ARG, "引数(272)")
    text = replace_once(text, ANCHOR_TYPE, REPLACE_TYPE, "型定義(277)")

    shutil.copy2(PATH, PATH + ".bak_S150_unusedfix_pre")
    print(f"[ok] backup -> {PATH}.bak_S150_unusedfix_pre")

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"[info] after md5: {md5_of(text.encode('utf-8'))}")
    print("[done] isSuperAdmin 未使用を解消しました。次: npm run build で検証。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
