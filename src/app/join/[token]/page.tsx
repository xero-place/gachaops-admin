'use client';

// S262: お客様が開く登録画面（ログイン不要）。
// 入力 → 確認コード入力 → 「お申し込みを受け付けました」。
import { useEffect, useState } from 'react';
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

interface JoinInfo {
  company_name_hint: string;
  expires_at: string;
}
interface StartResult {
  request_id: string;
  email_masked: string;
}

type Phase = 'loading' | 'link_error' | 'form' | 'code' | 'done';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_CODES = ['invalid', 'expired', 'used', 'revoked'];

export default function JoinPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [phase, setPhase] = useState<Phase>('loading');
  const [linkError, setLinkError] = useState('');

  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [requestId, setRequestId] = useState('');
  const [emailMasked, setEmailMasked] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeInfo, setCodeInfo] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const loadLink = async () => {
    setPhase('loading');
    try {
      const info = await publicCall<JoinInfo>('GET', `/join/${encodeURIComponent(token)}`);
      setCompany((c) => c || info.company_name_hint || '');
      setPhase('form');
    } catch (e) {
      const err = e instanceof PublicApiError ? e : new PublicApiError(0, 'network', null);
      setLinkError(linkErrorMessage(err.status, err.code, 'join'));
      setPhase('link_error');
    }
  };

  useEffect(() => {
    if (!token) {
      setLinkError(linkErrorMessage(404, 'invalid', 'join'));
      setPhase('link_error');
      return;
    }
    loadLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!company.trim()) errs.company = '会社名を入力してください。';
    if (!name.trim()) errs.name = 'お名前を入力してください。';
    if (!email.trim()) errs.email = 'メールアドレスを入力してください。';
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'メールアドレスの形が正しくありません（例：yamada@example.co.jp）。';
    if (password.length < 8) errs.password = 'パスワードは8文字以上にしてください。';
    if (password2 !== password) errs.password2 = '1回目と同じパスワードを入力してください。';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  /** 確認コードを送る（再送も同じ呼び出し）。成功したら true。 */
  const sendCode = async (): Promise<boolean> => {
    try {
      const r = await publicCall<StartResult>('POST', `/join/${encodeURIComponent(token)}/start`, {
        company_name: company.trim(),
        contact_name: name.trim(),
        email: email.trim(),
        password,
      });
      setRequestId(r.request_id);
      setEmailMasked(r.email_masked || email.trim());
      return true;
    } catch (e) {
      const err = e instanceof PublicApiError ? e : new PublicApiError(0, 'network', null);
      if (err.isNetwork) throw new Error(NETWORK_MESSAGE);
      if (LINK_CODES.includes(err.code) || err.status === 404 || (err.status === 410 && !err.code)) {
        setLinkError(linkErrorMessage(err.status, err.code, 'join'));
        setPhase('link_error');
        return false;
      }
      if (err.status === 409 || ['email_taken', 'duplicate_email', 'already_registered'].includes(err.code)) {
        throw new Error(DUPLICATE_EMAIL_MESSAGE);
      }
      if (err.status === 429) throw new Error(TOO_MANY_REQUESTS_MESSAGE);
      if (err.status === 422 || err.status === 400) {
        throw new Error('入力内容に正しくないところがあります。メールアドレスとパスワード（8文字以上）をご確認ください。');
      }
      throw new Error(SERVER_MESSAGE);
    }
  };

  const onSubmitForm = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setSending(true);
    try {
      const ok = await sendCode();
      if (ok) {
        setCode('');
        setCodeError(null);
        setCodeInfo(null);
        setPhase('code');
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : SERVER_MESSAGE);
    } finally {
      setSending(false);
    }
  };

  const onResend = async () => {
    setCodeError(null);
    setCodeInfo(null);
    setResending(true);
    try {
      const ok = await sendCode();
      if (ok) {
        setCode('');
        setCodeInfo('新しい確認コードを送りました。届いたメールの6桁の数字を入力してください。');
      }
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : SERVER_MESSAGE);
    } finally {
      setResending(false);
    }
  };

  const onVerify = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setCodeError(null);
    setCodeInfo(null);
    const c = code.replace(/\D/g, '');
    if (c.length !== 6) {
      setCodeError('確認コードは6桁の数字です。');
      return;
    }
    setVerifying(true);
    try {
      await publicCall<{ status: string }>('POST', `/join/${encodeURIComponent(token)}/verify`, {
        request_id: requestId,
        code: c,
      });
      setPhase('done');
    } catch (e) {
      const err = e instanceof PublicApiError ? e : new PublicApiError(0, 'network', null);
      if (err.isNetwork) setCodeError(NETWORK_MESSAGE);
      else if (err.code === 'wrong_code') {
        setCodeError(
          err.attemptsLeft !== null
            ? err.attemptsLeft > 0
              ? `確認コードが違います。あと${err.attemptsLeft}回入力できます。`
              : '確認コードが違います。入力できる回数が残っていません。「確認コードをもう一度送る」を押してください。'
            : '確認コードが違います。メールに書かれた6桁の数字をもう一度ご確認ください。',
        );
      } else if (err.code === 'code_expired') {
        setCodeError('確認コードの有効期限（10分）が切れました。「確認コードをもう一度送る」を押して、新しいコードを入力してください。');
      } else if (err.code === 'too_many_attempts') {
        setCodeError('入力できる回数（5回）を超えました。「確認コードをもう一度送る」を押して、新しいコードでやり直してください。');
      } else if (LINK_CODES.includes(err.code) || err.status === 404) {
        setLinkError(linkErrorMessage(err.status, err.code, 'join'));
        setPhase('link_error');
      } else if (err.status === 429) setCodeError(TOO_MANY_REQUESTS_MESSAGE);
      else setCodeError(SERVER_MESSAGE);
    } finally {
      setVerifying(false);
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
        {linkError === NETWORK_MESSAGE && (
          <Button variant="outline" className="self-start" onClick={loadLink}>
            もう一度読み込む
          </Button>
        )}
      </PublicFrame>
    );
  }

  if (phase === 'done') {
    return (
      <PublicFrame>
        <DoneMark />
        <PublicTitle
          title="お申し込みを受け付けました"
          lead={
            <>
              弊社で確認が済みしだい、ご登録のメールアドレス（{emailMasked}）にお知らせが届きます。
              <br />
              お知らせが届いたら、ご自身で決めたメールアドレスとパスワードでログインできます。
            </>
          }
        />
        <Notice>この画面は閉じていただいてかまいません。</Notice>
      </PublicFrame>
    );
  }

  if (phase === 'code') {
    return (
      <PublicFrame>
        <PublicTitle
          title="確認コードを入力してください"
          lead={<>{emailMasked} に6桁の確認コードを送りました。メールに書かれた数字を入力してください（10分間有効です）。</>}
        />
        <form onSubmit={onVerify} className="flex flex-col gap-5" noValidate>
          <FormField id="j-code" label="確認コード（6桁）" error={codeError}>
            <Input
              id="j-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={`${bigInput} tracking-[0.4em]`}
              aria-invalid={!!codeError}
              aria-describedby={codeError ? 'j-code-error' : undefined}
              autoFocus
            />
          </FormField>
          {codeInfo && <Notice tone="success">{codeInfo}</Notice>}
          <Button type="submit" className="h-[52px] text-[17px]" disabled={verifying}>
            {verifying && <Loader2 className="animate-spin" />}
            確認して申し込む
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onResend} disabled={resending}>
            {resending && <Loader2 className="animate-spin" />}
            確認コードをもう一度送る
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setPhase('form');
              setCodeError(null);
            }}
          >
            メールアドレスを直す
          </Button>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          メールが届かないときは、迷惑メールのフォルダもご確認ください。
        </p>
      </PublicFrame>
    );
  }

  return (
    <PublicFrame>
      <PublicTitle
        title="管理画面のご登録"
        lead="お使いになるメールアドレスとパスワードを決めてください。ご登録のあと、弊社で確認が済みしだいお使いいただけます。"
      />
      <form onSubmit={onSubmitForm} className="flex flex-col gap-5" noValidate>
        <FormField id="s-company" label="会社名" error={fieldErrors.company}>
          <Input id="s-company" aria-invalid={!!fieldErrors.company} value={company} onChange={(e) => setCompany(e.target.value)} className={bigInput} autoComplete="organization" />
        </FormField>
        <FormField id="s-name" label="お名前" error={fieldErrors.name}>
          <Input id="s-name" aria-invalid={!!fieldErrors.name} value={name} onChange={(e) => setName(e.target.value)} placeholder="例：山田 太郎" className={bigInput} autoComplete="name" />
        </FormField>
        <FormField id="s-mail" label="メールアドレス（ログインに使います）" error={fieldErrors.email}>
          <Input id="s-mail" aria-invalid={!!fieldErrors.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="例：yamada@example.co.jp" className={bigInput} autoComplete="email" />
        </FormField>
        <FormField id="s-pass" label="パスワード（8文字以上）" error={fieldErrors.password}>
          <Input id="s-pass" aria-invalid={!!fieldErrors.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={bigInput} autoComplete="new-password" />
        </FormField>
        <FormField id="s-pass2" label="パスワード（確認のためもう一度）" error={fieldErrors.password2}>
          <Input id="s-pass2" aria-invalid={!!fieldErrors.password2} type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} className={bigInput} autoComplete="new-password" />
        </FormField>
        {formError && <Notice tone="error">{formError}</Notice>}
        <Button type="submit" className="h-[52px] text-[17px]" disabled={sending}>
          {sending && <Loader2 className="animate-spin" />}
          確認コードを送る
        </Button>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          入力したメールアドレスに6桁の確認コードが届きます。コードを入力すると登録の申し込みが完了します。
        </p>
      </form>
    </PublicFrame>
  );
}
