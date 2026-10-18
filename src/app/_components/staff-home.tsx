'use client';

// S262: 弊社スタッフ（lv1_super）のホーム。「今日は何をしますか？」＋「いま確認が必要なこと」。
import { useEffect, useState } from 'react';
import { signupAdmin, type HomeSummary } from '@/lib/signup-admin';
import { ActionCard, ICONS, Panel, StatTile } from './home-parts';
import { ManualButton } from '@/components/domain/manual-button';

export function StaffHome() {
  const [summary, setSummary] = useState<HomeSummary | null>(null);

  useEffect(() => {
    let alive = true;
    signupAdmin
      .homeSummary()
      .then((s) => { if (alive) setSummary(s); })
      .catch(() => { if (alive) setSummary(null); }); // 取れないときは「—」を表示
    return () => { alive = false; };
  }, []);

  const n = (v: number | undefined) => (typeof v === 'number' ? v : null);

  return (
    <div className="flex w-full max-w-[1200px] flex-col gap-7">
      <section className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-[22px] font-bold leading-snug sm:text-[26px]">今日は何をしますか？</h2>
          <p className="text-[15px] text-muted-foreground">やりたいことを選ぶと、手順に沿って最後まで案内します。</p>
        </div>
        <ManualButton />
      </section>

      <section aria-label="よく使う作業" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">
        <ActionCard
          primary
          href="/customers/invite"
          icon={ICONS.addUser}
          title="新しいお客様の管理画面を発行する"
          desc="登録リンクを作ってお客様に送るだけ。メールアドレスとパスワードはお客様が決め、弊社が承認すると使えるようになります。"
          cta="はじめる →"
        />
        <ActionCard
          href="/customers/assign-machines"
          icon={ICONS.addMachine}
          title="お客様にマシンを追加する"
          desc="お客様（登録待ちのお客様も含む）を選んで、在庫のマシンを割り当てます。"
          cta="はじめる →"
        />
        <ActionCard
          href="/machines/move"
          icon={ICONS.move}
          title="マシンを別のお客様へ移す"
          desc="売上の記録は残したまま、マシンの持ち主を変えます。"
          cta="はじめる →"
        />
        <ActionCard
          href="/customers"
          icon={ICONS.person}
          title="お客様の画面を代わりに操作する"
          desc="お客様を選ぶと、そのお客様の管理画面をそのまま操作できます。"
          cta="はじめる →"
        />
        <ActionCard
          href="/machines/qr"
          icon={ICONS.card}
          title="キャッシュレス決済をON / OFFする"
          desc="マシンごとに、QRで払えるようにするかを切り替えます。"
          cta="はじめる →"
        />
        <ActionCard
          href="/sales-events"
          icon={ICONS.chart}
          title="売上を確認する"
          desc="お客様ごと・マシンごと・日別の売上と明細を見ます。"
          cta="はじめる →"
        />
      </section>

      <Panel title="いま確認が必要なこと">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3">
          <StatTile label="つながっていないマシン" value={n(summary?.offline_devices)} unit="台" href="/devices?status=offline" />
          <StatTile label="売り切れのマシン" value={n(summary?.sold_out_devices)} unit="台" href="/devices?soldout=1" />
          <StatTile label="排出を確認してほしい注文" value={n(summary?.unconfirmed_dispense_7d)} unit="件" href="/sales-events" />
          <StatTile label="承認待ちのお客様" value={n(summary?.pending_signups)} unit="件" href="/customers/approvals" />
        </div>
      </Panel>
    </div>
  );
}
