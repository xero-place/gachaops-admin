// S262: 顧客の登録リンク・承認・メンバー招待まわりの API（S262_SPEC の契約どおり）。
import { api, ApiError, type ImpersonateResponse } from '@/lib/api';
import { tokenStore } from '@/lib/token-store';

export interface CustomerInvite {
  id: string;
  company_name_hint: string;
  status: 'active' | 'used' | 'expired' | 'revoked';
  created_at: string;
  expires_at: string;
  used_at: string | null;
  created_by_name: string | null;
  /** S262b: リンク作成時に作った顧客 */
  customer_id?: string | null;
  customer_name?: string | null;
  device_count?: number;
}

export interface CreatedInvite {
  id: string;
  url: string;
  expires_at: string;
  company_name_hint: string;
  /** S262b: リンクと同時に作られた顧客 */
  customer_id?: string | null;
  assigned_device_ids?: string[];
}

export interface DeviceRef {
  id: string;
  name: string;
}

/** S262b: まだ本人が登録していない顧客（弊社が先に準備できる） */
export interface PendingCustomer {
  customer_id: string;
  name: string;
  created_at: string;
  device_count: number;
  devices: DeviceRef[];
  active_invite: { id: string; expires_at: string } | null;
  signup_request: { id: string; status: SignupRequest['status'] } | null;
}

export interface SignupRequest {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  created_at: string;
  verified_at: string | null;
  invite_id: string | null;
  /** S262b: リンク作成時に作った顧客と、すでに移したマシン */
  customer_id?: string | null;
  assigned_devices?: DeviceRef[];
}

export interface StockDevice {
  id: string;
  name: string;
  serial: string;
  status: string;
  app_version: string | null;
  last_heartbeat_at: string | null;
}

export interface HomeSummary {
  offline_devices: number;
  sold_out_devices: number;
  pending_signups: number;
  unconfirmed_dispense_7d: number;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

export interface PendingMemberInvite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
}

const items = <T,>(r: { items?: T[] } | T[] | null | undefined): T[] =>
  Array.isArray(r) ? r : (r?.items ?? []);

export const signupAdmin = {
  createInvite: (company_name_hint: string, device_ids: string[] = []) =>
    api.post<CreatedInvite>('/admin/customer-invites', { company_name_hint, device_ids }),
  /** S262b: 同じ顧客の登録リンクを作り直す（古いリンクは使えなくなる） */
  reissueInvite: (customerId: string) =>
    api.post<CreatedInvite>(`/admin/customers/${encodeURIComponent(customerId)}/invite`, {}),
  /** S262b: 在庫のマシンを顧客に移す */
  assignDevices: (customerId: string, device_ids: string[]) =>
    api.post<{ assigned_device_ids: string[] }>(
      `/admin/customers/${encodeURIComponent(customerId)}/assign-devices`,
      { device_ids },
    ),
  pendingCustomers: async () =>
    items(await api.get<{ items: PendingCustomer[] }>('/admin/pending-customers')),
  listInvites: async (status?: CustomerInvite['status']) =>
    items(
      await api.get<{ items: CustomerInvite[] }>(
        '/admin/customer-invites' + (status ? `?status=${status}` : ''),
      ),
    ),
  revokeInvite: (id: string) =>
    api.post(`/admin/customer-invites/${encodeURIComponent(id)}/revoke`, {}),
  listRequests: async (status: SignupRequest['status'] = 'pending_approval') =>
    items(await api.get<{ items: SignupRequest[] }>(`/admin/signup-requests?status=${status}`)),
  stockDevices: async () => items(await api.get<{ items: StockDevice[] }>('/admin/stock-devices')),
  approve: (id: string, device_ids: string[]) =>
    api.post<{ customer_id: string; user_id: string; assigned_device_ids: string[] }>(
      `/admin/signup-requests/${encodeURIComponent(id)}/approve`,
      { device_ids },
    ),
  reject: (id: string, reason?: string) =>
    api.post(`/admin/signup-requests/${encodeURIComponent(id)}/reject`, reason ? { reason } : {}),
  homeSummary: () => api.get<HomeSummary>('/admin/home-summary'),
};

const PREP_KEY = 'gachaops_prepare_session';

/**
 * S262b: 「この顧客として準備する」。まだ本人が登録していない顧客の画面を、弊社が代わりに準備する。
 * 既存の代理操作（auth.impersonate）と同じ流れ：今のスタッフのログインを退避 → 返ってきたトークンに切り替える。
 * 戻るときは代理操作バナーの「スタッフの画面に戻る」をそのまま使う。
 */
export async function startPrepareSession(customerId: string, customerName: string): Promise<void> {
  const hadSnapshot = tokenStore.isImpersonating();
  tokenStore.saveImpersonatorSnapshot();
  try {
    const data = await api.post<ImpersonateResponse>(
      `/admin/customers/${encodeURIComponent(customerId)}/prepare-session`,
      {},
    );
    tokenStore.set(data.access_token, data.refresh_token, data.user);
    try {
      localStorage.setItem(PREP_KEY, JSON.stringify({ user_id: data.user?.id ?? null, customer_name: customerName }));
    } catch { /* 表示用なので保存できなくてもよい */ }
  } catch (e) {
    // 失敗したら、退避したスタッフのログインを元に戻す（バナーが誤って出ないように）
    if (!hadSnapshot) tokenStore.restoreImpersonator();
    throw e;
  }
}

/** いまの代理操作が「準備中」なら、その顧客名を返す。 */
export function preparingCustomerName(): string | null {
  if (typeof window === 'undefined' || !tokenStore.isImpersonating()) return null;
  try {
    const raw = localStorage.getItem(PREP_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { user_id: string | null; customer_name: string };
    const u = tokenStore.getUser();
    return v.user_id && u?.id === v.user_id ? v.customer_name : null;
  } catch {
    return null;
  }
}

export function clearPrepareMarker(): void {
  try { localStorage.removeItem(PREP_KEY); } catch { /* noop */ }
}

const q = (customerId?: string) => (customerId ? `?customer_id=${encodeURIComponent(customerId)}` : '');

export const membersApi = {
  list: (customerId?: string) =>
    api.get<{ items: Member[]; pending_invites: PendingMemberInvite[] }>(`/members${q(customerId)}`),
  invite: (body: { email: string; name?: string; role: string }, customerId?: string) =>
    api.post<{ id: string; email: string; expires_at: string }>(`/members/invite${q(customerId)}`, body),
  revoke: (inviteId: string, customerId?: string) =>
    api.post(`/members/invites/${encodeURIComponent(inviteId)}/revoke${q(customerId)}`, {}),
};

/** 画面に出す日付（2026年10月18日 14:05）。 */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export const ROLE_LABELS: Record<string, { label: string; desc: string }> = {
  lv2_admin: { label: '管理者', desc: 'すべての操作ができ、メンバーの追加もできます' },
  lv3_operator: { label: '担当者', desc: 'マシン・映像・価格などの操作ができます' },
  lv4_viewer: { label: '見るだけ', desc: '売上やマシンの様子を見ることだけできます' },
};

export function roleLabel(role: string): string {
  if (role === 'lv1_super') return '弊社スタッフ';
  return ROLE_LABELS[role]?.label ?? role;
}

/** ログイン後の画面で出すエラー文（やさしい日本語）。 */
export function friendlyError(e: unknown, context: 'approve' | 'reject' | 'invite' | 'member' | 'load' | 'revoke' | 'assign' | 'prepare'): string {
  if (!(e instanceof ApiError)) {
    return '通信できませんでした。インターネットにつながっているかを確かめて、もう一度お試しください。';
  }
  const raw = `${e.problem?.detail ?? ''} ${e.problem?.title ?? ''}`.toLowerCase();
  if (e.status === 403) return 'この操作をする権限がありません。';
  if (e.status === 404) {
    return context === 'load'
      ? '見つかりませんでした。'
      : '対象が見つかりませんでした。すでに処理されたかもしれません。画面を読み込み直してください。';
  }
  if (e.status === 409) {
    // ★S270: 変換中（準備中）の映像を流そうとしたとき。サーバーの案内をそのまま出す
    if (raw.includes('準備中')) return e.problem?.detail ?? '映像を準備中です（30秒ほど）。少し待ってから、もう一度流してください。';
    if (raw.includes('email') || raw.includes('duplicate') || raw.includes('taken') || raw.includes('exists')) {
      return 'このメールアドレスはすでに登録されています。別のメールアドレスをお使いください。';
    }
    if (context === 'approve' || context === 'assign' || raw.includes('device_not_in_stock')) {
      return '選んだマシンの中に、すでに別の顧客に割り当てられたもの（または同じ番号のマシン）があります。一覧を読み込み直して選び直してください。';
    }
    return 'すでに処理されているか、ほかの内容とぶつかっています。画面を読み込み直してください。';
  }
  if (e.status === 410) return 'このリンクや申し込みは、有効期限切れか取り消し済みです。';
  if (e.status === 422 || e.status === 400) {
    if (context === 'member' || context === 'invite') return '入力内容をご確認ください（メールアドレスの形など）。';
    return '内容に正しくないところがあります。もう一度ご確認ください。';
  }
  if (e.status === 429) return '短い時間に何度も操作されました。少し待ってから、もう一度お試しください。';
  return 'うまく処理できませんでした。時間をおいて、もう一度お試しください。';
}
