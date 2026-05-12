'use client';

import { useState, useRef, useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { devices } from '@/mocks/fixtures';
import { Send, Trash2, TerminalSquare, ArrowDownLeft, ArrowUpRight, Wifi, WifiOff } from 'lucide-react';

/**
 * WS Debug Console — local simulation of Step D protocol.
 *
 * No actual WebSocket connection: this is an in-memory simulator that lets
 * an operator try out command shapes (set_volume, play_program, ping) and see
 * the responses the server *would* send. Useful for:
 *   - Onboarding new operators without a real device
 *   - Debugging payload shape issues before hitting prod
 *   - Demoing the protocol to stakeholders
 *
 * Real connection wiring: replace `simulate()` with `ws.send(JSON.stringify(...))`
 * and route incoming messages from `ws.onmessage` into `appendLog('recv', ...)`.
 */

type LogEntry = {
  id: string;
  ts: string;
  direction: 'send' | 'recv' | 'system';
  data: unknown;
};

interface CommandTemplate {
  type: string;
  description: string;
  payload: Record<string, unknown>;
}

const TEMPLATES: CommandTemplate[] = [
  { type: 'set_volume', description: '音量を設定', payload: { volume: 70 } },
  { type: 'set_brightness', description: '輝度を設定', payload: { brightness: 80 } },
  { type: 'play_program', description: '指定プログラムを再生', payload: { program_id: 'prg_1' } },
  { type: 'reboot', description: '端末を再起動', payload: {} },
  { type: 'capture_screenshot', description: 'スクリーンショット要求', payload: {} },
  { type: 'sync_assets', description: 'アセット同期', payload: { force: false } },
  { type: 'ping', description: 'ハートビート', payload: {} },
];

export default function WsConsolePage() {
  const [selectedDevice, setSelectedDevice] = useState(devices[0]?.id ?? '');
  const [connected, setConnected] = useState(false);
  const [commandType, setCommandType] = useState(TEMPLATES[0].type);
  const [payload, setPayload] = useState(JSON.stringify(TEMPLATES[0].payload, null, 2));
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const appendLog = (direction: LogEntry['direction'], data: unknown) => {
    setLogs((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), ts: new Date().toISOString(), direction, data },
    ]);
  };

  const onTemplateChange = (type: string) => {
    setCommandType(type);
    const t = TEMPLATES.find((x) => x.type === type);
    if (t) setPayload(JSON.stringify(t.payload, null, 2));
  };

  const connect = () => {
    setConnected(true);
    appendLog('system', { event: 'connect', device_id: selectedDevice });
    setTimeout(() => {
      appendLog('recv', {
        type: 'hello',
        device_id: selectedDevice,
        protocol_version: '2.0',
        server_time: new Date().toISOString(),
      });
    }, 300);
  };

  const disconnect = () => {
    appendLog('system', { event: 'disconnect' });
    setConnected(false);
  };

  const sendCommand = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      appendLog('system', { error: 'Payload is not valid JSON' });
      return;
    }
    const messageId = 'm_' + Math.random().toString(36).slice(2, 10);
    const message = { type: commandType, message_id: messageId, payload: parsed };
    appendLog('send', message);

    // Simulate server response
    setTimeout(() => {
      const ack = {
        type: 'ack',
        ref_message_id: messageId,
        status: 'ok',
        result: simulate(commandType, parsed),
      };
      appendLog('recv', ack);
    }, 200 + Math.random() * 400);
  };

  const clearLogs = () => setLogs([]);

  return (
    <AppShell title="WSデバッグコンソール" breadcrumb={['ホーム', 'WSデバッグコンソール']}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TerminalSquare className="h-3.5 w-3.5" />
                  端末メッセージログ
                  {connected && <Badge variant="ok" className="gap-1"><span className="live-dot" />接続中</Badge>}
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearLogs}>
                  <Trash2 className="h-3 w-3" />クリア
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div ref={logRef} className="h-[480px] overflow-y-auto p-4 font-mono text-[11px] space-y-2 bg-muted/20">
                {logs.length === 0 && (
                  <div className="text-center text-muted-foreground py-12 font-sans">
                    まだメッセージがありません。「接続」してコマンドを送信してください
                  </div>
                )}
                {logs.map((log) => (
                  <LogLine key={log.id} log={log} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">接続</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">対象端末</Label>
                <Select value={selectedDevice} onValueChange={setSelectedDevice} disabled={connected}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {devices.slice(0, 20).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {connected ? (
                <Button variant="outline" className="w-full gap-1.5" onClick={disconnect}>
                  <WifiOff className="h-3.5 w-3.5" />切断
                </Button>
              ) : (
                <Button className="w-full gap-1.5" onClick={connect}>
                  <Wifi className="h-3.5 w-3.5" />接続 (シミュレーション)
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">
                ※ ローカルシミュレーター。実 WSサーバには接続しません
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">コマンド送信</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">テンプレート</Label>
                <Select value={commandType} onValueChange={onTemplateChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATES.map((t) => (
                      <SelectItem key={t.type} value={t.type}>
                        <div>
                          <div className="text-sm">{t.type}</div>
                          <div className="text-[10px] text-muted-foreground">{t.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">payload (JSON)</Label>
                <textarea
                  className="w-full h-32 rounded-md border bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                />
              </div>
              <Button className="w-full gap-1.5" onClick={sendCommand} disabled={!connected}>
                <Send className="h-3.5 w-3.5" />送信
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function LogLine({ log }: { log: LogEntry }) {
  const isSend = log.direction === 'send';
  const isRecv = log.direction === 'recv';
  const isSystem = log.direction === 'system';
  const time = log.ts.slice(11, 23);
  return (
    <div className="flex items-start gap-2 group">
      <span className="text-muted-foreground/60 shrink-0 tabular-nums w-[92px]">{time}</span>
      <span className="shrink-0 w-5">
        {isSend && <ArrowUpRight className="h-3 w-3 text-primary" />}
        {isRecv && <ArrowDownLeft className="h-3 w-3 text-ok" />}
        {isSystem && <span className="text-muted-foreground">·</span>}
      </span>
      <pre className={`flex-1 whitespace-pre-wrap break-all ${isSend ? 'text-primary' : isRecv ? 'text-ok' : 'text-muted-foreground italic'}`}>
        {JSON.stringify(log.data)}
      </pre>
    </div>
  );
}

function simulate(type: string, payload: unknown): Record<string, unknown> {
  if (type === 'ping') return { pong: true, latency_ms: 23 };
  if (type === 'set_volume' && payload && typeof payload === 'object' && 'volume' in payload) {
    return { applied_volume: (payload as { volume: number }).volume };
  }
  if (type === 'set_brightness' && payload && typeof payload === 'object' && 'brightness' in payload) {
    return { applied_brightness: (payload as { brightness: number }).brightness };
  }
  if (type === 'play_program') return { now_playing: 'prg_1', resumed: true };
  if (type === 'reboot') return { will_reboot_in_sec: 5 };
  if (type === 'capture_screenshot') return { screenshot_url: '/api/_mock/screenshot.svg?t=' + Date.now() };
  if (type === 'sync_assets') return { synced_count: 12, failed_count: 0 };
  return {};
}
