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

type Metric = 'total' | 'qr' | 'cash' | 'medal';

const METRICS: { value: Metric; label: string; dataKey: string; unit: 'yen' | 'mai' }[] = [
  { value: 'total', label: '全体（売上合計）', dataKey: 'revenue_yen', unit: 'yen' },
  { value: 'qr', label: 'QR売上', dataKey: 'qr_revenue_yen', unit: 'yen' },
  { value: 'cash', label: '現金売上', dataKey: 'cash_revenue_yen', unit: 'yen' },
  { value: 'medal', label: 'メダル投入数', dataKey: 'medal_count', unit: 'mai' },
];

export function SalesTrendChart({ data }: { data: SalesStat[] }) {
  const [metric, setMetric] = useState<Metric>('total');
  const conf = METRICS.find((m) => m.value === metric) ?? METRICS[0];
  const isYen = conf.unit === 'yen';

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
              {m.label}
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
                isYen ? `¥${v.toLocaleString()}` : `${v.toLocaleString()}枚`,
                conf.label,
              ]}
              labelFormatter={(l) => '日付: ' + l}
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
