'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { planSchedules } from '@/mocks/fixtures';
import { WEEKDAYS_JA } from '@/lib/format';
import { Plus, CalendarRange } from 'lucide-react';

const HOURS = Array.from({ length: 14 }, (_, i) => i + 9); // 9:00 - 22:59

export default function PlanSchedulesPage() {
  const [selectedId, setSelectedId] = useState(planSchedules[0]?.id ?? '');
  const schedule = planSchedules.find((p) => p.id === selectedId);

  return (
    <AppShell title="時間割" breadcrumb={['ホーム', '時間割']}>
      <div className="flex items-center gap-2 mb-4">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-[280px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {planSchedules.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} {p.active ? '(有効)' : '(無効)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {schedule?.active && <Badge variant="ok">有効</Badge>}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" />複製
          </Button>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />新規
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{schedule?.name ?? '時間割'}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {schedule?.slots.length ?? 0} スロット
          </p>
        </CardHeader>
        <CardContent>
          {schedule && <WeekGrid slots={schedule.slots} />}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function WeekGrid({ slots }: { slots: typeof planSchedules[number]['slots'] }) {
  // Map slots into a grid keyed by `${weekday}-${hour}`
  const slotMap = new Map<string, typeof slots[number]>();
  for (const s of slots) {
    const startH = parseInt(s.time_from.split(':')[0]);
    const endH = parseInt(s.time_to.split(':')[0]);
    for (let h = startH; h < endH; h++) {
      slotMap.set(`${s.weekday}-${h}`, s);
    }
  }

  // Color per program
  const programs = Array.from(new Set(slots.map((s) => s.program_id)));
  const colorFor = (pid: string) => {
    const idx = programs.indexOf(pid);
    const palettes = [
      'bg-blue-500/25 text-blue-300',
      'bg-purple-500/25 text-purple-300',
      'bg-emerald-500/25 text-emerald-300',
      'bg-amber-500/25 text-amber-300',
      'bg-pink-500/25 text-pink-300',
      'bg-cyan-500/25 text-cyan-300',
    ];
    return palettes[idx % palettes.length];
  };

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-[60px_repeat(7,minmax(80px,1fr))] gap-px bg-border min-w-[700px]">
        {/* Header row */}
        <div className="bg-card p-2 text-[10px] text-muted-foreground uppercase tracking-wider text-center">時間</div>
        {WEEKDAYS_JA.map((d, i) => (
          <div key={i} className={`bg-card p-2 text-center text-xs font-medium ${i === 0 ? 'text-destructive' : i === 6 ? 'text-blue-400' : ''}`}>
            {d}
          </div>
        ))}
        {/* Hour rows */}
        {HOURS.map((h) => (
          <>
            <div key={`h-${h}`} className="bg-card p-2 text-[10px] tabular-nums text-muted-foreground text-right pr-3 font-mono">
              {String(h).padStart(2, '0')}:00
            </div>
            {[0, 1, 2, 3, 4, 5, 6].map((wd) => {
              const slot = slotMap.get(`${wd}-${h}`);
              return (
                <div
                  key={`${wd}-${h}`}
                  className={`bg-card p-1.5 min-h-[36px] text-[10px] ${slot ? colorFor(slot.program_id) : ''}`}
                >
                  {slot && <div className="truncate font-medium">{slot.program_name}</div>}
                </div>
              );
            })}
          </>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {programs.map((pid) => {
          const slot = slots.find((s) => s.program_id === pid);
          return (
            <div key={pid} className="flex items-center gap-1.5 text-xs">
              <span className={`inline-block h-3 w-3 rounded ${colorFor(pid).split(' ')[0]}`} />
              <span>{slot?.program_name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
