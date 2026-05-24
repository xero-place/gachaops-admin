'use client';

/**
 * /video-sources — 映像ソース管理ページ (Phase G-3+5-E, Session 30)
 *
 * 4 台のサイネージ端末に対して映像入力ソースを切り替える管理画面。
 * バックエンド API:
 *   - GET  /v1/devices                       (4 台リスト)
 *   - GET  /v1/video/status/{device_id}      (現在のソース)
 *   - GET  /v1/video/monitoring/{device_id}  (履歴)
 *   - POST /v1/video/source/{device_id}/set  (切替コマンド送信)
 *
 * 想定 source 値: server (gacha 配信に戻す) / hdmi1 / hdmi2 / usb / youtube
 * DB 側の VideoMonitoringLog では gacha / hdmi / usb / youtube の 4 値のみ蓄積。
 * (server を送ると APK が gacha 配信に戻る挙動。Session 30 D-11 fix 参照)
 */

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { fmtRelative, fmtDate } from '@/lib/format';
import type { Device } from '@/types/domain';
import {
  Tv2,
  Cast,
  Usb,
  Youtube,
  Server,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Send,
} from 'lucide-react';

interface ListResponse<T> {
  items?: T[];
  data?: T[];
  total?: number;
}

interface VideoStatus {
  id: string;
  device_id: string;
  source: string;
  is_playing: boolean;
  rotation: number;
  fps: number | null;
  resolution: string | null;
  has_audio: boolean;
  error_message: string | null;
  recorded_at: string;
}

interface SetVideoSourceResponse {
  message_id: string;
  source: string;
  status: string;
}

type SourceType = 'server' | 'hdmi1' | 'hdmi2' | 'usb' | 'youtube';

const SOURCE_LABEL: Record<SourceType, string> = {
  server: 'サーバ配信',
  hdmi1: 'HDMI 1',
  hdmi2: 'HDMI 2',
  usb: 'USB',
  youtube: 'YouTube',
};

const SOURCE_ICON: Record<SourceType, React.ReactNode> = {
  server: <Server className="h-4 w-4" />,
  hdmi1: <Cast className="h-4 w-4" />,
  hdmi2: <Cast className="h-4 w-4" />,
  usb: <Usb className="h-4 w-4" />,
  youtube: <Youtube className="h-4 w-4" />,
};

export default function VideoSourcesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<VideoStatus | null>(null);
  const [history, setHistory] = useState<VideoStatus[]>([]);
  const [youtubeUrl] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [sendingSource, setSendingSource] = useState<SourceType | null>(null);
  const [lastResult, setLastResult] = useState<{
    ok: boolean;
    message: string;
    ts: string;
  } | null>(null);

  // 1. デバイス一覧取得 (初回のみ)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<ListResponse<Device> | Device[]>(
          '/devices?limit=200',
        );
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : res.items ?? res.data ?? [];
        setDevices(arr);
        // 自動選択: 最初のオンライン端末、なければ最初の端末
        const firstOnline = arr.find((d) => d.status === 'online');
        setSelectedDeviceId((firstOnline ?? arr[0])?.id ?? null);
      } catch (e) {
        console.error('[video-sources] devices fetch failed:', e);
      } finally {
        if (!cancelled) setLoadingDevices(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. 選択中デバイスの最新ステータス + 履歴取得 (30 秒毎)
  const fetchStatus = useCallback(
    async (deviceId: string) => {
      setLoadingStatus(true);
      try {
        const [status, hist] = await Promise.all([
          api
            .get<VideoStatus | null>(`/video/status/${deviceId}`)
            .catch(() => null),
          api
            .get<VideoStatus[]>(`/video/monitoring/${deviceId}?limit=10`)
            .catch(() => [] as VideoStatus[]),
        ]);
        setCurrentStatus(status);
        setHistory(Array.isArray(hist) ? hist : []);
      } catch (e) {
        console.error('[video-sources] status fetch failed:', e);
      } finally {
        setLoadingStatus(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedDeviceId) {
      setCurrentStatus(null);
      setHistory([]);
      return;
    }
    fetchStatus(selectedDeviceId);
    const timer = setInterval(() => {
      fetchStatus(selectedDeviceId);
    }, 30_000);
    return () => clearInterval(timer);
  }, [selectedDeviceId, fetchStatus]);

  // 3. ソース切替送信
  const handleSendSource = useCallback(
    async (source: SourceType) => {
      if (!selectedDeviceId || sendingSource) return;
      // YouTube は URL 必須
      if (source === 'youtube' && !youtubeUrl.trim()) {
        setLastResult({
          ok: false,
          message: 'YouTube URL を入力してください',
          ts: new Date().toISOString(),
        });
        return;
      }
      setSendingSource(source);
      setLastResult(null);
      try {
        const body: { source: string; url?: string; rotation?: number } = {
          source,
        };
        if (source === 'youtube') {
          body.url = youtubeUrl.trim();
        }
        const res = await api.post<SetVideoSourceResponse>(
          `/video/source/${selectedDeviceId}/set`,
          body,
        );
        setLastResult({
          ok: true,
          message: `${SOURCE_LABEL[source]} へ切替コマンド送信完了 (message_id: ${res.message_id})`,
          ts: new Date().toISOString(),
        });
        // 5 秒後に最新ステータス再取得 (APK が反映するまで少し待つ)
        setTimeout(() => {
          if (selectedDeviceId) fetchStatus(selectedDeviceId);
        }, 5_000);
      } catch (e) {
        setLastResult({
          ok: false,
          message: `送信失敗: ${e instanceof Error ? e.message : '不明なエラー'}`,
          ts: new Date().toISOString(),
        });
      } finally {
        setSendingSource(null);
      }
    },
    [selectedDeviceId, sendingSource, youtubeUrl, fetchStatus],
  );

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);

  if (loadingDevices) {
    return (
      <AppShell title="映像ソース" breadcrumb={['ホーム', '映像ソース']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="映像ソース" breadcrumb={['ホーム', '映像ソース']}>
      <div className="space-y-6">
        {/* 説明バナー */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <Tv2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">
                  サイネージ端末の映像入力ソースを切り替えます
                </div>
                <div>
                  サーバ配信 (gacha 動画) / HDMI 入力 / USB 動画 / YouTube
                  embed の 5 種類から選択可能。
                  HiSilicon Source キーで HDMI/USB 切替、WebView で YouTube
                  再生、サーバ配信は ExoPlayer に戻ります。
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* デバイス選択 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Tv2 className="h-4 w-4" />
              対象デバイス
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {devices.map((d) => {
                const active = d.id === selectedDeviceId;
                const online = d.status === 'online';
                return (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDeviceId(d.id)}
                    className={`text-left rounded-md border p-3 transition-all ${
                      active
                        ? 'border-primary bg-primary/10'
                        : 'bg-card hover:bg-accent hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {online ? (
                        <Wifi className="h-3.5 w-3.5 text-ok" />
                      ) : (
                        <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium truncate">
                        {d.name}
                      </span>
                    </div>
                    <div className="mt-1">
                      {d.pool_name ? (
                        <Badge variant="default" className="text-[10px]">
                          {d.pool_name}
                        </Badge>
                      ) : (
                        <Badge variant="muted" className="text-[10px]">
                          演出プール未設定
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex gap-1">
                      <Badge
                        variant={online ? 'ok' : 'muted'}
                        className="text-[10px]"
                      >
                        {online ? 'オンライン' : 'オフライン'}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selectedDevice && (
          <>
            {/* 現在のソース表示 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <RefreshCw
                    className={`h-4 w-4 ${
                      loadingStatus ? 'animate-spin text-primary' : ''
                    }`}
                  />
                  現在のソース (30 秒毎に自動更新)
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => fetchStatus(selectedDevice.id)}
                  disabled={loadingStatus}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  更新
                </Button>
              </CardHeader>
              <CardContent>
                {currentStatus ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <Field label="ソース">
                      <Badge variant="default" className="text-xs">
                        {currentStatus.source}
                      </Badge>
                    </Field>
                    <Field label="再生中">
                      {currentStatus.is_playing ? (
                        <span className="flex items-center gap-1 text-ok">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          再生中
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <XCircle className="h-3.5 w-3.5" />
                          停止中
                        </span>
                      )}
                    </Field>
                    <Field label="回転">
                      {currentStatus.rotation}°
                    </Field>
                    <Field label="最終更新">
                      <span title={fmtDate(currentStatus.recorded_at)}>
                        {fmtRelative(currentStatus.recorded_at)}
                      </span>
                    </Field>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground py-3 text-center">
                    まだステータスが記録されていません。30 秒待つか、下のボタンで切替してください。
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ソース切替ボタン */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  ソース切替
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  ボタンをクリックすると即座にコマンドを送信します
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(['server', 'hdmi1', 'hdmi2', 'usb'] as SourceType[]).map(
                    (src) => (
                      <Button
                        key={src}
                        variant={src === 'server' ? 'default' : 'outline'}
                        size="sm"
                        className="h-auto py-3 flex flex-col items-center gap-1.5"
                        onClick={() => handleSendSource(src)}
                        disabled={
                          sendingSource !== null ||
                          selectedDevice.status !== 'online'
                        }
                      >
                        {sendingSource === src ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          SOURCE_ICON[src]
                        )}
                        <span className="text-xs font-medium">
                          {SOURCE_LABEL[src]}
                        </span>
                      </Button>
                    ),
                  )}
                </div>


                {/* 送信結果 */}
                {lastResult && (
                  <div
                    className={`rounded-md border p-2 text-xs ${
                      lastResult.ok
                        ? 'border-ok/40 bg-ok/5 text-ok'
                        : 'border-destructive/40 bg-destructive/5 text-destructive'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {lastResult.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div>{lastResult.message}</div>
                        <div className="text-[10px] opacity-70 mt-0.5">
                          {fmtDate(lastResult.ts)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedDevice.status !== 'online' && (
                  <div className="rounded-md border border-warn/40 bg-warn/5 p-2 text-xs text-warn">
                    ⚠️ 端末がオフラインです。コマンドは送信できますが、再接続後に反映されます。
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 履歴 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">監視ログ履歴 (最新 10 件)</CardTitle>
                <p className="text-xs text-muted-foreground">
                  APK から 30 秒毎に POST されるソース状態の履歴 (Phase G-3+5-D PATCH 7)
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {history.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-6 text-center">
                    まだ履歴がありません
                  </div>
                ) : (
                  <ul className="divide-y">
                    {history.map((h) => (
                      <li
                        key={h.id}
                        className="flex items-center gap-3 px-4 py-2.5 text-xs"
                      >
                        <Badge variant="muted" className="text-[10px] shrink-0">
                          {h.source}
                        </Badge>
                        <span
                          className={`text-[11px] ${
                            h.is_playing ? 'text-ok' : 'text-muted-foreground'
                          }`}
                        >
                          {h.is_playing ? '✓ 再生中' : '○ 停止中'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          rot={h.rotation}°
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {fmtRelative(h.recorded_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}
