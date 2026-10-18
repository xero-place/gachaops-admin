'use client';

// S262: ホームの「1回の価格を変える」「カプセルを補充した」から来たときに、どのマシンかを選ぶ画面。
// 選ぶと、そのマシンの詳細画面の該当タブ（価格 / 在庫）が開く。マシンが1台だけなら自動で移る。
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface MachineRow {
  id: string;
  name: string;
  store_name?: string | null;
  serial?: string | null;
}

const PURPOSE: Record<string, { title: string; lead: string }> = {
  settings: { title: '1回の価格を変える', lead: '価格を変えるマシンを選んでください。' },
  stock: { title: 'カプセルを補充した', lead: '補充したマシンを選んでください。' },
};

export default function ChooseMachinePage() {
  const router = useRouter();
  const [tab, setTab] = useState<'settings' | 'stock'>('settings');
  const [rows, setRows] = useState<MachineRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab');
    const t = q === 'stock' ? 'stock' : 'settings';
    setTab(t);
    let alive = true;
    api
      .get<{ items?: MachineRow[] } | MachineRow[]>('/devices?limit=200')
      .then((r) => {
        if (!alive) return;
        const list = Array.isArray(r) ? r : (r.items ?? []);
        if (list.length === 1) {
          router.replace(`/devices/${encodeURIComponent(list[0].id)}?tab=${t}`);
          return;
        }
        setRows(list);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [router]);

  const p = PURPOSE[tab];

  return (
    <AppShell title={p.title} back={{ href: '/', label: 'ホームに戻る' }}>
      <div className="flex w-full max-w-[760px] flex-col gap-5">
        <p className="text-[15px] text-muted-foreground">{p.lead}</p>
        {failed ? (
          <div className="flex flex-col items-start gap-3 rounded-card border bg-card p-5 text-sm">
            マシンの一覧を読み込めませんでした。
            <Button asChild variant="outline">
              <Link href="/devices">マシンの一覧を開く</Link>
            </Button>
          </div>
        ) : rows === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            読み込んでいます…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-card border bg-card p-5 text-sm text-foreground/80">
            まだマシンがありません。マシンが届いたら、ここから設定できます。
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/devices/${encodeURIComponent(m.id)}?tab=${tab}`}
                  className="flex min-h-[60px] items-center justify-between gap-3 rounded-[12px] border bg-card px-5 py-3.5 transition-colors hover:bg-accent"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-base font-bold">{m.name}</span>
                    {(m.store_name || m.serial) && (
                      <span className="text-[13px] text-muted-foreground">
                        {[m.store_name, m.serial ? `番号 ${m.serial}` : null].filter(Boolean).join('・')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-bold">選ぶ →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
