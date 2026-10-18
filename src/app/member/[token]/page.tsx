'use client';

// S262: メンバーとして招待された方が開く画面（ログイン不要）。
// お名前とパスワードを決める → 「登録が完了しました。ログインしてください」。
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DoneMark,
  FormField,
  Notice,
  PublicFrame,
  PublicTitle,
  bigInput,
} from '@/components/public/public-frame';
import {
  DUPLICATE_EMAIL_MESSAGE,
  NETWORK_MESSAGE,
  PublicApiError,
  SERVER_MESSAGE,
  TOO_MANY_REQUESTS_MESSAGE,
  linkErrorMessage,
  publicCall,
} from '@/lib/public-api';

interface MemberInfo {
  customer_name: string;
  email: string;
  expires_at: string;
}

type Phase = 'loading' | 'link_error' | 'form' | 'done';

export default function MemberJoinPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [phase, setPhase] = useState<Phase>('loading');
  const [linkError, setLinkError] = useState('');
  const [info, setInfo] = useState<MemberInfo | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [doneEmail, setDoneEmail] = useState('');

  const load = async () => {
    setPhase('loading');
    try {
      const r = await publicCall<MemberInfo>('GET', `/member/${encodeURIComponent(token)}`);
      setInfo(r);
      setPhase('form');
    } catch (e) {
      const err = e instanceof PublicApiError ? e : new PublicApiError(0, 'network', null);
      setLinkError(linkErrorMessage(err.status, err.code, 'member'));
      setPhase('link_error');
    }
  };

  useEffect(() => {
    if (!token) {
      setLinkError(linkErrorMessage(404, 'invalid', 'member'));
      setPhase('link_error');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'お名前を入力してください。';
    if (password.length < 8) errs.password = 'パスワードは8文字以上にしてください。';
    if (password2 !== password) errs.password2 = '1回目と同じパスワードを入力してください。';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const r = await publicCall<{ email: string }>('POST', `/member/${encodeURIComponent(token)}`, {
        name: name.trim(),
        password,
      });
      setDoneEmail(r?.email || info?.email || '');
      setPhase('done');
    } catch (e) {
      const err = e instanceof PublicApiError ? e : new PublicApiError(0, 'network', null);
      if (err.isNetwork) setFormError(NETWORK_MESSAGE);
      else if (['invalid', 'expired', 'used', 'revoked'].includes(err.code) || err.status === 404 || err.status === 410) {
        setLinkError(linkErrorMessage(err.status, err.code, 'member'));
        setPhase('link_error');
      } else if (err.status === 409) setFormError(DUPLICATE_EMAIL_MESSAGE);
      else if (err.status === 429) setFormError(TOO_MANY_REQUESTS_MESSAGE);
      else if (err.status === 422 || err.status === 400) setFormError('入力内容をご確認ください。パスワードは8文字以上です。');
      else setFormError(SERVER_MESSAGE);
    } finally {
      setSaving(false);
    }
  };

  if (phase === 'loading') {
    return (
      <PublicFrame>
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          リンクを確認しています…
        </div>
      </PublicFrame>
    );
  }

  if (phase === 'link_error') {
    return (
      <PublicFrame>
        <PublicTitle title="このリンクは使えません" />
        <Notice tone="error">{linkError}</Notice>
        {linkError === NETWORK_MESSAGE ? (
          <Button variant="outline" className="self-start" onClick={load}>
            もう一度読み込む
          </Button>
        ) : (
          <Link href="/login" className="text-sm font-bold text-primary hover:underline">
            ログイン画面へ →
          </Link>
        )}
      </PublicFrame>
    );
  }

  if (phase === 'done') {
    return (
      <PublicFrame>
        <DoneMark />
        <PublicTitle
          title="登録が完了しました。ログインしてください"
          lead={
            <>
              {doneEmail ? <>メールアドレス（{doneEmail}）と、</> : null}
              いま決めたパスワードでログインできます。
            </>
          }
        />
        <Button asChild className="h-[52px] text-[17px]">
          <Link href="/login">ログイン画面へ</Link>
        </Button>
      </PublicFrame>
    );
  }

  return (
    <PublicFrame>
      <PublicTitle
        title="メンバーのご登録"
        lead={
          <>
            {info?.customer_name ? <>「{info.customer_name}」の管理画面に招待されています。</> : null}
            お名前とパスワードを決めると、すぐにログインできるようになります。
          </>
        }
      />
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <FormField id="m-mail" label="メールアドレス（ログインに使います）">
          <Input id="m-mail" value={info?.email ?? ''} readOnly className={`${bigInput} bg-secondary`} />
        </FormField>
        <FormField id="m-name" label="お名前" error={fieldErrors.name}>
          <Input id="m-name" aria-invalid={!!fieldErrors.name} value={name} onChange={(e) => setName(e.target.value)} placeholder="例：山田 太郎" className={bigInput} autoComplete="name" />
        </FormField>
        <FormField id="m-pass" label="パスワード（8文字以上）" error={fieldErrors.password}>
          <Input id="m-pass" aria-invalid={!!fieldErrors.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={bigInput} autoComplete="new-password" />
        </FormField>
        <FormField id="m-pass2" label="パスワード（確認のためもう一度）" error={fieldErrors.password2}>
          <Input id="m-pass2" aria-invalid={!!fieldErrors.password2} type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} className={bigInput} autoComplete="new-password" />
        </FormField>
        {formError && <Notice tone="error">{formError}</Notice>}
        <Button type="submit" className="h-[52px] text-[17px]" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          登録する
        </Button>
      </form>
    </PublicFrame>
  );
}
