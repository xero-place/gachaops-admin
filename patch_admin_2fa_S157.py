#!/usr/bin/env python3
# S157 admin UI: email-OTP 2FA login flow (token-store.ts, api.ts, login/page.tsx).
#
# Run from the admin repo root:  python3 patch_admin_2fa_S157.py
#
# What it does (additive, existing password+TOTP path preserved):
#   token-store.ts : add device-token storage; clear() KEEPS the device token
#                    (so logout does not re-trigger OTP -> "二度と要求しない").
#   api.ts         : login() returns LoginResponse | OtpRequiredResponse and sends
#                    x-device-token; new verifyOtp() stores tokens + device token.
#   login/page.tsx : 2-step form (password -> email-OTP code); TOTP branch untouched.
#
# Safety: per-file md5 guard (fill the three EXPECTED_* after first dry run),
# count==1 asserts on every anchor, write only if all three transform cleanly.

import hashlib, sys

# Set these to the real md5sums printed by:  md5 -q <file>   (mac)  OR  md5sum <file>
EXPECTED = {
    "src/lib/token-store.ts": "3716f4cf81b8774c4b9f36805860860a",
    "src/lib/api.ts": "6d4f7f5228c5dc2f06a0feff6c8f9c1e",
    "src/app/login/page.tsx": "3ebfc5cf0be9bcc613461f2c8d69d6bb",
}


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def md5(s):
    return hashlib.md5(s.encode()).hexdigest()


def guard(path, src):
    exp = EXPECTED[path]
    got = md5(src)
    if exp.startswith("__FILL"):
        print(f"  [dry] {path} md5 = {got}")
        return False
    assert got == exp, f"{path}: md5 mismatch got={got} expected={exp}"
    return True


# ════════════════════════════════════════════════════════════
# 1) token-store.ts
# ════════════════════════════════════════════════════════════
def patch_token_store():
    path = "src/lib/token-store.ts"
    src = read(path)
    armed = guard(path, src)

    # add DEVICE_KEY after USER_KEY
    a1 = "const USER_KEY = 'gachaops_user';\n"
    assert src.count(a1) == 1, f"token-store a1 count={src.count(a1)}"
    src = src.replace(a1, a1 + "const DEVICE_KEY = 'gachaops_device_token';\n", 1)

    # add getDevice/setDevice after getUser()
    a2 = (
        "  getUser(): StoredUser | null {\n"
        "    if (!isClient()) return null;\n"
        "    const raw = localStorage.getItem(USER_KEY);\n"
        "    if (!raw) return null;\n"
        "    try {\n"
        "      return JSON.parse(raw) as StoredUser;\n"
        "    } catch {\n"
        "      return null;\n"
        "    }\n"
        "  },\n"
    )
    assert src.count(a2) == 1, f"token-store a2 count={src.count(a2)}"
    dev_methods = (
        "  getDevice(): string | null {\n"
        "    if (!isClient()) return null;\n"
        "    return localStorage.getItem(DEVICE_KEY);\n"
        "  },\n"
        "  setDevice(token: string): void {\n"
        "    if (!isClient()) return;\n"
        "    localStorage.setItem(DEVICE_KEY, token);\n"
        "  },\n"
    )
    src = src.replace(a2, a2 + dev_methods, 1)

    # clear() must NOT remove the device token (keep device trusted across logout)
    a3 = (
        "  clear(): void {\n"
        "    if (!isClient()) return;\n"
        "    localStorage.removeItem(ACCESS_KEY);\n"
        "    localStorage.removeItem(REFRESH_KEY);\n"
        "    localStorage.removeItem(USER_KEY);\n"
        "  },\n"
    )
    assert src.count(a3) == 1, f"token-store a3 count={src.count(a3)}"
    a3_new = (
        "  clear(): void {\n"
        "    if (!isClient()) return;\n"
        "    localStorage.removeItem(ACCESS_KEY);\n"
        "    localStorage.removeItem(REFRESH_KEY);\n"
        "    localStorage.removeItem(USER_KEY);\n"
        "    // NOTE: DEVICE_KEY is intentionally kept so a trusted device is not\n"
        "    // re-challenged for the email OTP after a normal logout (S157).\n"
        "  },\n"
    )
    src = src.replace(a3, a3_new, 1)
    return path, src, armed


# ════════════════════════════════════════════════════════════
# 2) api.ts
# ════════════════════════════════════════════════════════════
def patch_api():
    path = "src/lib/api.ts"
    src = read(path)
    armed = guard(path, src)

    # add OtpRequiredResponse + VerifyOtpResponse types after LoginResponse block
    a1 = (
        "export interface LoginResponse {\n"
        "  access_token: string;\n"
        "  refresh_token: string;\n"
        "  expires_in: number;\n"
        "  user: {\n"
        "    id: string;\n"
        "    customer_id: string;\n"
        "    email: string;\n"
        "    name: string;\n"
        "    role: string;\n"
        "    two_factor_enabled: boolean;\n"
        "  };\n"
        "}\n"
    )
    assert src.count(a1) == 1, f"api a1 count={src.count(a1)}"
    extra_types = (
        "\n"
        "export interface OtpRequiredResponse {\n"
        "  status: 'otp_required';\n"
        "  email: string;\n"
        "  message: string;\n"
        "}\n"
        "\n"
        "export interface VerifyOtpResponse extends LoginResponse {\n"
        "  device_token: string;\n"
        "}\n"
        "\n"
        "export function isOtpRequired(\n"
        "  r: LoginResponse | OtpRequiredResponse,\n"
        "): r is OtpRequiredResponse {\n"
        "  return (r as OtpRequiredResponse).status === 'otp_required';\n"
        "}\n"
    )
    src = src.replace(a1, a1 + extra_types, 1)

    # rewrite the auth object's login() and add verifyOtp()
    a2 = (
        "export const auth = {\n"
        "  async login(email: string, password: string, totp_code?: string): Promise<LoginResponse> {\n"
        "    const data = await api.post<LoginResponse>('/auth/login', {\n"
        "      email,\n"
        "      password,\n"
        "      ...(totp_code ? { totp_code } : {}),\n"
        "    });\n"
        "    tokenStore.set(data.access_token, data.refresh_token, data.user);\n"
        "    return data;\n"
        "  },\n"
    )
    assert src.count(a2) == 1, f"api a2 count={src.count(a2)}"
    a2_new = (
        "export const auth = {\n"
        "  async login(\n"
        "    email: string,\n"
        "    password: string,\n"
        "    totp_code?: string,\n"
        "  ): Promise<LoginResponse | OtpRequiredResponse> {\n"
        "    const device = tokenStore.getDevice();\n"
        "    const data = await api.post<LoginResponse | OtpRequiredResponse>(\n"
        "      '/auth/login',\n"
        "      {\n"
        "        email,\n"
        "        password,\n"
        "        ...(totp_code ? { totp_code } : {}),\n"
        "      },\n"
        "      device ? { headers: { 'x-device-token': device } } : undefined,\n"
        "    );\n"
        "    // OTP required -> do NOT store tokens; caller shows the code step.\n"
        "    if (isOtpRequired(data)) {\n"
        "      return data;\n"
        "    }\n"
        "    tokenStore.set(data.access_token, data.refresh_token, data.user);\n"
        "    return data;\n"
        "  },\n"
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
    src = src.replace(a2, a2_new, 1)
    return path, src, armed


# ════════════════════════════════════════════════════════════
# 3) login/page.tsx
# ════════════════════════════════════════════════════════════
def patch_login_page():
    path = "src/app/login/page.tsx"
    src = read(path)
    armed = guard(path, src)

    # import isOtpRequired alongside auth, ApiError
    a1 = "import { auth, ApiError } from '@/lib/api';\n"
    assert src.count(a1) == 1, f"login a1 count={src.count(a1)}"
    src = src.replace(a1, "import { auth, ApiError, isOtpRequired } from '@/lib/api';\n", 1)

    # add OTP state next to the TOTP state
    a2 = (
        "  const [totpCode, setTotpCode] = useState('');\n"
        "  const [requireTotp, setRequireTotp] = useState(false);\n"
    )
    assert src.count(a2) == 1, f"login a2 count={src.count(a2)}"
    src = src.replace(
        a2,
        a2
        + "  const [emailCode, setEmailCode] = useState('');\n"
        + "  const [requireEmailOtp, setRequireEmailOtp] = useState(false);\n"
        + "  const [info, setInfo] = useState<string | null>(null);\n",
        1,
    )

    # rewrite onSubmit to branch on otp_required / verify step
    a3 = (
        "  const onSubmit = async (e: React.FormEvent) => {\n"
        "    e.preventDefault();\n"
        "    setSubmitting(true);\n"
        "    setError(null);\n"
        "    try {\n"
        "      await auth.login(email, password, requireTotp ? totpCode : undefined);\n"
        "      router.replace(search.get('next') || '/');\n"
        "    } catch (err) {\n"
        "      if (err instanceof ApiError) {\n"
        "        if (err.problem.detail?.includes('2FA')) {\n"
        "          setRequireTotp(true);\n"
        "          setError('2FAコードを入力してください');\n"
        "        } else {\n"
        "          setError(err.problem.detail || err.problem.title || 'ログインに失敗しました');\n"
        "        }\n"
        "      } else {\n"
        "        setError('ログインに失敗しました');\n"
        "      }\n"
        "    } finally {\n"
        "      setSubmitting(false);\n"
        "    }\n"
        "  };\n"
    )
    assert src.count(a3) == 1, f"login a3 count={src.count(a3)}"
    a3_new = (
        "  const onSubmit = async (e: React.FormEvent) => {\n"
        "    e.preventDefault();\n"
        "    setSubmitting(true);\n"
        "    setError(null);\n"
        "    try {\n"
        "      if (requireEmailOtp) {\n"
        "        // Step 2: verify the 6-digit email code.\n"
        "        await auth.verifyOtp(email, emailCode);\n"
        "        router.replace(search.get('next') || '/');\n"
        "        return;\n"
        "      }\n"
        "      // Step 1: password (and TOTP if this account uses an authenticator app).\n"
        "      const res = await auth.login(email, password, requireTotp ? totpCode : undefined);\n"
        "      if (isOtpRequired(res)) {\n"
        "        setRequireEmailOtp(true);\n"
        "        setInfo('確認コードをメールに送信しました。10分以内に入力してください。');\n"
        "        return;\n"
        "      }\n"
        "      router.replace(search.get('next') || '/');\n"
        "    } catch (err) {\n"
        "      if (err instanceof ApiError) {\n"
        "        if (err.problem.detail?.includes('2FA')) {\n"
        "          setRequireTotp(true);\n"
        "          setError('2FAコードを入力してください');\n"
        "        } else {\n"
        "          setError(err.problem.detail || err.problem.title || 'ログインに失敗しました');\n"
        "        }\n"
        "      } else {\n"
        "        setError('ログインに失敗しました');\n"
        "      }\n"
        "    } finally {\n"
        "      setSubmitting(false);\n"
        "    }\n"
        "  };\n"
    )
    src = src.replace(a3, a3_new, 1)

    # when in email-OTP step, hide the password field's effect by adding the code
    # input block right after the TOTP block, and show the info banner.
    a4 = (
        "                    {requireTotp && (\n"
        "                      <div className=\"space-y-1.5\">\n"
        "                        <Label htmlFor=\"totp\">2FAコード (6桁)</Label>\n"
        "                        <Input\n"
        "                          id=\"totp\"\n"
        "                          type=\"text\"\n"
        "                          value={totpCode}\n"
        "                          onChange={(e) => setTotpCode(e.target.value)}\n"
        "                          inputMode=\"numeric\"\n"
        "                          pattern=\"[0-9]{6}\"\n"
        "                          maxLength={6}\n"
        "                          required\n"
        "                          disabled={submitting}\n"
        "                          autoFocus\n"
        "                        />\n"
        "                      </div>\n"
        "                    )}\n"
    )
    assert src.count(a4) == 1, f"login a4 count={src.count(a4)}"
    otp_block = (
        "                    {requireEmailOtp && (\n"
        "                      <div className=\"space-y-1.5\">\n"
        "                        <Label htmlFor=\"emailcode\">確認コード (6桁)</Label>\n"
        "                        <Input\n"
        "                          id=\"emailcode\"\n"
        "                          type=\"text\"\n"
        "                          value={emailCode}\n"
        "                          onChange={(e) => setEmailCode(e.target.value)}\n"
        "                          inputMode=\"numeric\"\n"
        "                          pattern=\"[0-9]{6}\"\n"
        "                          maxLength={6}\n"
        "                          required\n"
        "                          disabled={submitting}\n"
        "                          autoFocus\n"
        "                        />\n"
        "                      </div>\n"
        "                    )}\n"
        "                    {info && (\n"
        "                      <div className=\"rounded-md bg-primary/10 border border-primary/30 p-3 text-xs text-foreground/80\">\n"
        "                        {info}\n"
        "                      </div>\n"
        "                    )}\n"
    )
    src = src.replace(a4, a4 + otp_block, 1)

    # change the submit button label when verifying the code
    a5 = (
        "                        <>\n"
        "                          <Lock className=\"h-4 w-4\" />\n"
        "                          ログイン\n"
        "                        </>\n"
    )
    assert src.count(a5) == 1, f"login a5 count={src.count(a5)}"
    a5_new = (
        "                        <>\n"
        "                          <Lock className=\"h-4 w-4\" />\n"
        "                          {requireEmailOtp ? 'コードを確認' : 'ログイン'}\n"
        "                        </>\n"
    )
    src = src.replace(a5, a5_new, 1)

    return path, src, armed


def main():
    results = [patch_token_store(), patch_api(), patch_login_page()]
    all_armed = all(armed for _, _, armed in results)
    if not all_armed:
        print("\nDRY RUN: md5 guards not set. Fill EXPECTED{} with the printed md5s,")
        print("re-run to apply. No files were written.")
        return
    for path, new_src, _ in results:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_src)
        print(f"  wrote {path}  new_md5={md5(new_src)}")
    print("OK: all three files patched.")


if __name__ == "__main__":
    main()
