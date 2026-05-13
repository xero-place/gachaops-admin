'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { auth, ApiError } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, Lock } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState('admin@gachaops.example');
  const [password, setPassword] = useState('admin1234');
  const [totpCode, setTotpCode] = useState('');
  const [requireTotp, setRequireTotp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tokenStore.isAuthenticated()) {
      router.replace(search.get('next') || '/');
    }
  }, [router, search]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await auth.login(email, password, requireTotp ? totpCode : undefined);
      router.replace(search.get('next') || '/');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.problem.detail?.includes('2FA')) {
          setRequireTotp(true);
          setError('2FAコードを入力してください');
        } else {
          setError(err.problem.detail || err.problem.title || 'ログインに失敗しました');
        }
      } else {
        setError('ログインに失敗しました');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative min-h-screen flex flex-col">
        {/* Main content */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left side: Machine showcase */}
            <div className="flex items-center justify-center order-2 lg:order-1">
              <div className="relative w-full max-w-md">
                {/* Glow effect behind machine */}
                <div className="absolute inset-0 bg-primary/20 blur-3xl scale-90 opacity-60" />
                <div className="relative drop-shadow-[0_25px_50px_rgba(0,0,0,0.5)]">
                  <Image
                    src="/branding/gtcha-x-machine.png"
                    alt="GTCHA X"
                    width={512}
                    height={512}
                    className="w-full h-auto object-contain"
                    priority
                  />
                </div>
                <div className="mt-6 text-center">
                  <p className="text-sm text-muted-foreground">参加型デジタルガチャ什器</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">© 株式会社ゼロプレイス</p>
                </div>
              </div>
            </div>

            {/* Right side: Login form */}
            <div className="flex items-center justify-center order-1 lg:order-2">
              <div className="w-full max-w-md">
                <div className="rounded-2xl border bg-card/95 backdrop-blur shadow-2xl p-8">
                  {/* Logo + Title */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-14 w-14 rounded-xl overflow-hidden bg-background flex items-center justify-center shrink-0 ring-1 ring-border">
                      <Image
                        src="/branding/gi-logo.png"
                        alt="GTCHA X"
                        width={56}
                        height={56}
                        className="w-full h-full object-contain p-1"
                        priority
                      />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold tracking-tight">GTCHA X</h1>
                      <p className="text-xs text-muted-foreground">管理画面ログイン</p>
                    </div>
                  </div>

                  {/* Form */}
                  <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="email">メールアドレス</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="username"
                        required
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="password">パスワード</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        disabled={submitting}
                      />
                    </div>
                    {requireTotp && (
                      <div className="space-y-1.5">
                        <Label htmlFor="totp">2FAコード (6桁)</Label>
                        <Input
                          id="totp"
                          type="text"
                          value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value)}
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          required
                          disabled={submitting}
                          autoFocus
                        />
                      </div>
                    )}
                    {error && (
                      <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </div>
                    )}
                    <Button type="submit" className="w-full gap-2 h-11" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          ログイン中...
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          ログイン
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="relative py-6 text-center">
          <p className="text-[11px] text-muted-foreground/60">
            © 2026 株式会社ゼロプレイス · GTCHA X Admin Console
          </p>
        </footer>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
