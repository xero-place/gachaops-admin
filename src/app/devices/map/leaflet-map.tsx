'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Store, Device } from '@/types/domain';

// S147: 測位鮮度を判定（30分以内=現在地、それ以前=最終位置）
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

interface Props {
  stores: Store[];
  devices: Device[];
}

export default function LeafletMap({ stores, devices }: Props) {
  // 座標を持つ端末
  const geoDevices = useMemo(
    () => devices.filter((d) => d.latitude != null && d.longitude != null),
    [devices],
  );
  // 座標を持つ店舗（座標なし端末の集約先）
  const geoStores = useMemo(
    () => stores.filter((s) => s.latitude != null && s.longitude != null),
    [stores],
  );

  // 地図の中心：座標を持つ端末があればその平均、なければ日本中心
  const center = useMemo<[number, number]>(() => {
    const pts = geoDevices.length > 0 ? geoDevices : geoStores;
    if (pts.length === 0) return [36.5, 138.0];
    const lat = pts.reduce((a, p) => a + (p.latitude as number), 0) / pts.length;
    const lng = pts.reduce((a, p) => a + (p.longitude as number), 0) / pts.length;
    return [lat, lng];
  }, [geoDevices, geoStores]);

  return (
    <MapContainer
      center={center}
      zoom={geoDevices.length > 0 ? 11 : 6}
      style={{ height: '100%', width: '100%', background: 'hsl(220 30% 10%)' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        maxZoom={20}
      />

      {/* 座標なし端末を店舗座標に集約表示 */}
      {geoStores.map((s) => {
        const storeDevices = devices.filter((d) => d.store_id === s.id);
        const noGeo = storeDevices.filter((d) => d.latitude == null || d.longitude == null);
        if (noGeo.length === 0) return null;
        const offline = noGeo.filter((d) => d.status === 'offline').length;
        const color = offline > 0 ? '#f59e0b' : '#10b981';
        return (
          <CircleMarker
            key={`store-${s.id}`}
            center={[s.latitude as number, s.longitude as number]}
            radius={8 + Math.min(noGeo.length * 2, 14)}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.6, weight: 2 }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <div style={{ fontSize: 12 }}>
                <strong>{s.name}</strong><br />
                端末 {noGeo.length}台（位置未取得）
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* 座標を持つ端末を実位置に表示 */}
      {geoDevices.map((d) => {
        const fresh = locFreshness(d.location_updated_at);
        const color = !fresh.fresh ? '#9ca3af' : d.status === 'offline' ? '#f59e0b' : '#10b981';
        return (
          <CircleMarker
            key={d.id}
            center={[d.latitude as number, d.longitude as number]}
            radius={9}
            pathOptions={{
              color: '#fff',
              fillColor: color,
              fillOpacity: fresh.fresh ? 0.9 : 0.55,
              weight: 2,
              dashArray: fresh.fresh ? undefined : '3 3',
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} permanent={false}>
              <div style={{ fontSize: 12 }}>
                <strong>{d.name}</strong><br />
                {fresh.label}
                {d.status === 'offline' && <><br />オフライン</>}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
