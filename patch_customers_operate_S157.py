#!/usr/bin/env python3
# S157: add a "この顧客で操作" (impersonate) button to each customer row on the
# customers page. lv1_super only. Clicking resolves the customer's admin user
# (prefer lv2_admin) via GET /users?customer_id=..., then calls auth.impersonate.
#
# Safety: md5 guard, count==1 asserts. Fill EXPECTED_MD5 after the dry run.

import hashlib

PATH = "src/app/customers/page.tsx"
EXPECTED_MD5 = "af6e3854624bdb962e44ad90527b4299"

with open(PATH, encoding="utf-8") as f:
    src = f.read()

got = hashlib.md5(src.encode()).hexdigest()
if EXPECTED_MD5.startswith("__FILL"):
    print(f"[dry] {PATH} md5 = {got}")
    print("Fill EXPECTED_MD5 and re-run to apply. Nothing written.")
    raise SystemExit(0)
assert got == EXPECTED_MD5, f"md5 mismatch got={got} expected={EXPECTED_MD5}"

# ── (1) imports: auth + router + UserCog icon ────────────────
a1 = "import { api } from '@/lib/api';\n"
assert src.count(a1) == 1, f"a1 count={src.count(a1)}"
src = src.replace(a1, "import { api, auth } from '@/lib/api';\n", 1)

a1b = "import { useState, useEffect, useCallback } from 'react';\n"
assert src.count(a1b) == 1, f"a1b count={src.count(a1b)}"
src = src.replace(
    a1b,
    "import { useState, useEffect, useCallback } from 'react';\n"
    "import { useRouter } from 'next/navigation';\n",
    1,
)

# add UserCog to the lucide import line
a1c = "import { Plus, Trash2, AlertTriangle, Copy, Check, UserPlus, Loader2, Store as StoreIcon, Monitor, Users2, Pencil } from 'lucide-react';\n"
assert src.count(a1c) == 1, f"a1c count={src.count(a1c)}"
src = src.replace(
    a1c,
    "import { Plus, Trash2, AlertTriangle, Copy, Check, UserPlus, Loader2, Store as StoreIcon, Monitor, Users2, Pencil, UserCog } from 'lucide-react';\n",
    1,
)

# ── (2) state + handler inside CustomersPage ─────────────────
a2 = (
    "  const [editTarget, setEditTarget] = useState<CustomerRow | null>(null);\n"
    "  const [loading, setLoading] = useState(true);\n"
)
assert src.count(a2) == 1, f"a2 count={src.count(a2)}"
handler = (
    "  const router = useRouter();\n"
    "  const [impersonating, setImpersonating] = useState<string | null>(null);\n"
    "\n"
    "  // S157: enter a customer's admin console by impersonating their admin user.\n"
    "  const onOperateAs = async (cid: string) => {\n"
    "    setImpersonating(cid);\n"
    "    try {\n"
    "      const res = await api.get<{ items?: { id: string; role: string }[] } | { id: string; role: string }[]>(\n"
    "        `/users?customer_id=${encodeURIComponent(cid)}&limit=200`,\n"
    "      );\n"
    "      const list = Array.isArray(res) ? res : (res.items ?? []);\n"
    "      if (list.length === 0) {\n"
    "        alert('この顧客には操作可能なユーザーがいません。');\n"
    "        return;\n"
    "      }\n"
    "      // Prefer a lv2_admin; otherwise fall back to the first user.\n"
    "      const target = list.find((u) => u.role === 'lv2_admin') ?? list[0];\n"
    "      await auth.impersonate(target.id);\n"
    "      if (typeof window !== 'undefined') window.location.href = '/';\n"
    "      else router.replace('/');\n"
    "    } catch (e) {\n"
    "      console.error('[operate-as] failed:', e);\n"
    "      alert('成り代わりに失敗しました。');\n"
    "    } finally {\n"
    "      setImpersonating(null);\n"
    "    }\n"
    "  };\n"
)
src = src.replace(a2, a2 + handler, 1)

# ── (3) button in each customer row (next to 編集) ───────────
a3 = (
    "                        <Button variant=\"outline\" size=\"sm\" onClick={() => setEditTarget(c)}>\n"
    "                          <Pencil className=\"h-3.5 w-3.5 mr-1\" />編集\n"
    "                        </Button>\n"
)
assert src.count(a3) == 1, f"a3 count={src.count(a3)}"
a3_new = (
    "                        <Button\n"
    "                          variant=\"outline\"\n"
    "                          size=\"sm\"\n"
    "                          onClick={() => onOperateAs(c.id)}\n"
    "                          disabled={impersonating === c.id}\n"
    "                        >\n"
    "                          {impersonating === c.id ? (\n"
    "                            <Loader2 className=\"h-3.5 w-3.5 mr-1 animate-spin\" />\n"
    "                          ) : (\n"
    "                            <UserCog className=\"h-3.5 w-3.5 mr-1\" />\n"
    "                          )}\n"
    "                          この顧客で操作\n"
    "                        </Button>\n"
    "                        <Button variant=\"outline\" size=\"sm\" onClick={() => setEditTarget(c)}>\n"
    "                          <Pencil className=\"h-3.5 w-3.5 mr-1\" />編集\n"
    "                        </Button>\n"
)
src = src.replace(a3, a3_new, 1)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)

print("OK")
print("new_md5:", hashlib.md5(src.encode()).hexdigest())
