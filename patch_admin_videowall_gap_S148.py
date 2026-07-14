#!/usr/bin/env python3
# S148-fix: プレビューのマシン間隔を実ベゼルに連動（ベゼル0なら隙間0＝びっちり）。
# 既存の Math.max(6, ...) を撤廃。count==1・.bak・md5。
import hashlib, shutil, datetime

TARGET = "src/app/device-groups/page.tsx"
def md5(p): return hashlib.md5(open(p,"rb").read()).hexdigest()
pre = md5(TARGET); print(f"[pre]  md5 = {pre}")
ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
bak = f"{TARGET}.bak_S148_gap_{ts}"
shutil.copy2(TARGET, bak); print(f"[bak]  {bak}")
src = open(TARGET, encoding="utf-8").read()

old = "          bezelPx={Math.max(6, Math.round(vw.bezel_px / 6))}"
new = "          bezelPx={Math.round(vw.bezel_px / 6)}"
assert src.count(old) == 1, f"[FAIL] bezelPx anchor = {src.count(old)}"
src = src.replace(old, new)

open(TARGET, "w", encoding="utf-8").write(src)
post = md5(TARGET); print(f"[post] md5 = {post}")
assert pre != post
print("[OK] プレビューのマシン間隔を実ベゼル連動に（ベゼル0で隙間0＝びっちり）")
