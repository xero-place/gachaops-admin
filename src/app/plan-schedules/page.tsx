'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';  // S145
import { Loader2, Plus, Trash2, CalendarClock } from 'lucide-react';

// 日時指定型スロット（S125）。start_at/end_at は ISO8601(+09:00)。
type PlanSlot = {
  start_at: string;
  end_at: string;
  program_id: string;
  program_name: string;
  revert_program_id?: string;   // 終了後に戻す番組（任意）
  revert_program_name?: string;
};

type PlanSchedule = {
  id: string;
  customer_id?: string;
  name: string;
  target_device_group_id: string | null;
  slots: PlanSlot[];
  active: boolean;
  created_at?: string;
};

type GroupLite = { id: string; name: string };
type ProgramLite = { id: string; name: string };

// 15分刻みの時刻リスト（00:00〜23:45・96個）
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

// 今日と1ヶ月先の YYYY-MM-DD（日付ピッカーの min/max）
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const TODAY = new Date();
const ONE_MONTH = new Date(TODAY.getTime() + 31 * 24 * 60 * 60 * 1000);

// 日付 + 時刻 → ISO8601(+09:00)。plan_scheduler は +09:00 必須（naive無効）。
function toIso(date: string, time: string): string {
  return `${date}T${time}:00+09:00`;
}
// 表示用フォーマット（ISO → "M/D HH:MM"）
function fmtSlot(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

export default function PlanSchedulesPage() {
  const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';  // S145
  const [planSchedules, setPlanSchedules] = useState<PlanSchedule[]>([]);
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [programs, setPrograms] = useState<ProgramLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 編集中のフォーム状態
  const [draftName, setDraftName] = useState('');
  const [draftGroup, setDraftGroup] = useState<string>('');
  const [draftActive, setDraftActive] = useState(true);
  const [draftSlots, setDraftSlots] = useState<PlanSlot[]>([]);
  const [isNew, setIsNew] = useState(false);

  // slot 追加フォーム
  const [addDate, setAddDate] = useState(ymd(TODAY));
  const [addFrom, setAddFrom] = useState('09:00');
  const [addTo, setAddTo] = useState('18:00');
  const [addProgram, setAddProgram] = useState('');
  const [addRevert, setAddRevert] = useState('');

  const reload = useCallback(async () => {
    try {
      const [sres, gres, pres] = await Promise.all([
        api.get<{ items?: PlanSchedule[] } | PlanSchedule[]>('/plan-schedules?limit=100'),
        api.get<{ items?: GroupLite[] } | GroupLite[]>('/device-groups?limit=200'),
        api.get<{ items?: ProgramLite[] } | ProgramLite[]>('/programs?limit=200'),
      ]);
      const sArr = Array.isArray(sres) ? sres : (sres.items ?? []);
      const gArr = Array.isArray(gres) ? gres : (gres.items ?? []);
      const pArr = Array.isArray(pres) ? pres : (pres.items ?? []);
      setPlanSchedules(sArr);
      setGroups(gArr);
      setPrograms(pArr);
      if (sArr.length > 0 && !selectedId) setSelectedId(sArr[0].id);
    } catch (e) {
      console.error('[plan-schedules] fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const schedule = useMemo(
    () => planSchedules.find((p) => p.id === selectedId),
    [planSchedules, selectedId],
  );

  // 選択スケジュールが変わったらフォームに反映（新規モードでないとき）
  useEffect(() => {
    if (isNew) return;
    if (schedule) {
      setDraftName(schedule.name);
      setDraftGroup(schedule.target_device_group_id ?? '');
      setDraftActive(schedule.active);
      // start_at を持つ日時型 slot だけ表示（旧 weekday 形は除外）
      setDraftSlots((schedule.slots ?? []).filter((s) => !!s.start_at));
    }
  }, [schedule, isNew]);

  const startNew = () => {
    setIsNew(true);
    setSelectedId('');
    setDraftName('');
    setDraftGroup('');
    setDraftActive(true);
    setDraftSlots([]);
    setMsg(null);
  };

  const addSlot = () => {
    if (!addProgram) { setMsg('番組を選んでください。'); return; }
    if (addFrom >= addTo) { setMsg('終了時刻は開始時刻より後にしてください。'); return; }
    const prog = programs.find((p) => p.id === addProgram);
    const rev = programs.find((p) => p.id === addRevert);
    const slot: PlanSlot = {
      start_at: toIso(addDate, addFrom),
      end_at: toIso(addDate, addTo),
      program_id: addProgram,
      program_name: prog?.name ?? '',
      ...(addRevert ? { revert_program_id: addRevert, revert_program_name: rev?.name ?? '' } : {}),
    };
    setDraftSlots((prev) => [...prev, slot].sort((a, b) => a.start_at.localeCompare(b.start_at)));
    setMsg(null);
  };

  const removeSlot = (idx: number) => {
    setDraftSlots((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!draftName.trim()) { setMsg('名前を入力してください。'); return; }
    setSaving(true);
    setMsg(null);
    try {
      const body = {
        name: draftName.trim(),
        target_device_group_id: draftGroup || null,
        slots: draftSlots,
        active: draftActive,
      };
      if (isNew) {
        const created = await api.post<PlanSchedule>('/plan-schedules', body);
        setIsNew(false);
        await reload();
        setSelectedId(created.id);
        setMsg('新規スケジュールを作成しました。');
      } else if (schedule) {
        await api.patch<PlanSchedule>(`/plan-schedules/${schedule.id}`, body);
        await reload();
        setMsg('スケジュールを保存しました。');
      }
    } catch (e) {
      const m = e instanceof ApiError ? (e.problem.detail || e.problem.title) : (e as Error).message;
      setMsg(`保存に失敗しました: ${m}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!schedule) return;
    if (!confirm(`「${schedule.name}」を削除しますか？`)) return;
    setSaving(true);
    try {
      await api.delete(`/plan-schedules/${schedule.id}`);
      setSelectedId('');
      await reload();
      setMsg('削除しました。');
    } catch (e) {
      const m = e instanceof ApiError ? (e.problem.detail || e.problem.title) : (e as Error).message;
      setMsg(`削除に失敗しました: ${m}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="計画配信" breadcrumb={['ホーム', '計画配信']}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const editing = isNew || !!schedule;

  return (
    <AppShell title="計画配信" breadcrumb={['ホーム', '計画配信']}>
      <div className="flex items-center gap-2 mb-4">
        <Select value={selectedId} onValueChange={(v) => { setIsNew(false); setSelectedId(v); }}>
          <SelectTrigger className="w-[280px] h-9 text-xs">
            <SelectValue placeholder="スケジュールを選択" />
          </SelectTrigger>
          <SelectContent>
            {planSchedules.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} {p.active ? '(有効)' : '(無効)'}
                {isSuperAdmin && p.customer_id ? ` [${p.customer_id}]` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isNew && schedule?.active && <Badge variant="ok">有効</Badge>}
        <div className="ml-auto">
          <Button size="sm" className="gap-1.5" onClick={startNew}>
            <Plus className="h-3.5 w-3.5" />新規
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        指定した日時になると、対象グループの端末が自動でその番組に切り替わります。15分刻みで1ヶ月先まで設定できます。
      </p>

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{isNew ? '新規スケジュール' : schedule?.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 基本情報 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">名前</Label>
                <Input value={draftName} onChange={(e) => setDraftName(e.target.value)}
                  placeholder="例: 夏キャンペーン" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">対象グループ</Label>
                <Select value={draftGroup || 'none'} onValueChange={(v) => setDraftGroup(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="グループを選ぶ" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未選択</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={draftActive} onCheckedChange={setDraftActive} />
              <Label className="text-sm">この計画配信を有効にする</Label>
            </div>

            {/* slot 一覧 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">配信スロット（{draftSlots.length}件）</Label>
              {draftSlots.length === 0 ? (
                <p className="text-xs text-muted-foreground">まだスロットがありません。下で追加してください。</p>
              ) : (
                <div className="space-y-1">
                  {draftSlots.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">
                      <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="tabular-nums">{fmtSlot(s.start_at)} 〜 {fmtSlot(s.end_at)}</span>
                      <span className="text-muted-foreground">{s.program_name || s.program_id}</span>
                      {s.revert_program_id && (
                        <span className="text-[10px] text-muted-foreground">→ 終了後 {s.revert_program_name || s.revert_program_id} に戻す</span>
                      )}
                      <button className="ml-auto text-muted-foreground hover:text-destructive"
                        onClick={() => removeSlot(i)} aria-label="削除">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* slot 追加フォーム */}
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3 space-y-3">
              <Label className="text-xs font-medium">スロットを追加</Label>
              <div className="grid gap-3 sm:grid-cols-5">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">日付</Label>
                  <Input type="date" value={addDate} min={ymd(TODAY)} max={ymd(ONE_MONTH)}
                    onChange={(e) => setAddDate(e.target.value)}
                    onClick={(e) => {
                      const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                      if (typeof el.showPicker === 'function') {
                        try { el.showPicker(); } catch { /* showPicker 非対応時は標準動作 */ }
                      }
                    }} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">開始</Label>
                  <Select value={addFrom} onValueChange={setAddFrom}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">終了</Label>
                  <Select value={addTo} onValueChange={setAddTo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">番組</Label>
                  <Select value={addProgram || 'none'} onValueChange={(v) => setAddProgram(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="番組" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">選択</SelectItem>
                      {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">終了後に戻す番組（任意）</Label>
                  <Select value={addRevert || 'none'} onValueChange={(v) => setAddRevert(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="戻さない" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">戻さない（最後の番組のまま）</SelectItem>
                      {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={addSlot}>
                <Plus className="h-3.5 w-3.5" />このスロットを追加
              </Button>
            </div>

            {/* 保存・削除 */}
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={saving} onClick={save}>
                {saving ? '保存中...' : (isNew ? '作成する' : '保存する')}
              </Button>
              {!isNew && schedule && (
                <Button variant="outline" size="sm" disabled={saving} onClick={remove}
                  className="text-destructive">
                  削除
                </Button>
              )}
              {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {!editing && (
        <p className="text-sm text-muted-foreground">スケジュールを選択するか、「新規」で作成してください。</p>
      )}
    </AppShell>
  );
}
