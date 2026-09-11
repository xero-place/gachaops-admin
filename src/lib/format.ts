import { formatDistanceToNow, format } from 'date-fns';
import { ja, enUS } from 'date-fns/locale';
import { useLocale } from '@/store/useLocale';

// 現在の表示言語を非リアクティブに取得（lib はフックを使えないため getState で読む）。
function currentLocale(): 'ja' | 'en' {
  try {
    return useLocale.getState().locale === 'en' ? 'en' : 'ja';
  } catch {
    return 'ja';
  }
}

export function fmtYen(amount: number): string {
  return '¥' + amount.toLocaleString('ja-JP');
}

export function fmtDate(s: string | null | undefined, withTime = true): string {
  if (!s) return '-';
  try {
    return format(new Date(s), withTime ? 'yyyy/MM/dd HH:mm' : 'yyyy/MM/dd');
  } catch {
    return s;
  }
}

export function fmtRelative(s: string | null | undefined): string {
  if (!s) return '-';
  try {
    return formatDistanceToNow(new Date(s), { locale: currentLocale() === 'en' ? enUS : ja, addSuffix: true });
  } catch {
    return s;
  }
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

export function fmtDuration(ms: number | null): string {
  if (ms === null) return '-';
  const s = Math.round(ms / 1000);
  if (s < 60) return currentLocale() === 'en' ? `${s}s` : `${s}秒`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}:${String(rs).padStart(2, '0')}`;
}

export const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
