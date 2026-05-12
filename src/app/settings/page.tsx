'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sun, Moon, Bell, Globe, Key, AlertCircle } from 'lucide-react';

export default function SettingsPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [notifyOffline, setNotifyOffline] = useState(true);
  const [notifyLowStock, setNotifyLowStock] = useState(true);
  const [notifyTaskFailed, setNotifyTaskFailed] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState('');

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
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTheme('dark')}
                  className={`p-4 rounded-md border text-left transition-colors ${theme === 'dark' ? 'border-primary bg-accent' : 'hover:bg-accent/50'}`}
                >
                  <Moon className="h-5 w-5 mb-2" />
                  <div className="text-sm font-medium">ダーク</div>
                  <div className="text-[11px] text-muted-foreground">運用中の標準</div>
                </button>
                <button
                  onClick={() => setTheme('light')}
                  className={`p-4 rounded-md border text-left transition-colors ${theme === 'light' ? 'border-primary bg-accent' : 'hover:bg-accent/50'}`}
                >
                  <Sun className="h-5 w-5 mb-2" />
                  <div className="text-sm font-medium">ライト</div>
                  <div className="text-[11px] text-muted-foreground">日中・印刷用</div>
                </button>
              </div>
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
                description="端末が30分以上応答しない時に通知"
                checked={notifyOffline}
                onChange={setNotifyOffline}
              />
              <ToggleRow
                title="低在庫アラート"
                description="しきい値を下回った商品の通知"
                checked={notifyLowStock}
                onChange={setNotifyLowStock}
              />
              <ToggleRow
                title="配信タスク失敗"
                description="配信タスクで失敗端末が出た時に通知"
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
              <div className="rounded-md bg-warn/10 border border-warn/30 p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-warn shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-medium text-warn">現在モックモードで動作中</div>
                  <div className="text-muted-foreground mt-1">
                    `/api/v1/*` の Next.js Route Handler が応答しています。実 API に切り替えるには `NEXT_PUBLIC_API_BASE_URL` を環境変数にセットしてください。
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-url" className="text-xs">API ベース URL (.env.local で永続化)</Label>
                <Input
                  id="api-url"
                  placeholder="https://api.gachaops.example/v1"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  注: ブラウザから設定しても再起動で失われます。本番接続には `.env.local` への記述が必要です。
                </p>
              </div>
              <Button variant="outline" size="sm">接続テスト</Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Key className="h-3.5 w-3.5" />セッション</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <KV label="ユーザ" value="運営 太郎" />
              <KV label="ロール" value={<Badge variant="destructive">スーパー管理者</Badge>} />
              <KV label="2FA" value={<Badge variant="ok">有効</Badge>} />
              <KV label="トークン期限" value="残 28 分" />
              <Button variant="outline" size="sm" className="w-full mt-2">ログアウト</Button>
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
