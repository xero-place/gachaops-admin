'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sun, Moon, Monitor, Bell, Globe, Key, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { tokenStore, type StoredUser } from '@/lib/token-store';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';
const HEALTH_URL = API_BASE.replace(/\/v1\/?$/, '') + '/health';

type ThemeOption = 'system' | 'dark' | 'light';

function decodeJwtExp(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [notifyOffline, setNotifyOffline] = useState(true);
  const [notifyLowStock, setNotifyLowStock] = useState(true);
  const [notifyTaskFailed, setNotifyTaskFailed] = useState(false);

  const [user, setUser] = useState<StoredUser | null>(null);
  const [tokenExp, setTokenExp] = useState<number | null>(null);
  const [remainLabel, setRemainLabel] = useState('—');

  const [testState, setTestState] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle');
  const [testMsg, setTestMsg] = useState('');

  useEffect(() => {
    setMounted(true);
    setUser(tokenStore.getUser());
    setTokenExp(decodeJwtExp(tokenStore.getAccess()));
  }, []);

  useEffect(() => {
    if (!tokenExp) { setRemainLabel('—'); return; }
    const tick = () => {
      const sec = tokenExp - Math.floor(Date.now() / 1000);
      if (sec <= 0) { setRemainLabel('期限切れ（再ログインが必要）'); return; }
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      setRemainLabel(`残 ${m} 分 ${String(s).padStart(2, '0')} 秒`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tokenExp]);

  const handleLogout = () => {
    tokenStore.clear();
    window.location.href = '/login';
  };

  const handleTest = async () => {
    setTestState('loading');
    setTestMsg('');
    const t0 = performance.now();
    try {
      const res = await fetch(HEALTH_URL, { method: 'GET', cache: 'no-store' });
      const ms = Math.round(performance.now() - t0);
      if (res.ok) {
        setTestState('ok');
        setTestMsg(`接続成功（${res.status} / ${ms}ms）`);
      } else {
        setTestState('fail');
        setTestMsg(`応答あり・異常ステータス（${res.status} / ${ms}ms）`);
      }
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      setTestState('fail');
      setTestMsg(`接続失敗（${ms}ms）: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  };

  const roleLabel = (r?: string) => {
    if (!r) return '—';
    if (r.includes('super')) return 'スーパー管理者';
    return r;
  };

  const themeOptions: { value: ThemeOption; label: string; desc: string; icon: typeof Sun }[] = [
    { value: 'system', label: 'システム', desc: 'OSの設定に従う', icon: Monitor },
    { value: 'dark', label: 'ダーク', desc: '運用中の標準', icon: Moon },
    { value: 'light', label: 'ライト', desc: '日中・印刷用', icon: Sun },
  ];

  return (
    <AppShell title="環境設定" breadcrumb={['ホーム', '環境設定']}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Theme */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Sun className="h-3.5 w-3.5" />テーマ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {themeOptions.map((opt) => {
                  const Icon = opt.icon;
                  const active = mounted && theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setTheme(opt.value)}
                      className={`p-4 rounded-md border text-left transition-colors ${active ? 'border-primary bg-accent' : 'hover:bg-accent/50'}`}
                    >
                      <Icon className="h-5 w-5 mb-2" />
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                初期値は「システム」（パソコン側の表示設定に追従）。ここで手動切替できます。設定はこのブラウザに保存されます。
              </p>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Bell className="h-3.5 w-3.5" />通知</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ToggleRow
                title="オフライン端末の通知"
                description="端末が30分以上応答しない時に通知（現在は画面内通知のみ・メール送信は準備中）"
                checked={notifyOffline}
                onChange={setNotifyOffline}
              />
              <ToggleRow
                title="低在庫アラート"
                description="しきい値を下回った商品の通知（現在は画面内通知のみ・メール送信は準備中）"
                checked={notifyLowStock}
                onChange={setNotifyLowStock}
              />
              <ToggleRow
                title="配信タスク失敗"
                description="配信タスクで失敗端末が出た時に通知（現在は画面内通知のみ・メール送信は準備中）"
                checked={notifyTaskFailed}
                onChange={setNotifyTaskFailed}
              />
            </CardContent>
          </Card>

          {/* API endpoint */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Globe className="h-3.5 w-3.5" />API エンドポイント</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md bg-accent border border-border p-3 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-medium">本番 API に接続中</div>
                  <div className="text-muted-foreground mt-1 font-mono break-all">{API_BASE}</div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                接続先は環境変数 NEXT_PUBLIC_API_BASE_URL（.env.local / Vercel）で管理しています。変更が必要な場合は環境変数を更新して再デプロイしてください。
              </p>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={handleTest} disabled={testState === 'loading'}>
                  {testState === 'loading' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                  接続テスト
                </Button>
                {testState === 'ok' && (
                  <span className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{testMsg}</span>
                )}
                {testState === 'fail' && (
                  <span className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />{testMsg}</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Key className="h-3.5 w-3.5" />セッション</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <KV label="ユーザ" value={user?.name ?? '—'} />
              <KV label="メール" value={user?.email ?? '—'} />
              <KV label="ロール" value={<Badge variant="destructive">{roleLabel(user?.role)}</Badge>} />
              <KV label="2FA" value={user?.two_factor_enabled ? <Badge variant="ok">有効</Badge> : <Badge variant="outline">無効</Badge>} />
              <KV label="トークン期限" value={remainLabel} />
              <Button variant="outline" size="sm" className="w-full mt-2" onClick={handleLogout}>ログアウト</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">ビルド情報</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs font-mono text-muted-foreground">
              <div>UI v0.1.0</div>
              <div>OpenAPI v0.1</div>
              <div>WS Protocol v2.0</div>
              <div>Next.js 14.2 / React 18</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
