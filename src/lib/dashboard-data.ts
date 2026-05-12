/**
 * Dashboard data hooks. Works against both the in-process mock and the
 * real backend.
 *
 * The mock returns a richer shape than the real backend (includes
 * device_maintenance, store_total, revenue_7d_yen). We normalise to
 * a single TypeScript type and fill in missing fields with zeros when
 * talking to the real backend.
 */
'use client';

import { useEffect, useState } from 'react';
import { api } from './api';

export interface NormalisedOverview {
  device_total: number;
  device_online: number;
  device_offline: number;
  device_maintenance: number;
  store_total: number;
  orders_today: number;
  revenue_today_yen: number;
  revenue_7d_yen: number;
  active_tasks: number;
  low_stock_inventories: number;
}

interface RawOverview {
  device_total?: number;
  device_online?: number;
  device_offline?: number;
  device_maintenance?: number;
  store_total?: number;
  orders_today?: number;
  revenue_today_yen?: number;
  revenue_7d_yen?: number;
  active_tasks?: number;
  // Real backend uses low_stock_count, mock uses low_stock_inventories
  low_stock_count?: number;
  low_stock_inventories?: number;
}

function normalise(raw: RawOverview): NormalisedOverview {
  return {
    device_total: raw.device_total ?? 0,
    device_online: raw.device_online ?? 0,
    device_offline: raw.device_offline ?? 0,
    device_maintenance: raw.device_maintenance ?? 0,
    store_total: raw.store_total ?? 0,
    orders_today: raw.orders_today ?? 0,
    revenue_today_yen: raw.revenue_today_yen ?? 0,
    revenue_7d_yen: raw.revenue_7d_yen ?? 0,
    active_tasks: raw.active_tasks ?? 0,
    low_stock_inventories: raw.low_stock_inventories ?? raw.low_stock_count ?? 0,
  };
}

export interface SalesPoint {
  date: string;
  revenue_yen: number;
  orders: number;
}

export interface DashboardData {
  overview: NormalisedOverview | null;
  salesStats: SalesPoint[];
  loading: boolean;
  error: string | null;
}

const EMPTY_OVERVIEW: NormalisedOverview = {
  device_total: 0,
  device_online: 0,
  device_offline: 0,
  device_maintenance: 0,
  store_total: 0,
  orders_today: 0,
  revenue_today_yen: 0,
  revenue_7d_yen: 0,
  active_tasks: 0,
  low_stock_inventories: 0,
};

export function useDashboardData(): DashboardData {
  const [overview, setOverview] = useState<NormalisedOverview | null>(null);
  const [salesStats, setSalesStats] = useState<SalesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [ovRaw, salesRaw] = await Promise.all([
          api.get<RawOverview>('/dashboard/overview'),
          api.get<SalesPoint[] | { data: SalesPoint[] }>('/stats/sales?days=14'),
        ]);
        if (cancelled) return;
        setOverview(normalise(ovRaw));
        const arr = Array.isArray(salesRaw) ? salesRaw : (salesRaw as { data: SalesPoint[] }).data ?? [];
        setSalesStats(arr);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setOverview(EMPTY_OVERVIEW);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { overview, salesStats, loading, error };
}

interface RawDevice {
  id: string;
  name: string;
  status: string;
  last_heartbeat_at?: string | null;
  store_id?: string;
  store_name?: string;
  current_program_id?: string | null;
  current_program_name?: string | null;
}

interface DeviceListResponse {
  items?: RawDevice[];
  data?: RawDevice[];
  total?: number;
}

export function useOfflineDevicesList(limit = 5) {
  const [items, setItems] = useState<RawDevice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<DeviceListResponse | RawDevice[]>(
          `/devices?status=offline&limit=${limit}`
        );
        if (cancelled) return;
        const arr = Array.isArray(r) ? r : (r.items ?? r.data ?? []);
        setItems(arr.slice(0, limit));
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [limit]);

  return { items, loading };
}
