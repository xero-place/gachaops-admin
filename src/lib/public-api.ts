/**
 * S262: ログイン不要の公開ページ（/join/[token], /member/[token]）用の素の fetch。
 * lib/api.ts のトークン付与・自動更新は使わない（未ログインのため）。
 */
import { ApiError } from '@/lib/api';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.xero-place.com/v1';

export class PublicApiError extends Error {
  constructor(
    /** HTTP ステータス。通信できなかったときは 0 */
    public status: number,
    /** サーバーが返したエラーの種類（"expired" "used" "wrong_code" など）。不明なら '' */
    public code: string,
    /** wrong_code のときの残り回数 */
    public attemptsLeft: number | null,
  ) {
    super(code || `HTTP ${status}`);
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

type Json = Record<string, unknown>;

const KNOWN_CODES = [
  'invalid',
  'expired',
  'used',
  'revoked',
  'wrong_code',
  'code_expired',
  'too_many_attempts',
  'email_taken',
  'duplicate_email',
  'already_registered',
];

/** エラー本文から code と attempts_left をできるだけ取り出す（返し方の違いに強くする）。 */
export function parseErrorBody(body: unknown): { code: string; attemptsLeft: number | null } {
  let code = '';
  let attemptsLeft: number | null = null;
  const visit = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    const o = v as Json;
    for (const key of ['detail', 'code', 'error', 'title']) {
      const val = o[key];
      if (typeof val === 'string' && !code) {
        const hit = KNOWN_CODES.find((c) => val === c) ?? KNOWN_CODES.find((c) => val.includes(c));
        if (hit) code = hit;
      } else if (val && typeof val === 'object') {
        visit(val);
      }
    }
    const al = o['attempts_left'];
    if (typeof al === 'number' && attemptsLeft === null) attemptsLeft = al;
    if (Array.isArray(o['errors'])) {
      for (const e of o['errors'] as unknown[]) {
        if (e && typeof e === 'object') {
          const eo = e as Json;
          if (eo['field'] === 'attempts_left') {
            const n = Number(eo['message'] ?? eo['code']);
            if (!Number.isNaN(n)) attemptsLeft = n;
          }
        }
      }
    }
  };
  visit(body);
  // 文字列の中に「attempts_left=3」のように埋め込まれている場合
  if (attemptsLeft === null && body && typeof body === 'object') {
    const m = JSON.stringify(body).match(/attempts_left\D{0,4}(\d+)/);
    if (m) attemptsLeft = Number(m[1]);
  }
  return { code, attemptsLeft };
}

export async function publicCall<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new PublicApiError(0, 'network', null);
  }
  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // not JSON
    }
    const { code, attemptsLeft } = parseErrorBody(parsed);
    throw new PublicApiError(res.status, code, attemptsLeft);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** 認証つき API（lib/api.ts）のエラーから code を取り出す。 */
export function apiErrorCode(e: unknown): { status: number; code: string } {
  if (e instanceof ApiError) {
    const { code } = parseErrorBody(e.problem);
    return { status: e.status, code };
  }
  return { status: 0, code: 'network' };
}

/** 登録リンク（招待リンク）の状態に関するメッセージ。 */
export function linkErrorMessage(status: number, code: string, kind: 'join' | 'member'): string {
  const who = kind === 'join' ? '弊社担当者' : 'メンバーに追加してくれた方';
  if (status === 0) return NETWORK_MESSAGE;
  if (code === 'expired' || (status === 410 && !code)) {
    return `このリンクは有効期限（7日間）が過ぎています。お手数ですが、${who}に新しいリンクをご依頼ください。`;
  }
  if (code === 'used') {
    return kind === 'join'
      ? 'このリンクはすでに使われています。登録がお済みの場合は、弊社からのご連絡をお待ちください。'
      : 'このリンクはすでに使われています。登録がお済みの場合は、ログイン画面からログインしてください。';
  }
  if (code === 'revoked') {
    return `このリンクは取り消されています。お手数ですが、${who}にお問い合わせください。`;
  }
  if (status === 404 || code === 'invalid') {
    return 'このリンクは正しくありません。届いたリンクを最後までそのまま開いているか、ご確認ください。';
  }
  if (status === 429) return TOO_MANY_REQUESTS_MESSAGE;
  return SERVER_MESSAGE;
}

export const NETWORK_MESSAGE =
  '通信できませんでした。インターネットにつながっているかを確かめて、もう一度お試しください。';
export const TOO_MANY_REQUESTS_MESSAGE =
  '短い時間に何度も送信されました。10分ほど待ってから、もう一度お試しください。';
export const SERVER_MESSAGE =
  'うまく処理できませんでした。時間をおいて、もう一度お試しください。';
export const DUPLICATE_EMAIL_MESSAGE =
  'このメールアドレスはすでに登録されています。別のメールアドレスをお使いいただくか、ログイン画面からログインしてください。';
