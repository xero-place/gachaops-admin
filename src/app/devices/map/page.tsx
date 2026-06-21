'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, Minus, Maximize2, MapPin, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Store, Device } from '@/types/domain';
import { tokenStore } from '@/lib/token-store';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const VIEW_W = 1000;
const VIEW_H = 846;
const MIN_SCALE = 1;
const MAX_SCALE = 12;

function project(lat: number, lng: number, w = VIEW_W, h = VIEW_H) {
  const minLng = 122.5;
  const maxLng = 153.5;
  const minLat = 24;
  const maxLat = 46;
  const x = ((lng - minLng) / (maxLng - minLng)) * w;
  const y = ((maxLat - lat) / (maxLat - minLat)) * h;
  return { x, y };
}


// S147: 測位時刻の鮮度を判定。30分以内=現在地(緑)、それ以前=最終位置(グレー)
function locFreshness(updatedAt: string | null): { fresh: boolean; label: string } {
  if (!updatedAt) return { fresh: false, label: '位置未取得' };
  const t = new Date(updatedAt).getTime();
  if (isNaN(t)) return { fresh: false, label: '位置未取得' };
  const diffMin = (Date.now() - t) / 60000;
  if (diffMin < 30) return { fresh: true, label: '現在地' };
  if (diffMin < 60) return { fresh: false, label: `最終位置 ${Math.round(diffMin)}分前` };
  const diffH = diffMin / 60;
  if (diffH < 24) return { fresh: false, label: `最終位置 ${Math.round(diffH)}時間前` };
  return { fresh: false, label: `最終位置 ${Math.round(diffH / 24)}日前` };
}

interface ViewBox { x: number; y: number; w: number; h: number }

export default function DevicesMapPage() {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [locating, setLocating] = useState(false);
  const [locateMsg, setLocateMsg] = useState<string | null>(null);
  const [locateDone, setLocateDone] = useState(false);
  const [locateDoneCount, setLocateDoneCount] = useState(0);
  const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';

  const [vb, setVb] = useState<ViewBox>({ x: 0, y: 0, w: VIEW_W, h: VIEW_H });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef<{ x: number; y: number; vbx: number; vby: number } | null>(null);

  // 現在の拡大率（1 = 全体表示）
  const scale = VIEW_W / vb.w;

  const loadData = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        api.get<{ items?: Store[] } | Store[]>('/stores?limit=100'),
        api.get<{ items?: Device[] } | Device[]>('/devices?limit=200'),
      ]);
      const storesArr = Array.isArray(s) ? s : (s.items ?? []);
      const devicesArr = Array.isArray(d) ? d : (d.items ?? []);
      setStores(storesArr);
      setDevices(devicesArr);
    } catch (e) {
      console.warn('Map data fetch failed:', e);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // S147: 位置を一括取得（lv1_super運営のみ・全顧客横断）
  const handleLocateAll = useCallback(async () => {
    setLocating(true);
    setLocateMsg(null);
    try {
      const res = await api.post<{ requested: number; total: number }>('/devices/locate-all');
      setLocateMsg(`${res.requested}台に測位指示を送信。反映を待っています…`);
      // 端末がスキャン→報告するのを待ってからリフレッシュ（2回）
      setTimeout(() => { loadData(); }, 4000);
      setTimeout(() => {
        loadData();
        setLocateMsg(null);
        setLocateDoneCount(res.requested);
        setLocateDone(true);  // 完了ポップアップ表示
      }, 9000);
    } catch (e) {
      console.warn('locate-all failed:', e);
      setLocateMsg('測位指示の送信に失敗しました');
    } finally {
      setLocating(false);
    }
  }, [loadData]);

  // SVG座標へ変換（マウス位置 → viewBox内の座標）
  const toSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { sx: 0, sy: 0 };
    const rect = svg.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    return { sx: vb.x + px * vb.w, sy: vb.y + py * vb.h };
  }, [vb]);

  // ズーム共通処理（中心座標 cx,cy を固定して拡大率を factor 倍）
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setVb((prev) => {
      const curScale = VIEW_W / prev.w;
      let newScale = curScale * factor;
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      const newW = VIEW_W / newScale;
      const newH = VIEW_H / newScale;
      // cx,cy を画面上の同じ相対位置に保つ
      const relX = prev.w === 0 ? 0.5 : (cx - prev.x) / prev.w;
      const relY = prev.h === 0 ? 0.5 : (cy - prev.y) / prev.h;
      let nx = cx - relX * newW;
      let ny = cy - relY * newH;
      // 範囲外に出ないようクランプ
      nx = Math.max(0, Math.min(VIEW_W - newW, nx));
      ny = Math.max(0, Math.min(VIEW_H - newH, ny));
      return { x: nx, y: ny, w: newW, h: newH };
    });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const { sx, sy } = toSvg(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    zoomAt(sx, sy, factor);
  }, [toSvg, zoomAt]);

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    dragging.current = { x: e.clientX, y: e.clientY, vbx: vb.x, vby: vb.y };
  }, [vb]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const dg = dragging.current;
    if (!dg) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - dg.x) / rect.width) * vb.w;
    const dy = ((e.clientY - dg.y) / rect.height) * vb.h;
    setVb((prev) => {
      let nx = dg.vbx - dx;
      let ny = dg.vby - dy;
      nx = Math.max(0, Math.min(VIEW_W - prev.w, nx));
      ny = Math.max(0, Math.min(VIEW_H - prev.h, ny));
      return { ...prev, x: nx, y: ny };
    });
  }, [vb]);

  const endDrag = useCallback(() => { dragging.current = null; }, []);

  const zoomButton = (factor: number) => {
    zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, factor);
  };
  const resetView = () => setVb({ x: 0, y: 0, w: VIEW_W, h: VIEW_H });

  // ズームしてもマーカー/文字サイズを一定に保つ補正係数
  const inv = 1 / scale;

  // 店舗ピンへフォーカス（一覧クリックで該当店舗を中央拡大）
  const focusStore = (s: Store) => {
    if (!s.latitude || !s.longitude) return;
    const { x, y } = project(s.latitude, s.longitude);
    const targetScale = 6;
    const newW = VIEW_W / targetScale;
    const newH = VIEW_H / targetScale;
    let nx = x - newW / 2;
    let ny = y - newH / 2;
    nx = Math.max(0, Math.min(VIEW_W - newW, nx));
    ny = Math.max(0, Math.min(VIEW_H - newH, ny));
    setVb({ x: nx, y: ny, w: newW, h: newH });
  };

  return (
    <AppShell title="端末マップ" breadcrumb={['ホーム', '端末', 'マップ']}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                {/* S147: 位置を一括取得（運営lv1_superのみ）*/}
                {isSuperAdmin && (
                  <div className="absolute top-2 left-2 z-10 flex flex-col items-start gap-1">
                    <button
                      onClick={handleLocateAll}
                      disabled={locating}
                      className="h-9 px-3 flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm text-xs font-medium disabled:opacity-60"
                      aria-label="位置を一括取得"
                    >
                      {locating
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <MapPin className="h-3.5 w-3.5" />}
                      位置を一括取得
                    </button>
                    {locateMsg && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-card/90 border border-border text-muted-foreground max-w-[180px]">
                        {locateMsg}
                      </span>
                    )}
                  </div>
                )}
                {/* ズームコントロール */}
                <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
                  <button
                    onClick={() => zoomButton(1.4)}
                    className="h-8 w-8 flex items-center justify-center rounded-md bg-card/90 border border-border hover:bg-accent shadow-sm"
                    aria-label="拡大"
                  ><Plus className="h-4 w-4" /></button>
                  <button
                    onClick={() => zoomButton(1 / 1.4)}
                    className="h-8 w-8 flex items-center justify-center rounded-md bg-card/90 border border-border hover:bg-accent shadow-sm"
                    aria-label="縮小"
                  ><Minus className="h-4 w-4" /></button>
                  <button
                    onClick={resetView}
                    className="h-8 w-8 flex items-center justify-center rounded-md bg-card/90 border border-border hover:bg-accent shadow-sm"
                    aria-label="全体表示"
                  ><Maximize2 className="h-4 w-4" /></button>
                </div>
                {scale > 1.05 && (
                  <div className="absolute top-14 left-2 z-10 text-[10px] px-1.5 py-0.5 rounded bg-card/90 border border-border text-muted-foreground tabular-nums">
                    {scale.toFixed(1)}×
                  </div>
                )}
                <svg
                  ref={svgRef}
                  viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
                  className="w-full touch-none select-none"
                  style={{ cursor: dragging.current ? 'grabbing' : 'grab' }}
                  onWheel={onWheel}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={endDrag}
                  onMouseLeave={endDrag}
                >
                  <defs>
                    <linearGradient id="oceanG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(220 30% 12%)" />
                      <stop offset="100%" stopColor="hsl(220 30% 8%)" />
                    </linearGradient>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(220 20% 15%)" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#oceanG)" />
                  <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#grid)" />

                  <image
                    href="/japan-map.svg"
                    x="0" y="0" width={VIEW_W} height={VIEW_H}
                    opacity="0.55"
                    style={{ filter: 'invert(0.85) hue-rotate(180deg) brightness(0.7)' }}
                  />

                  {/* Markers: 座標ありの端末は個別ピン / 座標なしは店舗座標に集約 */}
                  {stores.map((s) => {
                    if (!s.latitude || !s.longitude) return null;
                    const storeDevices = devices.filter((d) => d.store_id === s.id);
                    // 端末個別座標を持つもの / 持たないもの に分類
                    const geoDevices = storeDevices.filter(
                      (d) => d.latitude != null && d.longitude != null
                    );
                    const noGeoDevices = storeDevices.filter(
                      (d) => d.latitude == null || d.longitude == null
                    );
                    const { x: sx, y: sy } = project(s.latitude, s.longitude);
                    const noGeoOffline = noGeoDevices.filter((d) => d.status === 'offline').length;
                    const storeColor = noGeoOffline > 0 ? 'hsl(var(--warn))' : 'hsl(var(--ok))';
                    const storeRadius = Math.max(8, Math.min(20, noGeoDevices.length * 2.5)) * inv;
                    const storeHover = hoverId === s.id;
                    return (
                      <g key={s.id}>
                        {/* 座標なし端末を店舗座標にまとめたピン（1台以上のときだけ表示） */}
                        {noGeoDevices.length > 0 && (
                          <g onMouseEnter={() => setHoverId(s.id)} onMouseLeave={() => setHoverId(null)} style={{ cursor: 'pointer' }}>
                            <circle cx={sx} cy={sy} r={storeRadius + 6 * inv} fill={storeColor} opacity="0.15" className={storeHover ? 'animate-pulse-soft' : ''} />
                            <circle cx={sx} cy={sy} r={storeRadius} fill={storeColor} opacity="0.85" />
                            <text x={sx} y={sy + 4 * inv} textAnchor="middle" fontSize={11 * inv} fontWeight="700" fill="white">
                              {noGeoDevices.length}
                            </text>
                            <text x={sx} y={sy + storeRadius + 14 * inv} textAnchor="middle" fontSize={10 * inv} fill="hsl(var(--foreground))" opacity="0.7">
                              {s.name.replace(/店$/, '')}
                            </text>
                          </g>
                        )}
                        {/* 座標を持つ端末は実位置に個別ピン（S147: 測位鮮度で色分け）*/}
                        {geoDevices.map((d) => {
                          const { x, y } = project(d.latitude as number, d.longitude as number);
                          const fresh = locFreshness(d.location_updated_at);
                          // 現在地=緑(オフラインは警告色)、最終位置=グレー
                          const color = !fresh.fresh
                            ? 'hsl(var(--muted-foreground))'
                            : d.status === 'offline' ? 'hsl(var(--warn))' : 'hsl(var(--ok))';
                          const r = 7 * inv;
                          const dHover = hoverId === d.id;
                          return (
                            <g key={d.id} onMouseEnter={() => setHoverId(d.id)} onMouseLeave={() => setHoverId(null)} style={{ cursor: 'pointer' }}>
                              <circle cx={x} cy={y} r={r + 5 * inv} fill={color} opacity={fresh.fresh ? 0.18 : 0.1} className={dHover && fresh.fresh ? 'animate-pulse-soft' : ''} />
                              <circle cx={x} cy={y} r={r} fill={color} opacity={fresh.fresh ? 0.9 : 0.6} stroke="white" strokeWidth={1 * inv} strokeDasharray={fresh.fresh ? undefined : `${2 * inv} ${1.5 * inv}`} />
                              <text x={x} y={y + r + 12 * inv} textAnchor="middle" fontSize={9 * inv} fill="hsl(var(--foreground))" opacity="0.85">
                                {d.name}
                              </text>
                              {dHover && (
                                <text x={x} y={y + r + 22 * inv} textAnchor="middle" fontSize={8 * inv} fill="hsl(var(--foreground))" opacity="0.6">
                                  {fresh.label}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}
                </svg>

                {/* Legend（SVG外に固定。ズームの影響を受けない） */}
                <div className="absolute bottom-2 left-2 text-[11px] text-muted-foreground bg-card/80 rounded px-2 py-1.5 space-y-0.5 pointer-events-none">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'hsl(var(--ok))' }} />全端末オンライン
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'hsl(var(--warn))' }} />オフラインあり
                  </div>
                  <div className="text-[10px] opacity-70">サイズは端末数を表す ・ ホイールで拡大 / ドラッグで移動</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">店舗一覧</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {stores.map((s) => {
                  const sdev = devices.filter((d) => d.store_id === s.id);
                  const online = sdev.filter((d) => d.status === 'online').length;
                  const offline = sdev.filter((d) => d.status === 'offline').length;
                  return (
                    <li
                      key={s.id}
                      onMouseEnter={() => setHoverId(s.id)}
                      onMouseLeave={() => setHoverId(null)}
                      className={`p-3 transition-colors ${hoverId === s.id ? 'bg-accent' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => focusStore(s)}
                            className="text-sm font-medium text-left hover:text-primary hover:underline"
                          >{s.name}</button>
                          <div className="text-[11px] text-muted-foreground">{s.prefecture}</div>
                          <div className="flex gap-2 mt-1.5">
                            <Badge variant="ok" className="text-[10px]">オン {online}</Badge>
                            {offline > 0 && <Badge variant="destructive" className="text-[10px]">オフ {offline}</Badge>}
                          </div>
                        </div>
                        <Link href={`/devices?store_id=${s.id}`} className="text-[11px] text-primary hover:underline shrink-0">
                          →
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
      {/* S147: 測位完了ポップアップ */}
      <Dialog open={locateDone} onOpenChange={setLocateDone}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>位置情報を更新しました</DialogTitle>
            <DialogDescription>
              すべてのマシンの最新の位置情報が反映されました。
              {locateDoneCount > 0 && `（${locateDoneCount}台に測位指示を送信）`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setLocateDone(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
