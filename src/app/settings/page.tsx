'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sun, Moon, Monitor, Bell, Globe, Key, CheckCircle2, XCircle, Loader2, Mail, Save } from 'lucide-react';
import { tokenStore, type StoredUser } from '@/lib/token-store';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePageT } from '@/i18n/usePageT';
import { settingsPageDict } from '@/i18n/ns/settingsPage';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';
const HEALTH_URL = API_BASE.replace(/\/v1\/?$/, '') + '/health';

type ThemeOption = 'system' | 'dark' | 'light';

interface NotificationSettings {
  notify_offline: boolean;
  notify_low_stock: boolean;
  notify_task_failed: boolean;
  email_enabled: boolean;
  email_to: string | null;
}

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
  const t = usePageT(settingsPageDict);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [notif, setNotif] = useState<NotificationSettings>({
    notify_offline: true,
    notify_low_stock: true,
    notify_task_failed: false,
    email_enabled: false,
    email_to: '',
  });
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

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
    let alive = true;
    (async () => {
      try {
        const data = await api.get<NotificationSettings>('/settings/notifications');
        if (alive) setNotif({ ...data, email_to: data.email_to ?? '' });
      } catch {
        // keep defaults
      } finally {
        if (alive) setNotifLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const handleSaveNotif = async () => {
    setNotifSaving(true);
    setNotifSaved(false);
    try {
      const saved = await api.put<NotificationSettings>('/settings/notifications', {
        ...notif,
        email_to: notif.email_to?.trim() ? notif.email_to.trim() : null,
      });
      setNotif({ ...saved, email_to: saved.email_to ?? '' });
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2500);
    } catch {
      // surfaced by ApiError; keep current state
    } finally {
      setNotifSaving(false);
    }
  };

  useEffect(() => {
    if (!tokenExp) { setRemainLabel('—'); return; }
    const tick = () => {
      const sec = tokenExp - Math.floor(Date.now() / 1000);
      if (sec <= 0) { setRemainLabel(t.expired); return; }
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      setRemainLabel(t.remaining(m, String(s).padStart(2, '0')));
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
        setTestMsg(t.connOk(res.status, ms));
      } else {
        setTestState('fail');
        setTestMsg(t.connAbnormal(res.status, ms));
      }
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      setTestState('fail');
      setTestMsg(t.connFail(ms, e instanceof Error ? e.message : 'unknown'));
    }
  };

  const roleLabel = (r?: string) => {
    if (!r) return '—';
    if (r.includes('super')) return t.superAdmin;
    return r;
  };

  const themeOptions: { value: ThemeOption; label: string; desc: string; icon: typeof Sun }[] = [
    { value: 'system', label: t.themeSystem, desc: t.themeSystemDesc, icon: Monitor },
    { value: 'dark', label: t.themeDark, desc: t.themeDarkDesc, icon: Moon },
    { value: 'light', label: t.themeLight, desc: t.themeLightDesc, icon: Sun },
  ];

  return (
    <AppShell title={t.title} breadcrumb={[t.home, t.title]}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Theme */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Sun className="h-3.5 w-3.5" />{t.theme}</CardTitle>
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
                {t.themeNote}
              </p>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Bell className="h-3.5 w-3.5" />{t.notifications}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ToggleRow
                title={t.offlineTitle}
                description={t.offlineDesc}
                checked={notif.notify_offline}
                onChange={(v) => setNotif((n) => ({ ...n, notify_offline: v }))}
                disabled={notifLoading}
              />
              <ToggleRow
                title={t.lowStockTitle}
                description={t.lowStockDesc}
                checked={notif.notify_low_stock}
                onChange={(v) => setNotif((n) => ({ ...n, notify_low_stock: v }))}
                disabled={notifLoading}
              />
              <ToggleRow
                title={t.taskFailedTitle}
                description={t.taskFailedDesc}
                checked={notif.notify_task_failed}
                onChange={(v) => setNotif((n) => ({ ...n, notify_task_failed: v }))}
                disabled={notifLoading}
              />

              <div className="border-t border-border pt-4 space-y-3">
                <ToggleRow
                  title={t.emailTitle}
                  description={t.emailDesc}
                  checked={notif.email_enabled}
                  onChange={(v) => setNotif((n) => ({ ...n, email_enabled: v }))}
                  disabled={notifLoading}
                />
                <div className="space-y-2">
                  <Label htmlFor="notif-email" className="text-xs flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />{t.emailToLabel}
                  </Label>
                  <Input
                    id="notif-email"
                    type="email"
                    placeholder="ops@example.com"
                    value={notif.email_to ?? ''}
                    onChange={(e) => setNotif((n) => ({ ...n, email_to: e.target.value }))}
                    disabled={notifLoading}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <Button size="sm" onClick={handleSaveNotif} disabled={notifLoading || notifSaving}>
                  {notifSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  {t.save}
                </Button>
                {notifSaved && (
                  <span className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{t.saved}</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* API endpoint */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Globe className="h-3.5 w-3.5" />{t.apiEndpoint}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md bg-accent border border-border p-3 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-medium">{t.connectedProd}</div>
                  <div className="text-muted-foreground mt-1 font-mono break-all">{API_BASE}</div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t.apiNote}
              </p>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={handleTest} disabled={testState === 'loading'}>
                  {testState === 'loading' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                  {t.connTest}
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
              <CardTitle className="text-sm flex items-center gap-2"><Key className="h-3.5 w-3.5" />{t.session}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <KV label={t.kvUser} value={user?.name ?? '—'} />
              <KV label={t.kvEmail} value={user?.email ?? '—'} />
              <KV label={t.kvRole} value={<Badge variant="destructive">{roleLabel(user?.role)}</Badge>} />
              <KV label={t.kv2fa} value={user?.two_factor_enabled ? <Badge variant="ok">{t.enabled}</Badge> : <Badge variant="outline">{t.disabled}</Badge>} />
              <KV label={t.kvTokenExpiry} value={remainLabel} />
              <Button variant="outline" size="sm" className="w-full mt-2" onClick={handleLogout}>{t.logout}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">{t.buildInfo}</CardTitle></CardHeader>
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

function ToggleRow({ title, description, checked, onChange, disabled }: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
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
