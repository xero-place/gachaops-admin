'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 押すとテキストをコピーし、2秒間「コピーしました」と表示する。 */
export function CopyButton({
  text,
  label,
  ...rest
}: { text: string; label: string } & Omit<ButtonProps, 'onClick' | 'children'>) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  return (
    <Button
      type="button"
      variant="outline"
      {...rest}
      onClick={async () => {
        const ok = await copyText(text);
        setState(ok ? 'ok' : 'fail');
        setTimeout(() => setState('idle'), 2000);
      }}
    >
      {state === 'ok' && <Check />}
      {state === 'ok' ? 'コピーしました' : state === 'fail' ? 'コピーできませんでした' : label}
    </Button>
  );
}
