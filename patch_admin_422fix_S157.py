#!/usr/bin/env python3
# S157-fix: prevent the "422 Request validation failed" login lockout.
#
# Root cause (confirmed): after token expiry, clear() kept gachaops_device_token,
# leaving the login screen in a half-state where verifyOtp could be invoked with
# an empty/missing code -> backend returns 422 (code is required).
#
# Two fixes (admin only; backend is correct and untouched):
#   token-store.ts : clear() now ALSO removes the device token, so a re-login
#                    always starts clean (password -> OTP), no stale state.
#   login/page.tsx : the OTP step no-ops on an empty code (button disabled +
#                    guard), so a missing-code request can never be sent.
#
# Safety: per-file md5 guard (dry-run prints md5s), count==1 asserts.

import hashlib

EXPECTED = {
    "src/lib/token-store.ts": "6d58c2df6dfc35eac60859d15d4ef88b",
    "src/app/login/page.tsx": "d5533621ac6ac7f9f34281303ac00144",
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


# ════════════ token-store.ts: clear() removes device token ════════════
def patch_token_store():
    p = "src/lib/token-store.ts"
    src = read(p)
    armed = guard(p, src)

    # The current clear() keeps DEVICE_KEY on purpose (S157). Change it so the
    # device token is dropped too. Match the exact current block (post-S157imp).
    old = (
        "    localStorage.removeItem(USER_KEY);\n"
        "    localStorage.removeItem(IMP_SNAPSHOT_KEY);\n"
        "    // NOTE: DEVICE_KEY is intentionally kept so a trusted device is not\n"
        "    // re-challenged for the email OTP after a normal logout (S157).\n"
        "  },\n"
    )
    assert src.count(old) == 1, f"token-store clear block count={src.count(old)}"
    new = (
        "    localStorage.removeItem(USER_KEY);\n"
        "    localStorage.removeItem(IMP_SNAPSHOT_KEY);\n"
        "    // S157-fix: also drop the device token. Keeping it across a logout /\n"
        "    // token-expiry left the login screen in a half-state that could fire\n"
        "    // verify-otp without a code (HTTP 422 lockout). A clean re-login\n"
        "    // (password -> OTP) is safer than skipping OTP on a remembered device.\n"
        "    localStorage.removeItem(DEVICE_KEY);\n"
        "  },\n"
    )
    src = src.replace(old, new, 1)
    return p, src, armed


# ════════════ login/page.tsx: never send an empty OTP code ════════════
def patch_login():
    p = "src/app/login/page.tsx"
    src = read(p)
    armed = guard(p, src)

    # Guard the verify branch: bail out early if the code is empty.
    old = (
        "      if (requireEmailOtp) {\n"
        "        // Step 2: verify the 6-digit email code.\n"
        "        await auth.verifyOtp(email, emailCode);\n"
        "        router.replace(search.get('next') || '/');\n"
        "        return;\n"
        "      }\n"
    )
    assert src.count(old) == 1, f"login verify branch count={src.count(old)}"
    new = (
        "      if (requireEmailOtp) {\n"
        "        // Step 2: verify the 6-digit email code.\n"
        "        const code = emailCode.trim();\n"
        "        if (code.length === 0) {\n"
        "          setError('確認コードを入力してください');\n"
        "          return;\n"
        "        }\n"
        "        await auth.verifyOtp(email, code);\n"
        "        router.replace(search.get('next') || '/');\n"
        "        return;\n"
        "      }\n"
    )
    src = src.replace(old, new, 1)

    # Also disable the submit button while in OTP step with an empty code.
    old_btn = "                    <Button type=\"submit\" className=\"w-full gap-2 h-11\" disabled={submitting}>\n"
    assert src.count(old_btn) == 1, f"login button count={src.count(old_btn)}"
    new_btn = (
        "                    <Button\n"
        "                      type=\"submit\"\n"
        "                      className=\"w-full gap-2 h-11\"\n"
        "                      disabled={submitting || (requireEmailOtp && emailCode.trim().length === 0)}\n"
        "                    >\n"
    )
    src = src.replace(old_btn, new_btn, 1)
    return p, src, armed


def main():
    results = [patch_token_store(), patch_login()]
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
