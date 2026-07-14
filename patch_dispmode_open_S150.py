#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_dispmode_open_S150.py

目的:
  端末詳細ページ src/app/devices/[id]/page.tsx の「表示モード（白黒・高コントラスト）」UI を、
  現状の lv1_super 限定（{isSuperAdmin && (...)}）から、ログイン済みなら全ロールに開放する。

安全性:
  backend send_command は get_current_user のみ + customer_id 絞り込みで
  「自分の所属顧客の什器のみ操作可」を保証済み（lv1_super以外は Device.customer_id == user.customer_id）。
  よって UI を全ロールに開いても、各自は自分の什器しか操作できない。クロステナントは backend が NotFound で弾く。

方式:
  .bak 退避 + count==1 アンカーアサート + 文字列置換。tsx なので構文検証は後続の npm run build で行う。
  - コメント 704行 「屋外視認性対策・運営専用」 → 「屋外視認性対策。自分の什器のみ操作可」
  - 705行 「{isSuperAdmin && (」 → 「{detail && (」 で開放（detail があれば描画＝端末詳細が読めている）
  - 対応する閉じ 「  )}」 はそのまま（条件式の形は不変）
"""
import hashlib
import shutil
import sys

PATH = "src/app/devices/[id]/page.tsx"

# ─── アンカー（一意） ───────────────────────────────────────────────
# コメント行＋条件開始を1つのブロックとして特定する。インデント込みで一意。
ANCHOR = (
    "                  {/* S147c: 表示モード（屋外視認性対策・運営専用）*/}\n"
    "                  {isSuperAdmin && (\n"
)
REPLACEMENT = (
    "                  {/* S147c: 表示モード（屋外視認性対策・自分の什器のみ操作可。backendがcustomer_id絞り込みで保証）*/}\n"
    "                  {detail && (\n"
)

EXPECT_BEFORE_MD5 = "5ac9fc39ed10661eccc6ebdef9cf7609"


def md5_of(s: bytes) -> str:
    return hashlib.md5(s).hexdigest()


def main() -> int:
    with open(PATH, "rb") as f:
        raw = f.read()

    before_md5 = md5_of(raw)
    print(f"[info] before md5: {before_md5}")
    if before_md5 != EXPECT_BEFORE_MD5:
        print(f"[WARN] before md5 が期待値 {EXPECT_BEFORE_MD5} と不一致。"
              " ファイルが既に変更されている可能性。中断します。")
        return 1

    text = raw.decode("utf-8")

    cnt = text.count(ANCHOR)
    if cnt != 1:
        print(f"[FAIL] anchor count={cnt} (期待 1)。中断します。")
        return 1
    print("[ok] anchor count==1")

    new_text = text.replace(ANCHOR, REPLACEMENT)

    shutil.copy2(PATH, PATH + ".bak_S150_dispmode_open_pre")
    print(f"[ok] backup -> {PATH}.bak_S150_dispmode_open_pre")

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(new_text)

    after_md5 = md5_of(new_text.encode("utf-8"))
    print(f"[info] after md5: {after_md5}")
    print("[done] 表示モードUIを全ログインユーザーに開放しました。")
    print("       次: npm run build で検証 → 問題なければ git add/commit/push。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
