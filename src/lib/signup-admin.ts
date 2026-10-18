// S262: お客様の登録リンク・承認・メンバー招待まわりの API（S262_SPEC の契約どおり）。
import { api, ApiError } from '@/lib/api';

export interface CustomerInvite {
  id: string;
  company_name_hint: string;
  status: 'active' | 'used' | 'expired' | 'revoked';
  created_at: string;
  expires_at: string;
  used_at: string | null;
  created_by_name: string | null;
}

export interface CreatedInvite {
  id: string;
  url: string;
  expires_at: string;
  company_name_hint: string;
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
  createInvite: (company_name_hint: string) =>
    api.post<CreatedInvite>('/admin/customer-invites', { company_name_hint }),
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
export function friendlyError(e: unknown, context: 'approve' | 'reject' | 'invite' | 'member' | 'load' | 'revoke'): string {
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
    if (raw.includes('email') || raw.includes('duplicate') || raw.includes('taken') || raw.includes('exists')) {
      return 'このメールアドレスはすでに登録されています。別のメールアドレスをお使いください。';
    }
    if (context === 'approve') {
      return '選んだマシンの中に、すでに別のお客様に割り当てられたもの（または同じ番号のマシン）があります。一覧を読み込み直して選び直してください。';
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
