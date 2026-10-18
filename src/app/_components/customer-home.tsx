'use client';

// S262: お客様のホーム。「はじめての方へ」3ステップ＋「やりたいこと」＋マシンの様子。
// 各カードは、その作業ができる既存の画面へつなぐ。
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ActionCard, ICONS, Panel, StatTile } from './home-parts';
import { ManualButton } from '@/components/domain/manual-button';

interface Overview {
  device_total?: number;
  device_online?: number;
  device_offline?: number;
  revenue_today_yen?: number;
}

const FIRST_STEPS = [
  { href: '/assets', label: '流したい映像を登録する' },
  { href: '/devices', label: 'マシンで映像を流す' },
  { href: '/choose-machine?tab=settings', label: '1回の価格を確認する' },
];

export function CustomerHome() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<Overview>('/dashboard/overview')
      .then((r) => { if (alive) setOv(r); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const online = typeof ov?.device_online === 'number' ? ov.device_online : null;
  const offline =
    typeof ov?.device_offline === 'number'
      ? ov.device_offline
      : typeof ov?.device_total === 'number' && online !== null
        ? Math.max(0, ov.device_total - online)
        : null;
  const revenue = typeof ov?.revenue_today_yen === 'number' ? ov.revenue_today_yen.toLocaleString('ja-JP') : null;

  return (
    <div className="flex w-full max-w-[1200px] flex-col gap-7">
      <section className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-[22px] font-bold leading-snug sm:text-[26px]">ようこそ。やりたいことを選んでください</h2>
          <p className="text-[15px] text-muted-foreground">どの作業も、画面の案内どおりに進めれば完了します。</p>
        </div>
        <ManualButton />
      </section>

      <section aria-label="はじめての方へ" className="flex flex-col gap-4 rounded-card border bg-card p-[22px]">
        <h2 className="text-[17px] font-bold">はじめての方へ　この3つで使い始められます</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3">
          {FIRST_STEPS.map((s, i) => (
            <Link
              key={s.label}
              href={s.href}
              className="flex min-h-[44px] items-center gap-3 rounded-[10px] bg-secondary p-4 text-foreground transition-colors hover:bg-accent"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground font-bold text-background">
                {i + 1}
              </span>
              <span className="text-[15px] font-bold">{s.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="やりたいこと" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
        <ActionCard href="/devices" icon={ICONS.play} title="マシンで映像を流す・止める" desc="流すマシンと映像を選ぶだけ。複数のマシンをそろえて流すこともできます。" />
        <ActionCard href="/assets" icon={ICONS.upload} title="映像を追加する" desc="パソコンの動画ファイルを登録します。" />
        <ActionCard href="/plan-schedules" icon={ICONS.calendar} title="日時を決めて映像を流す" desc="期間や時間帯を決めて、自動で切り替えます。" />
        <ActionCard href="/choose-machine?tab=settings" icon={ICONS.tag} title="1回の価格を変える" desc="マシンごとに、1回いくらで遊べるかを決めます。マシン本体での設定方法も確認できます。" />
        <ActionCard href="/sales-events" icon={ICONS.chart} title="売上を見る" desc="今日・今月の売上と、マシンごとの明細を確認します。" />
        <ActionCard href="/choose-machine?tab=stock" icon={ICONS.refill} title="カプセルを補充した" desc="補充した数を入れて、売り切れ表示を解除します。" />
        <ActionCard href="/devices" icon={ICONS.clock} title="営業時間を決める" desc="営業時間外は画面を消したり、遊べないようにしたりできます。" />
      </section>

      {!failed && (
        <Panel title="マシンの様子">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-3">
            <StatTile label="動いているマシン" value={online} unit="台" href="/devices" />
            <StatTile label="つながっていないマシン" value={offline} unit="台" href="/devices" />
            <StatTile label="今日の売上" value={revenue} unit="円" href="/sales-events" />
          </div>
        </Panel>
      )}
    </div>
  );
}
