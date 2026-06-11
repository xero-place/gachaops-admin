// 計画配信の予約（次回切替予定）を端末ごとに解決するヘルパー。
// 端末の group_ids と計画配信スケジュールの target_device_group_id を突き合わせ、
// 現在以降で最も近い未来 slot を返す。

export type PlanSlotLite = {
  start_at?: string;
  end_at?: string;
  program_id?: string;
  program_name?: string;
};

export type PlanScheduleLite = {
  id: string;
  name: string;
  target_device_group_id: string | null;
  slots: PlanSlotLite[];
  active: boolean;
};

export type Reservation = {
  start_at: string;
  program_name: string;
};

// "M月D日 H:MM" 形式（予約表示用）
export function fmtReservation(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

// 指定端末の「次回の計画配信予約」を返す（無ければ null）。
export function getUpcomingReservation(
  groupIds: string[] | undefined,
  schedules: PlanScheduleLite[],
  now: Date = new Date(),
): Reservation | null {
  if (!groupIds || groupIds.length === 0) return null;
  const gset = new Set(groupIds);
  let best: Reservation | null = null;
  let bestStart: Date | null = null;

  for (const sch of schedules) {
    if (!sch.active) continue;
    if (!sch.target_device_group_id || !gset.has(sch.target_device_group_id)) continue;
    for (const slot of sch.slots ?? []) {
      if (!slot.start_at) continue; // 日時型のみ
      const start = new Date(slot.start_at);
      if (isNaN(start.getTime())) continue;
      if (start <= now) continue; // 未来のみ
      if (bestStart === null || start < bestStart) {
        bestStart = start;
        best = { start_at: slot.start_at, program_name: slot.program_name ?? slot.program_id ?? '' };
      }
    }
  }
  return best;
}

// グループ群に有効な計画配信予約（未来 slot）が1件でもあるか。
export function hasUpcomingReservation(
  groupIds: string[] | undefined,
  schedules: PlanScheduleLite[],
  now: Date = new Date(),
): boolean {
  return getUpcomingReservation(groupIds, schedules, now) !== null;
}
