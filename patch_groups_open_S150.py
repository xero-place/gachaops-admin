#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_groups_open_S150.py  (admin / Mac ~/Documents/gachaops-admin)

目的:
  グループページ src/app/device-groups/page.tsx の編集機能を、lv1_super 限定から
  全ログインユーザー（実質 lv2_admin 以上）に開放する。
  backend が customer_id 絞り込みで「自顧客のグループのみ」を保証するため、UIを開いても
  他顧客のグループは触れない（NotFound で弾かれる）。

変更（4箇所）:
  (1) 97行付近: 「新規グループ」ボタンの {isSuperAdmin && (...)} を除去 → 全員に表示
  (2) 118行付近: canEdit={isSuperAdmin} → canEdit={true}（編集/削除を全員に開く）
  (3) 451行付近: 箸休め保存の発火条件 `isSuperAdmin && restProgramId !== initialRest`
        → `restProgramId !== initialRest`（権限縛りを外し、変更時のみ叩く）
  (4) 499行付近: 箸休めUIブロックの {isSuperAdmin && (...)} を除去 → 全員に表示
        ＋運営専用の文言を実態に合わせて修正

方式:
  .bak 退避 + 各アンカー count==1 アサート + npm run build で検証。
  注意: isSuperAdmin の宣言（48行）と EditGroupDialog への prop 受け渡しは残す
  （他で参照が消えて未使用になるとビルド warning になり得るが、(3)で参照が残るため問題なし）。
"""
import hashlib
import shutil
import sys

PATH = "src/app/device-groups/page.tsx"
EXPECT_BEFORE_MD5 = None  # 実行時に表示

# ─── (1) 新規グループボタン ─────────────────────────────────
ANCHOR_1 = (
    '        {isSuperAdmin && (\n'
    '          <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>\n'
    '            <Plus className="h-3.5 w-3.5" />新規グループ\n'
    '          </Button>\n'
    '        )}\n'
)
REPLACE_1 = (
    '        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>\n'
    '          <Plus className="h-3.5 w-3.5" />新規グループ\n'
    '        </Button>\n'
)

# ─── (2) canEdit ───────────────────────────────────────────
ANCHOR_2 = '                canEdit={isSuperAdmin}\n'
REPLACE_2 = '                canEdit={true}\n'

# ─── (3) 箸休め保存の発火条件 ───────────────────────────────
ANCHOR_3 = (
    '      // S145: 箸休めは lv1_super 専用エンドポイント。権限がある かつ 変更された時だけ叩く。\n'
    '      if (isSuperAdmin && restProgramId !== initialRest) {\n'
)
REPLACE_3 = (
    '      // S145/S150: 箸休めは lv2_admin 以上に開放済み。変更された時だけ叩く。\n'
    '      if (restProgramId !== initialRest) {\n'
)

# ─── (4) 箸休めUIブロック ───────────────────────────────────
ANCHOR_4 = (
    '          {/* S145: 箸休め番組（運営lv1_superのみ表示・顧客には出ない） */}\n'
    '          {isSuperAdmin && (\n'
)
REPLACE_4 = (
    '          {/* S145/S150: 箸休め番組（全アカウントで設定可。backendがcustomer_id絞り込みで自顧客のみ保証） */}\n'
    '          {true && (\n'
)


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
    text = replace_once(text, ANCHOR_1, REPLACE_1, "1(新規ボタン)")
    text = replace_once(text, ANCHOR_2, REPLACE_2, "2(canEdit)")
    text = replace_once(text, ANCHOR_3, REPLACE_3, "3(箸休め保存条件)")
    text = replace_once(text, ANCHOR_4, REPLACE_4, "4(箸休めUI)")

    shutil.copy2(PATH, PATH + ".bak_S150_groups_open_pre")
    print(f"[ok] backup -> {PATH}.bak_S150_groups_open_pre")

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"[info] after md5: {md5_of(text.encode('utf-8'))}")
    print("[done] グループ編集UIを全ログインユーザーに開放しました。")
    print("       次: npm run build で検証 → git add/commit/push。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
