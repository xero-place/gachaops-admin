'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, MapPin, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Store, Device } from '@/types/domain';
import { tokenStore } from '@/lib/token-store';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';


const LeafletMap = dynamic(() => import('./leaflet-map'), {
  ssr: false,
  loading: () => <div className="h-[600px] flex items-center justify-center text-muted-foreground text-sm">地図を読み込み中…</div>,
});

export default function DevicesMapPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [locating, setLocating] = useState(false);
  const [locateMsg, setLocateMsg] = useState<string | null>(null);
  const [locateDone, setLocateDone] = useState(false);
  const [locateDoneCount, setLocateDoneCount] = useState(0);
  const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';



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
                {/* S147: Leaflet実地図（OpenStreetMap・正確な座標・街区まで拡大可）*/}
                <div className="h-[600px] w-full rounded-md overflow-hidden">
                  <LeafletMap stores={stores} devices={devices} />
                </div>
                {/* 凡例 */}
                <div className="absolute bottom-2 left-2 z-[500] text-[11px] text-muted-foreground bg-card/90 rounded px-2 py-1.5 space-y-0.5 pointer-events-none border border-border">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#10b981' }} />現在地（オンライン）
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#f59e0b' }} />オフライン
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#9ca3af' }} />最終位置（測位が古い）
                  </div>
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
                      className="p-3 transition-colors hover:bg-accent"
                    >
                      <div className="flex items-start gap-2">
                        <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium">{s.name}</span>
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
