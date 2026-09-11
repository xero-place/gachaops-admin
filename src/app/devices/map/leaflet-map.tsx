'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Store, Device } from '@/types/domain';
import { usePageT } from '@/i18n/usePageT';
import { devicesMapDict } from '@/i18n/ns/devicesMap';

type Freshness =
  | { fresh: boolean; kind: 'none' | 'current' }
  | { fresh: boolean; kind: 'min' | 'hour' | 'day'; value: number };

// S147: 測位鮮度を判定（30分以内=現在地、それ以前=最終位置）
function locFreshness(updatedAt: string | null): Freshness {
  if (!updatedAt) return { fresh: false, kind: 'none' };
  const t = new Date(updatedAt).getTime();
  if (isNaN(t)) return { fresh: false, kind: 'none' };
  const diffMin = (Date.now() - t) / 60000;
  if (diffMin < 30) return { fresh: true, kind: 'current' };
  if (diffMin < 60) return { fresh: false, kind: 'min', value: Math.round(diffMin) };
  const diffH = diffMin / 60;
  if (diffH < 24) return { fresh: false, kind: 'hour', value: Math.round(diffH) };
  return { fresh: false, kind: 'day', value: Math.round(diffH / 24) };
}

interface Props {
  stores: Store[];
  devices: Device[];
}

export default function LeafletMap({ stores, devices }: Props) {
  const t = usePageT(devicesMapDict);
  const freshLabel = (f: Freshness): string => {
    switch (f.kind) {
      case 'none': return t.pinNoLoc;
      case 'current': return t.pinCurrent;
      case 'min': return t.pinLastMin(f.value);
      case 'hour': return t.pinLastHour(f.value);
      case 'day': return t.pinLastDay(f.value);
    }
  };
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
      style={{ height: '100%', width: '100%', background: '#f5f5f3' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; OpenStreetMap, &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
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
                {t.pinStoreDevices(noGeo.length)}
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
                {freshLabel(fresh)}
                {d.status === 'offline' && <><br />{t.pinOffline}</>}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
