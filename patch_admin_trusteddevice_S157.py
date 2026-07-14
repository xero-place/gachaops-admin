#!/usr/bin/env python3
# S157-fix2 (方針Y): restore "trusted device skips OTP for 90 days" while keeping
# the 422 lockout fixed.
#
# Behaviour after this patch:
#   - Explicit logout (auth.logout)         -> device token IS removed -> next
#     login on this device requires the OTP code (clean sign-out).
#   - Automatic expiry (refresh failed)     -> device token is KEPT     -> the
#     device stays trusted, so re-login skips OTP (up to the 90-day device TTL).
#   - The empty-OTP-code guard in login/page.tsx stays as-is (real 422 fix).
#
# Implementation: clear() takes an options arg { forgetDevice?: boolean }.
#   - default (forgetDevice=false) keeps the device token  -> used by auto-expiry
#   - auth.logout() calls clear({ forgetDevice: true })     -> drops the device
#
# Safety: per-file md5 guard (dry-run prints md5s), count==1 asserts.

import hashlib

EXPECTED = {
    "src/lib/token-store.ts": "eb269af71ee56c268f9e226411f157e0",
    "src/lib/api.ts": "24b3aafcfb3a2b945c9e8ed2ee04c4f2",
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


# ════════════ token-store.ts: clear() gains a forgetDevice option ════════════
def patch_token_store():
    p = "src/lib/token-store.ts"
    src = read(p)
    armed = guard(p, src)

    old = (
        "  clear(): void {\n"
        "    if (!isClient()) return;\n"
        "    localStorage.removeItem(ACCESS_KEY);\n"
        "    localStorage.removeItem(REFRESH_KEY);\n"
        "    localStorage.removeItem(USER_KEY);\n"
        "    localStorage.removeItem(IMP_SNAPSHOT_KEY);\n"
        "    // S157-fix: also drop the device token. Keeping it across a logout /\n"
        "    // token-expiry left the login screen in a half-state that could fire\n"
        "    // verify-otp without a code (HTTP 422 lockout). A clean re-login\n"
        "    // (password -> OTP) is safer than skipping OTP on a remembered device.\n"
        "    localStorage.removeItem(DEVICE_KEY);\n"
        "  },\n"
    )
    assert src.count(old) == 1, f"token-store clear() count={src.count(old)}"
    new = (
        "  // clear() drops the session. By default the device token is KEPT so an\n"
        "  // automatic expiry (refresh failure) leaves the device trusted and the\n"
        "  // next login can skip OTP (up to the 90-day device TTL). Pass\n"
        "  // { forgetDevice: true } on an explicit logout to fully sign out this\n"
        "  // device, which then requires the OTP code again next time.\n"
        "  // The real 422 fix lives in login/page.tsx (never send an empty code),\n"
        "  // so keeping the device token here is safe.\n"
        "  clear(opts?: { forgetDevice?: boolean }): void {\n"
        "    if (!isClient()) return;\n"
        "    localStorage.removeItem(ACCESS_KEY);\n"
        "    localStorage.removeItem(REFRESH_KEY);\n"
        "    localStorage.removeItem(USER_KEY);\n"
        "    localStorage.removeItem(IMP_SNAPSHOT_KEY);\n"
        "    if (opts?.forgetDevice) {\n"
        "      localStorage.removeItem(DEVICE_KEY);\n"
        "    }\n"
        "  },\n"
    )
    src = src.replace(old, new, 1)
    return p, src, armed


# ════════════ api.ts: logout forgets the device; auto-expiry keeps it ════════
def patch_api():
    p = "src/lib/api.ts"
    src = read(p)
    armed = guard(p, src)

    # Only the logout() call should forget the device. The auto-refresh-failure
    # clear() at line ~92 stays as a bare clear() (keeps the device trusted).
    old = (
        "  async logout(): Promise<void> {\n"
        "    try {\n"
        "      await api.post('/auth/logout');\n"
        "    } catch {\n"
        "      // best-effort; clear tokens regardless\n"
        "    }\n"
        "    tokenStore.clear();\n"
        "  },\n"
    )
    assert src.count(old) == 1, f"api logout() count={src.count(old)}"
    new = (
        "  async logout(): Promise<void> {\n"
        "    try {\n"
        "      await api.post('/auth/logout');\n"
        "    } catch {\n"
        "      // best-effort; clear tokens regardless\n"
        "    }\n"
        "    // Explicit logout fully signs out this device (OTP required next time).\n"
        "    tokenStore.clear({ forgetDevice: true });\n"
        "  },\n"
    )
    src = src.replace(old, new, 1)
    return p, src, armed


def main():
    results = [patch_token_store(), patch_api()]
    if not all(armed for _, _, armed in results):
        print("\nDRY RUN: fill EXPECTED{} with the printed md5s and re-run. Nothing written.")
        return
    for p, s, _ in results:
        with open(p, "w", encoding="utf-8") as f:
            f.write(s)
        print(f"  wrote {p}  new_md5={md5(s)}")
    print("OK: 2 files patched.")


if __name__ == "__main__":
    main()
