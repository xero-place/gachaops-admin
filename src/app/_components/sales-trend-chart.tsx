'use client';

import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { SalesStat } from '@/types/domain';
import { format, parseISO } from 'date-fns';
import { usePageT } from '@/i18n/usePageT';
import { salesTrendDict } from '@/i18n/ns/salesTrend';

type Metric = 'total' | 'qr' | 'cash' | 'medal';

const METRICS: { value: Metric; dataKey: string; unit: 'yen' | 'mai' }[] = [
  { value: 'total', dataKey: 'revenue_yen', unit: 'yen' },
  { value: 'qr', dataKey: 'qr_revenue_yen', unit: 'yen' },
  { value: 'cash', dataKey: 'cash_revenue_yen', unit: 'yen' },
  { value: 'medal', dataKey: 'medal_count', unit: 'mai' },
];

export function SalesTrendChart({ data }: { data: SalesStat[] }) {
  const t = usePageT(salesTrendDict);
  const [metric, setMetric] = useState<Metric>('total');
  const conf = METRICS.find((m) => m.value === metric) ?? METRICS[0];
  const isYen = conf.unit === 'yen';
  const metricLabel = (v: Metric): string =>
    v === 'total' ? t.metricTotal : v === 'qr' ? t.metricQr : v === 'cash' ? t.metricCash : t.metricMedal;

  const formatted = data.map((d) => ({
    ...d,
    label: format(parseISO(d.date), 'M/d'),
  }));

  return (
    <div className="w-full">
      <div className="mb-3 flex justify-end">
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as Metric)}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
        >
          {METRICS.map((m) => (
            <option key={m.value} value={m.value}>
              {metricLabel(m.value)}
            </option>
          ))}
        </select>
      </div>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formatted} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tickFormatter={(v: number) =>
                isYen ? '¥' + (v / 1000).toFixed(0) + 'k' : String(v)
              }
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                borderColor: 'hsl(var(--border))',
                borderRadius: '6px',
                fontSize: '12px',
              }}
              formatter={(v: number) => [
                isYen ? `¥${v.toLocaleString()}` : t.medalUnit(v.toLocaleString()),
                metricLabel(conf.value),
              ]}
              labelFormatter={(l) => t.dateLabel(String(l))}
            />
            <Area
              type="monotone"
              dataKey={conf.dataKey}
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#rev)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
