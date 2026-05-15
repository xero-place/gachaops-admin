'use client';

/**
 * LiveControlSheet — the central reusable dialog for "change what's playing
 * on these devices, right now".
 *
 * Used from:
 *   - device detail page (single device scope)
 *   - device list page (multi-device, after row selection)
 *   - /live-control center page (any scope)
 *
 * Two modes: immediate (swap and stay until restored), or time-limited
 * (auto-revert to plan mode after a duration).
 */

import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { tokenStore } from '@/lib/token-store';
import { useLiveStore } from '@/stores/live-control-store';
import { fmtDuration } from '@/lib/format';
import { Search, Zap, Clock, AlertCircle, ChevronRight, Film, Image as ImageIcon } from 'lucide-react';
import type { Program } from '@/types/domain';

export interface LiveControlScope {
  /** Device IDs that will receive the command */
  device_ids: string[];
  /** Human-readable label, e.g. "渋谷スクランブル店 (8台)" */
  label: string;
}

export function LiveControlSheet({
  open,
  onOpenChange,
  scope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: LiveControlScope | null;
}) {
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'immediate' | 'expiring'>('immediate');
  const [duration, setDuration] = useState('30');
  const applySwitch = useLiveStore((s) => s.applySwitch);

  // Fetch programs from API when dialog opens
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPrograms(true);
    (async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';
        const token = tokenStore.getAccess();
        const res = await fetch(`${apiBase}/programs?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setPrograms((data.items ?? data ?? []) as Program[]);
      } catch (err) {
        console.error('[live-control-sheet] failed to fetch programs:', err);
        if (!cancelled) setPrograms([]);
      } finally {
        if (!cancelled) setLoadingPrograms(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Only published programs can be sent live
  const eligible = useMemo(() => {
    return programs.filter((p) => {
      if (!p.published) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!p.name.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [programs, search]);

  const selected = selectedProgramId ? programs.find((p) => p.id === selectedProgramId) : null;

  const reset = () => {
    setStep('pick');
    setSelectedProgramId(null);
    setSearch('');
    setMode('immediate');
    setDuration('30');
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(reset, 200);
  };

  const onConfirm = () => {
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
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />映像を切り替え
          </DialogTitle>
          <DialogDescription>
            対象端末で再生中の映像を即座に差し替えます。<br />
            <span className="text-foreground">{scope?.label ?? ''}</span> の <strong>{scope?.device_ids.length ?? 0} 台</strong> が対象です。
          </DialogDescription>
        </DialogHeader>

        {step === 'pick' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="プログラム名で検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
              {eligible.map((p) => (
                <ProgramOption
                  key={p.id}
                  program={p}
                  selected={selectedProgramId === p.id}
                  onSelect={() => setSelectedProgramId(p.id)}
                />
              ))}
              {eligible.length === 0 && (
                <div className="col-span-full text-center text-sm text-muted-foreground py-8">
                  該当する公開済プログラムがありません
                </div>
              )}
            </div>

            <div className="rounded-md bg-muted/40 border p-2 text-[11px] text-muted-foreground">
              下書き状態のプログラムは配信できません。先に公開してから切替してください。
            </div>
          </div>
        )}

        {step === 'confirm' && selected && scope && (
          <div className="space-y-4">
            <div className="rounded-md border bg-card p-3 flex gap-3">
              {selected.thumbnail_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={selected.thumbnail_url} alt="" className="h-16 w-28 rounded object-cover shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{selected.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {selected.scene_count} シーン · {fmtDuration(getProgramTotalSec((selected as Program & { scene_previews?: Array<{ asset_type: string | null; duration_sec: number; asset_duration_ms?: number | null }> }).scene_previews, selected.total_duration_sec) * 1000)}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => setStep('pick')}>
                変更
              </Button>
            </div>

            <Tabs value={mode} onValueChange={(v) => setMode(v as 'immediate' | 'expiring')}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="immediate" className="gap-1.5">
                  <Zap className="h-3.5 w-3.5" />即時切替
                </TabsTrigger>
                <TabsTrigger value="expiring" className="gap-1.5">
                  <Clock className="h-3.5 w-3.5" />期限指定
                </TabsTrigger>
              </TabsList>
              <TabsContent value="immediate" className="mt-3">
                <div className="rounded-md border bg-card p-3 text-xs space-y-1.5">
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-primary" />すぐ切り替えて、そのまま継続
                  </div>
                  <p className="text-muted-foreground">
                    対象端末は <strong>手動モード</strong> に変わります。<br />
                    元の時間割に戻すには、後で「計画モードに戻す」ボタンを押してください。
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="expiring" className="mt-3 space-y-3">
                <div className="rounded-md border bg-card p-3 text-xs space-y-1.5">
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-primary" />指定時間後、自動で計画モードに戻る
                  </div>
                  <p className="text-muted-foreground">
                    キャンペーンや臨時告知に最適。期限が来ると元の時間割が自動で再開します。
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">継続時間 (分)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="duration"
                      type="number"
                      min="1"
                      max="1440"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-32"
                    />
                    <div className="flex gap-1">
                      {[15, 30, 60, 120].map((m) => (
                        <Button
                          key={m}
                          type="button"
                          variant={duration === String(m) ? 'secondary' : 'outline'}
                          size="sm"
                          className="h-9 px-2.5 text-xs"
                          onClick={() => setDuration(String(m))}
                        >
                          {m}分
                        </Button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    終了予定: <span className="font-mono">
                      {new Date(Date.now() + (parseInt(duration) || 0) * 60 * 1000).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' })}
                    </span>
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {scope.device_ids.length > 5 && (
              <div className="rounded-md bg-warn/10 border border-warn/30 p-2.5 flex items-start gap-2 text-xs">
                <AlertCircle className="h-4 w-4 text-warn shrink-0 mt-0.5" />
                <span>
                  <strong>{scope.device_ids.length} 台</strong> の端末に同時送信します。
                  オフライン端末はオンライン復帰時に適用されます。
                </span>
              </div>
            )}
          </div>
        )}

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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Session 13: 表示用の秒数を取得 (動画は実長、画像/gif は duration_sec)
function getDisplayDurationSec(sp: { asset_type: string | null; duration_sec: number; asset_duration_ms?: number | null }): number {
  if (sp.asset_type === 'video' && sp.asset_duration_ms && sp.asset_duration_ms > 0) {
    return Math.ceil(sp.asset_duration_ms / 1000);
  }
  return sp.duration_sec;
}

// Session 13: プログラム全体の合計秒数 (動画は実長、画像/gif は duration_sec)
function getProgramTotalSec(scenePreviews: Array<{ asset_type: string | null; duration_sec: number; asset_duration_ms?: number | null }> | undefined, fallback: number): number {
  if (!scenePreviews || scenePreviews.length === 0) return fallback;
  return scenePreviews.reduce((sum, sp) => sum + getDisplayDurationSec(sp), 0);
}

function ProgramOption({
  program,
  selected,
  onSelect,
}: {
  program: Program & { scene_previews?: Array<{ scene_id: string; order_index: number; duration_sec: number; asset_type: string | null; thumbnail_url: string | null; asset_duration_ms?: number | null }> };
  selected: boolean;
  onSelect: () => void;
}) {
  const previews = program.scene_previews ?? [];
  const n = previews.length;
  const cfg =
    n <= 2 ? { thumb: 'w-16 h-16', icon: 'h-5 w-5', badge: 'w-4 h-4 text-[10px]', dur: 'text-[9px]', arrow: 'h-3 w-3' }
  : n <= 4 ? { thumb: 'w-12 h-12', icon: 'h-4 w-4', badge: 'w-3.5 h-3.5 text-[9px]', dur: 'text-[8px]', arrow: 'h-3 w-3' }
  : n <= 6 ? { thumb: 'w-10 h-10', icon: 'h-3.5 w-3.5', badge: 'w-3.5 h-3.5 text-[8px]', dur: 'text-[7px]', arrow: 'h-2.5 w-2.5' }
  :          { thumb: 'w-8 h-8', icon: 'h-3 w-3', badge: 'w-3 h-3 text-[7px]', dur: 'text-[7px]', arrow: 'h-2 w-2' };

  return (
    <button
      onClick={onSelect}
      className={`text-left rounded-md border bg-card p-3 transition-all flex flex-col gap-2 ${
        selected ? 'border-primary ring-2 ring-primary/30' : 'hover:bg-accent'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{program.name}</div>
        <div className="text-[10.5px] text-muted-foreground mt-0.5 flex items-center gap-2">
          <span>{program.scene_count} シーン</span>
          <span>·</span>
          <span>{fmtDuration(getProgramTotalSec(previews, program.total_duration_sec) * 1000)}</span>
        </div>
        {selected && (
          <Badge variant="default" className="mt-1.5 text-[10px] h-4 px-1.5">選択中</Badge>
        )}
      </div>
      {previews.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto">
          {previews.map((scene, i) => (
            <div key={scene.scene_id} className="flex items-center gap-1 flex-shrink-0">
              <div className={`relative ${cfg.thumb} rounded overflow-hidden bg-black/60 flex-shrink-0`}>
                {scene.thumbnail_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={scene.thumbnail_url} alt={`シーン ${i + 1}`} className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {scene.asset_type === 'video' ? (
                      <Film className={`${cfg.icon} text-muted-foreground`} />
                    ) : (
                      <ImageIcon className={`${cfg.icon} text-muted-foreground`} />
                    )}
                  </div>
                )}
                <div className={`absolute top-0 left-0 bg-primary text-primary-foreground font-bold ${cfg.badge} flex items-center justify-center rounded-br`}>
                  {i + 1}
                </div>
                <div className={`absolute bottom-0 left-0 right-0 bg-black/75 text-white ${cfg.dur} text-center px-0.5 leading-tight`}>
                  {getDisplayDurationSec(scene)}s
                </div>
              </div>
              {i < previews.length - 1 && (
                <ChevronRight className={`${cfg.arrow} text-muted-foreground flex-shrink-0`} />
              )}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
