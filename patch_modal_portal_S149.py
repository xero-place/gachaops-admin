#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
S149-2: プレビューモーダルをReact Portal化し、radix Dialog(編集モーダル)の
  外側クリック/フォーカス監視から切り離す。これによりプレビューを閉じても
  編集モーダルが閉じず、一覧に戻らなくなる。
  安全策: count==1 assert / .bak / md5。
"""
import hashlib, os, shutil, sys, time

MODAL = "src/components/videowall/VideoWallPreviewModal.tsx"
if not os.path.exists(MODAL):
    MODAL = "VideoWallPreviewModal.tsx"

def md5(s): return hashlib.md5(s.encode("utf-8")).hexdigest()

with open(MODAL, "r", encoding="utf-8") as f:
    src = f.read()
print(f"[INFO] target = {MODAL}")
print(f"[INFO] before md5 = {md5(src)}")

# 編集1: import に createPortal と useEffect/useState を追加
OLD_IMPORT = 'import { useMemo } from "react";'
NEW_IMPORT = '''import { useMemo, useEffect, useState } from "react";
import { createPortal } from "react-dom";'''
assert src.count(OLD_IMPORT) == 1, f"[FAIL] import anchor count={src.count(OLD_IMPORT)}"
src = src.replace(OLD_IMPORT, NEW_IMPORT)
print("[OK] edit1: import createPortal/useEffect/useState")

# 編集2: コンポーネント関数の冒頭に mounted ガードを追加
# "const MW = machineWidth;" の直前に挿入（この行は現物に必ず1つある）
OLD_MW = "  const MW = machineWidth;"
NEW_MW = """  // S149: Portal化のためマウント検知（SSR時はdocumentが無いのでガード）
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const MW = machineWidth;"""
assert src.count(OLD_MW) == 1, f"[FAIL] MW anchor count={src.count(OLD_MW)}"
src = src.replace(OLD_MW, NEW_MW)
print("[OK] edit2: mountedガード追加")

# 編集3: return ( を Portal でラップ開始。
#   "  return (\n    <div\n      onClick={(e) => { e.stopPropagation(); onClose(); }}"
OLD_RETURN = """  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClose(); }}"""
NEW_RETURN = """  if (!mounted) return null;

  return createPortal(
    <div
      onClick={(e) => { e.stopPropagation(); onClose(); }}"""
assert src.count(OLD_RETURN) == 1, f"[FAIL] return anchor count={src.count(OLD_RETURN)}"
src = src.replace(OLD_RETURN, NEW_RETURN)
print("[OK] edit3: return → createPortal でラップ開始")

# 編集4: 関数の閉じ括弧を Portal の第2引数(document.body)付きに変更。
#   末尾の "    </div>\n  );\n}" を "    </div>,\n    document.body\n  );\n}" に。
OLD_END = """    </div>
  );
}"""
NEW_END = """    </div>,
    document.body
  );
}"""
assert src.count(OLD_END) == 1, f"[FAIL] end anchor count={src.count(OLD_END)}"
src = src.replace(OLD_END, NEW_END)
print("[OK] edit4: Portalの第2引数 document.body を追加")

bak = f"{MODAL}.bak_{int(time.time())}"
shutil.copy2(MODAL, bak)
with open(MODAL, "w", encoding="utf-8") as f:
    f.write(src)
print(f"[OK] backup = {bak}")
print(f"[OK] after md5 = {md5(src)}")
print("[DONE] portal patch applied. npm run build で確認してください。")
