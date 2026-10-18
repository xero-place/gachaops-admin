// S262: マシン本体での設定方法（価格・在庫）。表示だけの部品で、保存の処理には関わらない。
// 本体の4つのボタン（OK / − / ＋ / BACK）の図、手順、動画、WEBマニュアルへのリンクをまとめる。
import { ChevronDown, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EXTERNAL, MANUAL_BASE, MANUAL_VIDEOS } from '@/lib/manual-links';

const KEYS: { key: string; label: string; does: string }[] = [
  { key: 'OK', label: 'OK', does: '設定モードに入る・決定' },
  { key: 'minus', label: '−', does: '項目の移動・数値の変更' },
  { key: 'plus', label: '＋', does: '項目の移動・数値の変更' },
  { key: 'BACK', label: 'BACK', does: '戻る（2回で販売画面へ）' },
];

/** マシン本体の操作パネル（表示窓と4つのボタン）の図。 */
export function MachineButtonsFigure({ display = 'A004' }: { display?: string }) {
  return (
    <figure className="flex flex-col gap-3">
      <div
        className="flex flex-col items-center gap-4 rounded-[14px] bg-[#1F2937] px-5 py-5 sm:flex-row sm:justify-center sm:gap-6"
        role="img"
        aria-label={`マシン本体の表示窓（${display}）と、OK・−・＋・BACK の4つのボタン`}
      >
        <div className="min-w-[120px] rounded-md border border-[#374151] bg-[#0B1220] px-4 py-2 text-center font-mono text-[26px] font-bold tracking-[0.18em] text-[#F87171]">
          {display}
        </div>
        <div className="flex items-start gap-3">
          {KEYS.map((k) => (
            <div key={k.key} className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#9CA3AF] bg-[#F9FAFB] font-bold text-[#111827] shadow-[inset_0_-3px_0_rgba(0,0,0,0.15)]',
                  k.label.length > 2 ? 'text-[11px]' : 'text-lg',
                )}
              >
                {k.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <figcaption>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          <dt className="font-bold">OK</dt>
          <dd className="text-foreground/80">設定モードに入る・決定</dd>
          <dt className="font-bold">− / ＋</dt>
          <dd className="text-foreground/80">項目の移動・数値の変更</dd>
          <dt className="font-bold">BACK</dt>
          <dd className="text-foreground/80">戻る（2回押すと販売画面へ）</dd>
        </dl>
      </figcaption>
    </figure>
  );
}

function Video({ src, title }: { src: string; title: string }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <video
        src={src}
        controls
        preload="none"
        playsInline
        className="aspect-video w-full rounded-[10px] border bg-black"
        aria-label={title}
      />
      <figcaption className="text-[13px] text-muted-foreground">{title}</figcaption>
    </figure>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-bold text-background">
            {i + 1}
          </span>
          <span className="pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[10px] bg-secondary px-4 py-3 text-sm leading-relaxed text-foreground/85">{children}</p>;
}

function GuideShell({
  title,
  lead,
  summary,
  children,
  manualHref,
}: {
  title: string;
  lead?: React.ReactNode;
  summary: string;
  children: React.ReactNode;
  manualHref: string;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-[12px] border border-warn/40 bg-warn/5 p-4 sm:p-5"
    >
      <p className="text-[15px] font-bold leading-relaxed text-foreground">{title}</p>
      {lead && <p className="text-sm leading-relaxed text-foreground/80">{lead}</p>}
      <details className="group rounded-[10px] border bg-card">
        <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[15px] font-bold [&::-webkit-details-marker]:hidden">
          {summary}
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="flex flex-col gap-5 border-t px-4 py-5">
          {children}
          <a
            href={manualHref}
            {...EXTERNAL}
            className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            WEBマニュアルで詳しく見る
            <ExternalLink className="h-3.5 w-3.5" aria-label="（新しいタブで開きます）" />
          </a>
        </div>
      </details>
    </section>
  );
}

/** 価格を変える画面に出す案内。 */
export function PriceBodyGuide() {
  return (
    <GuideShell
      title="価格を変えたら、マシン本体でも同じ金額に設定してください（本体の設定と管理画面の価格がずれると、正しく動きません）"
      summary="マシン本体での設定方法を見る"
      manualHref={`${MANUAL_BASE}/#/a/code-a004`}
    >
      <MachineButtonsFigure display="A004" />
      <div className="flex flex-col gap-2">
        <h3 className="text-[15px] font-bold">手順</h3>
        <Steps
          items={[
            '前面の扉を鍵で開ける',
            <>OKを押す（表示が「A001」になる）</>,
            <>＋を3回押して「A004」にしてOK</>,
            <>＋/−で「1回に必要な硬貨の枚数」を合わせる（例：300円なら 3。A00F が 0100＝100円単位のとき）</>,
            'BACKを2回押して販売画面に戻す',
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Note>料金の単位（A00F）が 0100 になっているか確認してください。本体の価格 = A00F × A004 です。</Note>
        <Note>設定ロック（A009）が 0001 のときは変更できません。0000 にしてから変更してください。</Note>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Video src={MANUAL_VIDEOS.a004} title="A004 料金の設定" />
        <Video src={MANUAL_VIDEOS.a00f} title="A00F 料金の単位" />
      </div>
    </GuideShell>
  );
}

/** 在庫の数を決める画面に出す案内。 */
export function StockBodyGuide() {
  return (
    <GuideShell
      title="マシン本体で在庫の数を設定するときは、次の手順で行います"
      summary="マシン本体での設定方法を見る"
      manualHref={`${MANUAL_BASE}/#/a/code-a007`}
    >
      <MachineButtonsFigure display="A007" />
      <div className="flex flex-col gap-2">
        <h3 className="text-[15px] font-bold">手順</h3>
        <Steps
          items={[
            '前面の扉を鍵で開ける',
            <>OKを押す（表示が「A001」になる）</>,
            <>＋を6回押して「A007」にしてOK</>,
            '＋/−で在庫の個数を合わせる',
            'BACKを2回押して販売画面に戻す',
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Note>
          売り切れでも販売（A00A）：00FF = 在庫が0でも販売する、0000 = 通常。
          <a
            href={`${MANUAL_BASE}/#/a/code-a00a`}
            {...EXTERNAL}
            className="ml-1 font-bold underline-offset-4 hover:text-primary hover:underline"
          >
            A00A の説明を見る
          </a>
        </Note>
        <Note>設定ロック（A009）が 0001 のときは変更できません。0000 にしてから変更してください。</Note>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Video src={MANUAL_VIDEOS.a007} title="A007 在庫の設定" />
      </div>
    </GuideShell>
  );
}
