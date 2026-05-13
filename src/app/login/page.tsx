'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth, ApiError } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1.5 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
              GX
            </div>
            <div>
              <CardTitle className="text-lg">GTCHAX APP</CardTitle>
              <p className="text-xs text-muted-foreground">管理画面ログイン</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
            <Button type="submit" className="w-full gap-2" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ログイン中...
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  ログイン
                </>
              )}
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t text-[11px] text-muted-foreground space-y-1">
            <p>
              <strong>デモ用:</strong> admin@gachaops.example / admin1234
            </p>
            <p>
              API: <code className="font-mono">{process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1'}</code>
            </p>
          </div>
        </CardContent>
      </Card>
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
