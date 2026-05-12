'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { stores, devices } from '@/mocks/fixtures';
import { Building2 } from 'lucide-react';

/**
 * Equirectangular projection over a Japan-shaped bounding box. We're not using
 * Leaflet/Mapbox to avoid a heavy dependency just for a small dot-map. The SVG
 * is a deliberately abstract silhouette — accurate enough to place 8 markers,
 * not geographically authoritative.
 */
function project(lat: number, lng: number, w = 720, h = 540) {
  // Japan bounding box (approximate)
  const minLng = 128.5;
  const maxLng = 142.5;
  const minLat = 31;
  const maxLat = 38.5;
  const x = ((lng - minLng) / (maxLng - minLng)) * w;
  const y = ((maxLat - lat) / (maxLat - minLat)) * h;
  return { x, y };
}

export default function DevicesMapPage() {
  const [hoverId, setHoverId] = useState<string | null>(null);

  return (
    <AppShell title="端末マップ" breadcrumb={['ホーム', '端末', 'マップ']}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-4">
              <svg viewBox="0 0 720 540" className="w-full">
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
                <rect width="720" height="540" fill="url(#oceanG)" />
                <rect width="720" height="540" fill="url(#grid)" />

                {/* Schematic land masses */}
                <g fill="hsl(220 18% 22%)" stroke="hsl(220 18% 28%)" strokeWidth="1">
                  {/* Hokkaido */}
                  <path d="M 510 50 Q 580 40 610 90 Q 620 130 580 145 Q 540 150 500 130 Q 480 100 510 50 Z" />
                  {/* Honshu */}
                  <path d="M 230 280 Q 310 240 380 220 Q 470 200 540 220 L 560 250 Q 540 270 480 290 Q 420 300 360 320 Q 300 340 240 320 Z" />
                  {/* Kanto bulge */}
                  <path d="M 480 270 Q 520 260 540 290 Q 530 320 500 320 Q 470 310 480 270 Z" />
                  {/* Shikoku */}
                  <path d="M 280 360 Q 330 350 350 380 Q 330 400 280 395 Q 260 380 280 360 Z" />
                  {/* Kyushu */}
                  <path d="M 180 380 Q 230 370 240 410 Q 230 450 200 460 Q 160 450 160 410 Q 160 390 180 380 Z" />
                </g>

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
