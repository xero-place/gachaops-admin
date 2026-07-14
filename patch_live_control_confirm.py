#!/usr/bin/env python3
# live-control-sheet.tsx に「配信後の到達確認」を追加するパッチ（v2）
# 変更: import から ListResponse を外し、ローカル型 DeviceListResp を定義して使う。
# すべて count==1 ガード。backend無変更・no-touch厳守。
import hashlib

P = "src/components/domain/live-control-sheet.tsx"
s = open(P, encoding="utf-8").read()
before_md5 = hashlib.md5(s.encode()).hexdigest()
print(f"[pre ] md5={before_md5} len={len(s)}")

def repl(old, new, label):
    global s
    c = s.count(old)
    assert c == 1, f"[{label}] expected 1 match, got {c}"
    s = s.replace(old, new, 1)
    print(f"[ok  ] {label}")

# ── 変更1: import に api / Device / アイコンを追加（ListResponseは使わない） ──
repl(
"import { Search, Zap, Clock, AlertCircle, ChevronRight, Film, Image as ImageIcon } from 'lucide-react';",
"import { Search, Zap, Clock, AlertCircle, ChevronRight, Film, Image as ImageIcon, CheckCircle2, Loader2, AlertTriangle, RotateCw } from 'lucide-react';\nimport { api } from '@/lib/api';\nimport type { Device } from '@/types/domain';\n\n// /devices のレスポンス形（このファイル内ローカル定義）\ninterface DeviceListResp { items?: Device[]; data?: Device[]; total?: number }",
"import追加",
)

# ── 変更2: step型に confirming 追加 ＋ 確認用state ─────────────
repl(
"  const [step, setStep] = useState<'pick' | 'confirm'>('pick');",
"""  const [step, setStep] = useState<'pick' | 'confirm' | 'confirming'>('pick');
  // 配信後の到達確認: device_id -> 'pending' | 'ok' | 'unconfirmed'
  const [deliveryStatus, setDeliveryStatus] = useState<Record<string, 'pending' | 'ok' | 'unconfirmed'>>({});""",
"step型+state",
)

# ── 変更3: reset に deliveryStatus クリアを追加 ───────────────
repl(
"""  const reset = () => {
    setStep('pick');
    setSelectedProgramId(null);
    setSearch('');
    setMode('immediate');
    setDuration('30');
  };""",
"""  const reset = () => {
    setStep('pick');
    setSelectedProgramId(null);
    setSearch('');
    setMode('immediate');
    setDuration('30');
    setDeliveryStatus({});
  };""",
"reset更新",
)

# ── 変更4: onConfirm を確認フロー化 ──────────────────────────
repl(
"""  const onConfirm = () => {
    if (!scope || !selected) return;
    let expires_at: string | null = null;
    if (mode === 'expiring') {
      const minutes = parseInt(duration, 10) || 30;
      expires_at = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    }
    applySwitch({
      device_ids: scope.device_ids,
      program_id: selected.id,
      program_name: selected.name,
      expires_at,
      scope_label: scope.label,
      applied_by: 'admin@gachaops.example',
    });
    close();
  };""",
"""  // 配信後、各端末が実際に配信プログラムを再生中になったかを照合する。
  // /devices の current_program_id === 配信した program_id なら「切替成功」。
  // 2.5秒間隔で最大6回(=15秒)ポーリングし、未一致のまま終わった端末は「未確認」。
  const verifyDelivery = async (deviceIds: string[], programId: string) => {
    const remaining = new Set(deviceIds);
    const ATTEMPTS = 6;
    const INTERVAL_MS = 2500;
    for (let i = 0; i < ATTEMPTS && remaining.size > 0; i++) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      try {
        const res = await api.get<DeviceListResp | Device[]>('/devices?limit=200');
        const list = Array.isArray(res) ? res : (res.items ?? res.data ?? []);
        const byId = new Map(list.map((d) => [d.id, d]));
        for (const id of Array.from(remaining)) {
          const d = byId.get(id);
          if (d && d.current_program_id === programId) {
            remaining.delete(id);
            setDeliveryStatus((prev) => ({ ...prev, [id]: 'ok' }));
          }
        }
      } catch (e) {
        console.error('[live-control] verify poll failed', e);
      }
    }
    if (remaining.size > 0) {
      setDeliveryStatus((prev) => {
        const next = { ...prev };
        for (const id of remaining) next[id] = 'unconfirmed';
        return next;
      });
    }
  };

  const startDelivery = (deviceIds: string[]) => {
    if (!selected) return;
    let expires_at: string | null = null;
    if (mode === 'expiring') {
      const minutes = parseInt(duration, 10) || 30;
      expires_at = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    }
    // 既存の配信(楽観的override + bulk play_program)はそのまま使う
    applySwitch({
      device_ids: deviceIds,
      program_id: selected.id,
      program_name: selected.name,
      expires_at,
      scope_label: scope?.label ?? '',
      applied_by: 'admin@gachaops.example',
    });
    setDeliveryStatus((prev) => {
      const next = { ...prev };
      for (const id of deviceIds) next[id] = 'pending';
      return next;
    });
    void verifyDelivery(deviceIds, selected.id);
  };

  const onConfirm = () => {
    if (!scope || !selected) return;
    setStep('confirming');
    startDelivery(scope.device_ids);
  };

  const onRetry = (deviceId: string) => {
    setDeliveryStatus((prev) => ({ ...prev, [deviceId]: 'pending' }));
    startDelivery([deviceId]);
  };""",
"onConfirm確認フロー化",
)

# ── 変更5: 確認ステップUI を confirm ブロックの後に挿入 ────────
repl(
"""        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>キャンセル</Button>
          {step === 'pick' ? (
            <Button onClick={() => setStep('confirm')} disabled={!selectedProgramId}>
              次へ
            </Button>
          ) : (
            <Button onClick={onConfirm} className="gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              {scope?.device_ids.length ?? 0} 台に送信
            </Button>
          )}
        </DialogFooter>""",
"""        )}

        {step === 'confirming' && scope && selected && (
          <div className="space-y-3">
            {(() => {
              const ids = scope.device_ids;
              const okCount = ids.filter((id) => deliveryStatus[id] === 'ok').length;
              const pendingCount = ids.filter((id) => deliveryStatus[id] === 'pending').length;
              const unconfirmedCount = ids.filter((id) => deliveryStatus[id] === 'unconfirmed').length;
              const allDone = pendingCount === 0;
              return (
                <>
                  <div className="rounded-md border bg-card p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {!allDone ? (
                        <><Loader2 className="h-4 w-4 animate-spin text-primary" />\u5207\u66ff\u3092\u78ba\u8a8d\u4e2d\u2026</>
                      ) : unconfirmedCount === 0 ? (
                        <><CheckCircle2 className="h-4 w-4 text-ok" />{ids.length} \u53f0\u4e2d {okCount} \u53f0 \u5207\u66ff\u6210\u529f</>
                      ) : (
                        <><AlertTriangle className="h-4 w-4 text-warn" />{ids.length} \u53f0\u4e2d {okCount} \u53f0 \u5207\u66ff\u6210\u529f \u00b7 {unconfirmedCount} \u53f0 \u672a\u78ba\u8a8d</>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      \u300c{selected.name}\u300d\u3092\u914d\u4fe1\u3057\u3001\u5404\u7aef\u672b\u304c\u5b9f\u969b\u306b\u518d\u751f\u3092\u958b\u59cb\u3057\u305f\u304b\u78ba\u8a8d\u3057\u3066\u3044\u307e\u3059\u3002
                    </p>
                  </div>

                  <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                    {ids.map((id) => {
                      const st = deliveryStatus[id] ?? 'pending';
                      return (
                        <div key={id} className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-xs">
                          <span className="font-mono text-muted-foreground truncate">{id}</span>
                          {st === 'ok' && (
                            <span className="flex items-center gap-1 text-ok"><CheckCircle2 className="h-3.5 w-3.5" />\u5207\u66ff\u6210\u529f</span>
                          )}
                          {st === 'pending' && (
                            <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />\u78ba\u8a8d\u4e2d</span>
                          )}
                          {st === 'unconfirmed' && (
                            <span className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-warn"><AlertTriangle className="h-3.5 w-3.5" />\u672a\u78ba\u8a8d</span>
                              <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={() => onRetry(id)}>
                                <RotateCw className="h-3 w-3" />\u518d\u8a66\u884c
                              </Button>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {allDone && unconfirmedCount > 0 && (
                    <div className="rounded-md bg-warn/10 border border-warn/30 p-2.5 flex items-start gap-2 text-xs">
                      <AlertCircle className="h-4 w-4 text-warn shrink-0 mt-0.5" />
                      <span>\u672a\u78ba\u8a8d\u306e\u7aef\u672b\u306f\u3001\u30aa\u30d5\u30e9\u30a4\u30f3\u304b\u518d\u751f\u958b\u59cb\u304c\u9045\u308c\u3066\u3044\u308b\u53ef\u80fd\u6027\u304c\u3042\u308a\u307e\u3059\u3002\u518d\u8a66\u884c\u3059\u308b\u304b\u3001\u7aef\u672b\u306e\u72b6\u614b\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002</span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        <DialogFooter>
          {step === 'confirming' ? (
            <Button onClick={close}>\u9589\u3058\u308b</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>\u30ad\u30e3\u30f3\u30bb\u30eb</Button>
              {step === 'pick' ? (
                <Button onClick={() => setStep('confirm')} disabled={!selectedProgramId}>
                  \u6b21\u3078
                </Button>
              ) : (
                <Button onClick={onConfirm} className="gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  {scope?.device_ids.length ?? 0} \u53f0\u306b\u9001\u4fe1
                </Button>
              )}
            </>
          )}
        </DialogFooter>""",
"確認ステップUI+Footer分岐",
)

after_md5 = hashlib.md5(s.encode()).hexdigest()
open(P, "w", encoding="utf-8").write(s)
print(f"[post] md5={after_md5} len={len(s)}")
print("DONE: 5 changes applied")
