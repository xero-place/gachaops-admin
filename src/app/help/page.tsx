'use client';

// S262: 困ったとき。WEBマニュアルを入口に、よく見る項目・よくある困りごと・お問い合わせ先をまとめる。
import Link from 'next/link';
import { BookOpen, ExternalLink, Mail, Phone } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import {
  EXTERNAL,
  MANUAL_SECTIONS,
  MANUAL_URL,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_PHONE_HOURS,
} from '@/lib/manual-links';

const ITEMS: { q: string; a: string; href: string; link: string }[] = [
  {
    q: 'マシンが「つながっていない」と表示される',
    a: 'マシンの電源が入っているか、お店のインターネットにつながっているかを確かめてください。マシンの一覧で、最後につながった時刻を確認できます。',
    href: '/devices',
    link: 'マシンの一覧を開く',
  },
  {
    q: '映像が流れない・切り替わらない',
    a: 'マシンの一覧で、いま流している映像を確かめられます。あわせて、日時を決めて流す設定が入っていないかも確かめてください。',
    href: '/plan-schedules',
    link: '日時を決めて流す設定を見る',
  },
  {
    q: '売上の数字を確かめたい',
    a: '期間・店舗・マシンごとに売上と明細を確認できます。',
    href: '/sales-events',
    link: '売上を開く',
  },
  {
    q: '一緒に使う人を追加したい',
    a: '設定の「メンバー」から、メールアドレスを入れて招待できます（管理者の方のみ）。',
    href: '/settings#members',
    link: 'メンバーの設定を開く',
  },
];

export default function HelpPage() {
  return (
    <AppShell title="困ったとき">
      <div className="flex w-full max-w-[900px] flex-col gap-6">
        <a
          href={MANUAL_URL}
          {...EXTERNAL}
          className="group flex flex-col gap-4 rounded-card border-2 border-primary bg-card p-6 transition-colors hover:bg-primary/5 sm:flex-row sm:items-center sm:justify-between sm:p-7"
        >
          <span className="flex items-start gap-4">
            <BookOpen className="mt-1 h-8 w-8 shrink-0 text-primary" aria-hidden="true" />
            <span className="flex flex-col gap-1.5">
              <span className="text-[22px] font-bold leading-snug">WEBマニュアルを見る</span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                マシン本体の設定（料金・在庫など）から管理画面の使い方まで、写真と動画で確認できます。新しいタブで開きます。
              </span>
            </span>
          </span>
          <span className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-[10px] bg-primary-grad px-6 text-[15px] font-bold text-primary-foreground shadow-btn">
            マニュアルを開く
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </span>
        </a>

        <section aria-labelledby="help-sections" className="flex flex-col gap-3 rounded-card border bg-card p-[22px]">
          <h2 id="help-sections" className="text-[17px] font-bold">よく見る項目</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {MANUAL_SECTIONS.map((m) => (
              <li key={m.href}>
                <a
                  href={m.href}
                  {...EXTERNAL}
                  className="flex min-h-[48px] items-center justify-between gap-3 rounded-[10px] bg-secondary px-4 py-3 text-[15px] font-bold transition-colors hover:bg-accent"
                >
                  {m.label}
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="（新しいタブで開きます）" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="help-faq" className="flex flex-col gap-3">
          <h2 id="help-faq" className="text-[17px] font-bold">よくある困りごと</h2>
          <ul className="flex flex-col gap-3">
            {ITEMS.map((it) => (
              <li key={it.q} className="flex flex-col gap-2 rounded-card border bg-card p-[22px]">
                <h3 className="text-base font-bold">{it.q}</h3>
                <p className="text-sm leading-[1.8] text-muted-foreground">{it.a}</p>
                <Link href={it.href} className="self-start text-sm font-bold text-foreground hover:text-primary">
                  {it.link} →
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="help-contact" className="flex flex-col gap-3 rounded-card border bg-card p-[22px]">
          <h2 id="help-contact" className="text-[17px] font-bold">解決しないときは</h2>
          <p className="text-sm leading-[1.8] text-muted-foreground">
            お使いの会社名と、どのマシンで何が起きているかをお伝えください。
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <a
              href={`tel:${SUPPORT_PHONE.replace(/-/g, '')}`}
              className="flex min-h-[56px] items-center gap-3 rounded-[10px] bg-secondary px-4 py-3 hover:bg-accent"
            >
              <Phone className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex flex-col">
                <span className="text-[17px] font-bold tabular-nums">電話 {SUPPORT_PHONE}</span>
                <span className="text-[13px] text-muted-foreground">{SUPPORT_PHONE_HOURS}</span>
              </span>
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="flex min-h-[56px] items-center gap-3 rounded-[10px] bg-secondary px-4 py-3 hover:bg-accent"
            >
              <Mail className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span className="break-all text-[17px] font-bold">メール {SUPPORT_EMAIL}</span>
                <span className="text-[13px] text-muted-foreground">内容を書いてお送りください</span>
              </span>
            </a>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
