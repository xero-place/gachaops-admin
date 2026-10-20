'use client';

/**
 * S262m: マシンで映像を流す・止める（案内つきの手順画面）。
 * ★S271: 手順の中身は components/domain/play-wizard.tsx に移した（映像の画面からも同じ手順で流せるように）。
 */
import { AppShell } from '@/components/layout/app-shell';
import { PlayWizard } from '@/components/domain/play-wizard';

export default function PlayPage() {
  return (
    <AppShell title="マシンで映像を流す・止める" back={{ href: '/', label: 'ホームに戻る' }}>
      <PlayWizard />
    </AppShell>
  );
}

