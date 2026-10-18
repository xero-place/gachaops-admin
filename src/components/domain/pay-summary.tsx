'use client';

// S262r: マシンごとの「料金・支払い」の短い表示。
// GET /devices/pay-summary（新しい読み取り専用 API）を1回だけ呼ぶ。失敗・未配備(404)なら null を返し、表示を出さない。
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface PaySummary {
  device_id: string;
  price_per_draw: number | null;
  accept_mode: 'cash' | 'token' | 'none';
  qr_enabled: boolean;
  free_mode: boolean;
}

/** device_id → PaySummary。読めなかったときは null（列ごと隠す）。 */
export function usePaySummary(): Record<string, PaySummary> | null {
  const [map, setMap] = useState<Record<string, PaySummary> | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .get<{ items?: PaySummary[] } | PaySummary[]>('/devices/pay-summary')
      .then((r) => {
        if (!alive) return;
        const list = Array.isArray(r) ? r : (r?.items ?? []);
        const m: Record<string, PaySummary> = {};
        for (const x of list) m[x.device_id] = x;
        setMap(m);
      })
      .catch(() => { if (alive) setMap(null); });
    return () => { alive = false; };
  }, []);
  return map;
}

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

function Word({ tone, children }: { tone: 'cash' | 'qr' | 'token' | 'none' | 'warn'; children: React.ReactNode }) {
  const cls = {
    cash: 'text-[#15803D]',
    qr: 'text-[#1D4ED8]',
    token: 'text-[#7E22CE]',
    none: 'text-[#4B5563]',
    warn: 'text-[#B45309]',
  }[tone];
  return <span className={`font-bold ${cls}`}>{children}</span>;
}

/** 例：「1回 400円　QR・現金なし」「1回 100円　現金・QR」「メダル」「料金未設定」 */
export function PaySummaryText({ s, className }: { s: PaySummary | undefined; className?: string }) {
  if (!s) return <span className={`text-muted-foreground ${className ?? ''}`}>—</span>;
  if (s.accept_mode === 'token') {
    return (
      <span className={`whitespace-nowrap ${className ?? ''}`}>
        <Word tone="token">メダル</Word>
        {s.qr_enabled && (
          <>
            ・<Word tone="qr">QR</Word>{' '}
            {s.price_per_draw != null ? <b className="text-foreground">{yen(s.price_per_draw)}</b> : <Word tone="warn">料金未設定</Word>}
          </>
        )}
      </span>
    );
  }
  const words: React.ReactNode[] = [];
  if (s.accept_mode === 'cash') {
    words.push(<Word key="c" tone="cash">現金</Word>);
    if (s.qr_enabled) words.push(<Word key="q" tone="qr">QR</Word>);
  } else {
    if (s.qr_enabled) words.push(<Word key="q" tone="qr">QR</Word>);
    words.push(<Word key="n" tone="none">現金なし</Word>);
  }
  return (
    <span className={`whitespace-nowrap ${className ?? ''}`}>
      {s.price_per_draw != null ? (
        <b className="text-foreground">1回 {yen(s.price_per_draw)}</b>
      ) : (
        <Word tone="warn">料金未設定</Word>
      )}
      <span className="ml-2">
        {words.map((w, i) => (
          <span key={i}>{i > 0 && '・'}{w}</span>
        ))}
      </span>
    </span>
  );
}
