#!/usr/bin/env python3
# S157 admin impersonation UI:
#   token-store.ts : operator-snapshot save/restore + isImpersonating/getDevice already added.
#   api.ts         : export tokenStore; auth.impersonate() / auth.stopImpersonation().
#   app-shell.tsx  : render <ImpersonationBanner/> under the header.
#   users/page.tsx : "このアカウントで操作" button (lv1_super only, not self).
# (The banner component file is dropped in separately.)
#
# Safety: per-file md5 guard, count==1 asserts, write only if all transform.

import hashlib

EXPECTED = {
    "src/lib/token-store.ts": "6d67280870550f1c5a5ff6482fc4aec0",
    "src/lib/api.ts": "9c9e7e7e30e74c16ee7ed68c59f81ed8",
    "src/components/layout/app-shell.tsx": "418bbb910607a7b9796196ba22f3ac17",
    "src/app/users/page.tsx": "2b6270cee84eead78816aa3208b75fa8",
}


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def md5(s):
    return hashlib.md5(s.encode()).hexdigest()


def guard(p, src):
    exp = EXPECTED[p]
    got = md5(src)
    if exp.startswith("__FILL"):
        print(f"  [dry] {p} md5 = {got}")
        return False
    assert got == exp, f"{p}: md5 mismatch got={got} expected={exp}"
    return True


# ════════════════ token-store.ts ════════════════
def patch_token_store():
    p = "src/lib/token-store.ts"
    src = read(p)
    armed = guard(p, src)

    # add snapshot key after DEVICE_KEY
    a1 = "const DEVICE_KEY = 'gachaops_device_token';\n"
    assert src.count(a1) == 1, f"ts a1 count={src.count(a1)}"
    src = src.replace(a1, a1 + "const IMP_SNAPSHOT_KEY = 'gachaops_impersonator';\n", 1)

    # add impersonation helpers after setDevice()
    a2 = (
        "  setDevice(token: string): void {\n"
        "    if (!isClient()) return;\n"
        "    localStorage.setItem(DEVICE_KEY, token);\n"
        "  },\n"
    )
    assert src.count(a2) == 1, f"ts a2 count={src.count(a2)}"
    helpers = (
        "  // S157 impersonation: stash the operator's own session so we can\n"
        "  // restore it with one click after acting as another account.\n"
        "  saveImpersonatorSnapshot(): void {\n"
        "    if (!isClient()) return;\n"
        "    const access = localStorage.getItem(ACCESS_KEY);\n"
        "    const refresh = localStorage.getItem(REFRESH_KEY);\n"
        "    const user = localStorage.getItem(USER_KEY);\n"
        "    if (!access || !refresh) return;\n"
        "    // Do not overwrite an existing snapshot (no nested impersonation).\n"
        "    if (localStorage.getItem(IMP_SNAPSHOT_KEY)) return;\n"
        "    localStorage.setItem(\n"
        "      IMP_SNAPSHOT_KEY,\n"
        "      JSON.stringify({ access, refresh, user }),\n"
        "    );\n"
        "  },\n"
        "  isImpersonating(): boolean {\n"
        "    if (!isClient()) return false;\n"
        "    return !!localStorage.getItem(IMP_SNAPSHOT_KEY);\n"
        "  },\n"
        "  restoreImpersonator(): boolean {\n"
        "    if (!isClient()) return false;\n"
        "    const raw = localStorage.getItem(IMP_SNAPSHOT_KEY);\n"
        "    if (!raw) return false;\n"
        "    try {\n"
        "      const snap = JSON.parse(raw) as { access: string; refresh: string; user: string | null };\n"
        "      localStorage.setItem(ACCESS_KEY, snap.access);\n"
        "      localStorage.setItem(REFRESH_KEY, snap.refresh);\n"
        "      if (snap.user) localStorage.setItem(USER_KEY, snap.user);\n"
        "    } catch {\n"
        "      return false;\n"
        "    }\n"
        "    localStorage.removeItem(IMP_SNAPSHOT_KEY);\n"
        "    return true;\n"
        "  },\n"
    )
    src = src.replace(a2, a2 + helpers, 1)

    # clear() should also drop any impersonation snapshot (full logout)
    a3 = (
        "    localStorage.removeItem(USER_KEY);\n"
        "    // NOTE: DEVICE_KEY is intentionally kept so a trusted device is not\n"
        "    // re-challenged for the email OTP after a normal logout (S157).\n"
        "  },\n"
    )
    assert src.count(a3) == 1, f"ts a3 count={src.count(a3)}"
    a3_new = (
        "    localStorage.removeItem(USER_KEY);\n"
        "    localStorage.removeItem(IMP_SNAPSHOT_KEY);\n"
        "    // NOTE: DEVICE_KEY is intentionally kept so a trusted device is not\n"
        "    // re-challenged for the email OTP after a normal logout (S157).\n"
        "  },\n"
    )
    src = src.replace(a3, a3_new, 1)
    return p, src, armed


# ════════════════ api.ts ════════════════
def patch_api():
    p = "src/lib/api.ts"
    src = read(p)
    armed = guard(p, src)

    # re-export tokenStore so components import it from '@/lib/api'
    a1 = "export function isOtpRequired(\n"
    assert src.count(a1) == 1, f"api a1 count={src.count(a1)}"
    src = src.replace(a1, "export { tokenStore };\n\n" + a1, 1)

    # add ImpersonateResponse type before `export const auth`
    a2 = "export const auth = {\n"
    assert src.count(a2) == 1, f"api a2 count={src.count(a2)}"
    imp_type = (
        "export interface ImpersonateResponse extends LoginResponse {\n"
        "  impersonated: true;\n"
        "}\n"
        "\n"
    )
    src = src.replace(a2, imp_type + a2, 1)

    # add impersonate() + stopImpersonation() after verifyOtp()
    a3 = (
        "  async verifyOtp(email: string, code: string): Promise<VerifyOtpResponse> {\n"
        "    const data = await api.post<VerifyOtpResponse>('/auth/verify-otp', {\n"
        "      email,\n"
        "      code,\n"
        "    });\n"
        "    tokenStore.set(data.access_token, data.refresh_token, data.user);\n"
        "    if (data.device_token) tokenStore.setDevice(data.device_token);\n"
        "    return data;\n"
        "  },\n"
    )
    assert src.count(a3) == 1, f"api a3 count={src.count(a3)}"
    imp_fns = (
        "  // S157: lv1_super only. Saves the operator session, then swaps to the\n"
        "  // target user's tokens. stopImpersonation() restores the operator.\n"
        "  async impersonate(targetUserId: string): Promise<ImpersonateResponse> {\n"
        "    tokenStore.saveImpersonatorSnapshot();\n"
        "    const data = await api.post<ImpersonateResponse>('/auth/impersonate', {\n"
        "      target_user_id: targetUserId,\n"
        "    });\n"
        "    tokenStore.set(data.access_token, data.refresh_token, data.user);\n"
        "    return data;\n"
        "  },\n"
        "  stopImpersonation(): boolean {\n"
        "    return tokenStore.restoreImpersonator();\n"
        "  },\n"
    )
    src = src.replace(a3, a3 + imp_fns, 1)
    return p, src, armed


# ════════════════ app-shell.tsx ════════════════
def patch_shell():
    p = "src/components/layout/app-shell.tsx"
    src = read(p)
    armed = guard(p, src)

    a1 = "import { AuthGate } from '@/components/layout/auth-gate';\n"
    assert src.count(a1) == 1, f"shell a1 count={src.count(a1)}"
    src = src.replace(
        a1,
        a1 + "import { ImpersonationBanner } from '@/components/layout/impersonation-banner';\n",
        1,
    )

    a2 = "          <Header title={title} breadcrumb={breadcrumb} />\n"
    assert src.count(a2) == 1, f"shell a2 count={src.count(a2)}"
    src = src.replace(
        a2,
        a2 + "          <ImpersonationBanner />\n",
        1,
    )
    return p, src, armed


# ════════════════ users/page.tsx ════════════════
def patch_users():
    p = "src/app/users/page.tsx"
    src = read(p)
    armed = guard(p, src)

    # imports: bring in auth, tokenStore, router, an icon
    a1 = "import { api } from '@/lib/api';\n"
    assert src.count(a1) == 1, f"users a1 count={src.count(a1)}"
    src = src.replace(a1, "import { api, auth, tokenStore } from '@/lib/api';\n", 1)

    a1b = "import { Loader2 } from 'lucide-react';\n"
    assert src.count(a1b) == 1, f"users a1b count={src.count(a1b)}"
    src = src.replace(
        a1b,
        "import { Loader2, UserCog } from 'lucide-react';\n"
        "import { useRouter } from 'next/navigation';\n",
        1,
    )

    # state: capture the current operator (self) so we can gate the button
    a2 = (
        "  const [users, setUsers] = useState<User[]>([]);\n"
        "  const [loading, setLoading] = useState(true);\n"
    )
    assert src.count(a2) == 1, f"users a2 count={src.count(a2)}"
    src = src.replace(
        a2,
        a2
        + "  const router = useRouter();\n"
        + "  const me = tokenStore.getUser();\n"
        + "  const isSuper = me?.role === 'lv1_super';\n"
        + "\n"
        + "  const onImpersonate = async (targetId: string) => {\n"
        + "    try {\n"
        + "      await auth.impersonate(targetId);\n"
        + "      if (typeof window !== 'undefined') window.location.href = '/';\n"
        + "      else router.replace('/');\n"
        + "    } catch (e) {\n"
        + "      console.error('[impersonate] failed:', e);\n"
        + "      alert('成り代わりに失敗しました');\n"
        + "    }\n"
        + "  };\n",
        1,
    )

    # action cell: add the impersonate button (super only, not self)
    a3 = (
        "                <TableCell className=\"text-right\">\n"
        "                  <Button variant=\"ghost\" size=\"sm\" className=\"h-7 text-xs\">編集</Button>\n"
        "                </TableCell>\n"
    )
    assert src.count(a3) == 1, f"users a3 count={src.count(a3)}"
    a3_new = (
        "                <TableCell className=\"text-right\">\n"
        "                  <div className=\"inline-flex items-center gap-1\">\n"
        "                    {isSuper && me && u.id !== me.id && (\n"
        "                      <Button\n"
        "                        variant=\"ghost\"\n"
        "                        size=\"sm\"\n"
        "                        className=\"h-7 text-xs gap-1\"\n"
        "                        onClick={() => onImpersonate(u.id)}\n"
        "                      >\n"
        "                        <UserCog className=\"h-3.5 w-3.5\" />このアカウントで操作\n"
        "                      </Button>\n"
        "                    )}\n"
        "                    <Button variant=\"ghost\" size=\"sm\" className=\"h-7 text-xs\">編集</Button>\n"
        "                  </div>\n"
        "                </TableCell>\n"
    )
    src = src.replace(a3, a3_new, 1)
    return p, src, armed


def main():
    results = [patch_token_store(), patch_api(), patch_shell(), patch_users()]
    if not all(armed for _, _, armed in results):
        print("\nDRY RUN: fill EXPECTED{} with the printed md5s and re-run. Nothing written.")
        return
    for p, s, _ in results:
        with open(p, "w", encoding="utf-8") as f:
            f.write(s)
        print(f"  wrote {p}  new_md5={md5(s)}")
    print("OK: 4 files patched.")


if __name__ == "__main__":
    main()
