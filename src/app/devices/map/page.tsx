'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Store, Device } from '@/types/domain';

/**
 * Equirectangular projection over a Japan-shaped bounding box. We're not using
 * Leaflet/Mapbox to avoid a heavy dependency just for a small dot-map. The SVG
 * is a deliberately abstract silhouette — accurate enough to place 8 markers,
 * not geographically authoritative.
 */
function project(lat: number, lng: number, w = 1000, h = 846) {
  // Japan bounding box matched to simplemaps.com SVG viewBox (1000x846).
  // Calibrated against Tokyo (35.6762, 139.6503) → roughly (560, 480) on SVG.
  const minLng = 122.5;
  const maxLng = 153.5;
  const minLat = 24;
  const maxLat = 46;
  const x = ((lng - minLng) / (maxLng - minLng)) * w;
  const y = ((maxLat - lat) / (maxLat - minLat)) * h;
  return { x, y };
}

export default function DevicesMapPage() {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, d] = await Promise.all([
          api.get<{ items?: Store[] } | Store[]>('/stores?limit=100'),
          api.get<{ items?: Device[] } | Device[]>('/devices?limit=200'),
        ]);
        if (cancelled) return;
        const storesArr = Array.isArray(s) ? s : (s.items ?? []);
        const devicesArr = Array.isArray(d) ? d : (d.items ?? []);
        setStores(storesArr);
        setDevices(devicesArr);
      } catch (e) {
        console.warn('Map data fetch failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <AppShell title="端末マップ" breadcrumb={['ホーム', '端末', 'マップ']}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-4">
              <svg viewBox="0 0 1000 846" className="w-full">
                {/* Stylized Japan silhouette - rough bezier shapes */}
                <defs>
                  <linearGradient id="oceanG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(220 30% 12%)" />
                    <stop offset="100%" stopColor="hsl(220 30% 8%)" />
                  </linearGradient>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(220 20% 15%)" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="1000" height="846" fill="url(#oceanG)" />
                <rect width="1000" height="846" fill="url(#grid)" />

                {/* Accurate Japan map (simplemaps.com - Free for Commercial Use) */}
                <image
                  href="/japan-map.svg"
                  x="0"
                  y="0"
                  width="1000"
                  height="846"
                  opacity="0.55"
                  style={{ filter: 'invert(0.85) hue-rotate(180deg) brightness(0.7)' }}
                />

                {/* Store markers */}
                {stores.map((s) => {
                  if (!s.latitude || !s.longitude) return null;
                  const { x, y } = project(s.latitude, s.longitude);
                  const storeDevices = devices.filter((d) => d.store_id === s.id);
                  const offline = storeDevices.filter((d) => d.status === 'offline').length;
                  const radius = Math.max(8, Math.min(20, s.device_count * 2.5));
                  const color = offline > 0 ? 'hsl(var(--warn))' : 'hsl(var(--ok))';
                  const isHover = hoverId === s.id;
                  return (
                    <g key={s.id} onMouseEnter={() => setHoverId(s.id)} onMouseLeave={() => setHoverId(null)} style={{ cursor: 'pointer' }}>
                      <circle cx={x} cy={y} r={radius + 6} fill={color} opacity="0.15" className={isHover ? 'animate-pulse-soft' : ''} />
                      <circle cx={x} cy={y} r={radius} fill={color} opacity="0.85" />
                      <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="white">
                        {s.device_count}
                      </text>
                      <text x={x} y={y + radius + 14} textAnchor="middle" fontSize="10" fill="hsl(var(--foreground))" opacity="0.7">
                        {s.name.replace(/店$/, '')}
                      </text>
                    </g>
                  );
                })}

                {/* Legend */}
                <g transform="translate(20, 480)" fontSize="11" fill="hsl(var(--muted-foreground))">
                  <circle cx="6" cy="6" r="6" fill="hsl(var(--ok))" />
                  <text x="20" y="10">全端末オンライン</text>
                  <circle cx="6" cy="26" r="6" fill="hsl(var(--warn))" />
                  <text x="20" y="30">オフラインあり</text>
                  <text x="0" y="50" fontSize="10" fill="hsl(var(--muted-foreground))">サイズは端末数を表す</text>
                </g>
              </svg>
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
                          <div className="text-sm font-medium">{s.name}</div>
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
    </AppShell>
  );
}
