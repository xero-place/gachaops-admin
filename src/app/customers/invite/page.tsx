'use client';

// S262: 新しいお客様の管理画面を発行する（4ステップ）。
// 1. 登録リンクを作る → 2. お客様に送る → 3. 承認してマシンを選ぶ → 4. 完了
// /customers/invite?request=<id> で開くと、その申し込みの承認（ステップ3）から始まる。
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StaffOnly } from '@/components/domain/staff-only';
import { DoneMark } from '@/components/public/public-frame';
import {
  RejectDialog,
  RequestSummary,
  StockDevicePicker,
} from '@/components/domain/signup-approval';
import {
  AssignDevicesDialog,
  AssignedDeviceList,
  InviteLinkPanel,
  OwnershipNotice,
  PrepareButton,
} from '@/components/domain/customer-prep';
import { cn } from '@/lib/utils';
import {
  fmtDate,
  fmtDateTime,
  friendlyError,
  signupAdmin,
  type CreatedInvite,
  type SignupRequest,
  type StockDevice,
} from '@/lib/signup-admin';

const NOTIFY_EMAIL = 'gtchax@xeroplace.jp';
const STEP_LABELS = ['1. 登録リンクを作る', '2. お客様に送る', '3. 承認してマシンを選ぶ', '4. 完了'];

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-4 py-3.5 text-sm font-bold text-destructive">
      {children}
    </div>
  );
}

export default function CustomerInvitePage() {
  return (
    <AppShell title="新しいお客様の管理画面を発行する" back={{ href: '/', label: 'ホームに戻る' }}>
      <StaffOnly>
        <InviteWizard />
      </StaffOnly>
    </AppShell>
  );
}

function InviteWizard() {
  const [step, setStep] = useState(1);

  // step 1
  const [company, setCompany] = useState('');
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  // S262b: リンク作成時に先にお渡しするマシン
  const [prePicked, setPrePicked] = useState<string[]>([]);
  const [handedNames, setHandedNames] = useState<string[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignNotice, setAssignNotice] = useState<string | null>(null);

  // step 3
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [devices, setDevices] = useState<StockDevice[]>([]);
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

  // step 4
  const [done, setDone] = useState<{ kind: 'approved' | 'rejected'; request: SignupRequest; count: number } | null>(null);

  const selectedRequest = requests.find((r) => r.id === requestId) ?? null;

  const loadRequests = useCallback(async (preferId?: string | null, inviteId?: string | null) => {
    setReqLoading(true);
    setReqError(null);
    try {
      const list = await signupAdmin.listRequests('pending_approval');
      setRequests(list);
      const match =
        (preferId && list.find((r) => r.id === preferId)) ||
        (inviteId && list.find((r) => r.invite_id === inviteId)) ||
        null;
      if (match) setRequestId(match.id);
      else setRequestId((cur) => (cur && list.some((r) => r.id === cur) ? cur : null));
    } catch (e) {
      setReqError(friendlyError(e, 'load'));
    } finally {
      setReqLoading(false);
    }
  }, []);

  const loadDevices = useCallback(async () => {
    setDevLoading(true);
    setDevError(null);
    try {
      setDevices(await signupAdmin.stockDevices());
    } catch (e) {
      const msg = friendlyError(e, 'load');
      setDevError('割り当てられるマシンを読み込めませんでした。' + (msg === '見つかりませんでした。' ? '' : msg));
    } finally {
      setDevLoading(false);
    }
  }, []);

  // ?request=<id> で開いたときはステップ3から。それ以外はステップ1でマシンの一覧を読む
  useEffect(() => {
    const rid = new URLSearchParams(window.location.search).get('request');
    if (rid) {
      setStep(3);
      setRequestId(rid);
      loadRequests(rid, null);
    }
    loadDevices();
  }, [loadRequests, loadDevices]);

  const createLink = async () => {
    setCompanyError(null);
    if (!company.trim()) {
      setCompanyError('お客様の会社名を入力してください。');
      return;
    }
    setCreating(true);
    try {
      const inv = await signupAdmin.createInvite(company.trim(), prePicked);
      setInvite(inv);
      const moved = inv.assigned_device_ids ?? prePicked;
      setHandedNames(devices.filter((d) => moved.includes(d.id)).map((d) => d.name));
      setStep(2);
      loadDevices();
    } catch (e) {
      setCompanyError(friendlyError(e, 'invite'));
    } finally {
      setCreating(false);
    }
  };

  const goStep3 = () => {
    setStep(3);
    loadRequests(null, invite?.id ?? null);
    if (devices.length === 0) loadDevices();
  };

  const approve = async () => {
    if (!selectedRequest) return;
    setApproving(true);
    setApproveError(null);
    try {
      const r = await signupAdmin.approve(selectedRequest.id, picked);
      setDone({ kind: 'approved', request: selectedRequest, count: r?.assigned_device_ids?.length ?? picked.length });
      setStep(4);
    } catch (e) {
      setApproveError(friendlyError(e, 'approve'));
      // 失敗したらマシン一覧を最新にする（ほかの人が先に割り当てた場合など）
      loadDevices();
    } finally {
      setApproving(false);
    }
  };

  const restart = () => {
    setStep(1);
    setCompany('');
    setInvite(null);
    setPrePicked([]);
    setHandedNames([]);
    setAssignNotice(null);
    setRequestId(null);
    setPicked([]);
    loadDevices();
    setDone(null);
    setApproveError(null);
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', '/customers/invite');
    }
  };

  const onNext = () => {
    if (step === 1) createLink();
    else if (step === 2) goStep3();
    else if (step === 3) approve();
  };
  const onBack = () => {
    if (step === 3 && invite) setStep(2);
    else if (step === 2) setStep(1);
  };
  const canBack = (step === 2) || (step === 3 && !!invite);
  const nextLabel = step === 1 ? '登録リンクを作る' : step === 2 ? 'お客様が登録したら次へ' : 'この内容で承認する';
  const nextBusy = (step === 1 && creating) || (step === 3 && approving);
  const nextDisabled = nextBusy || (step === 3 && !selectedRequest);

  return (
    <div className="flex w-full max-w-[960px] flex-col gap-6">
      <ol aria-label="手順" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          return (
            <li key={label} className="flex flex-col gap-2" aria-current={n === step ? 'step' : undefined}>
              <div className={cn('h-1.5 rounded-full', n <= step ? 'bg-primary' : 'bg-border')} />
              <div className={cn('text-sm', n === step ? 'font-bold text-foreground' : 'text-muted-foreground')}>
                {label}
              </div>
            </li>
          );
        })}
      </ol>

      <section className="flex flex-col gap-[22px] rounded-card border bg-card p-5 sm:p-7">
        {step === 1 && (
          <div className="flex flex-col gap-[22px]">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] font-bold">お客様専用の登録リンクを作ります</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                メールアドレスとパスワードは、お客様ご自身に決めて入力してもらいます。こちらで聞き取る必要はありません。
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-company" className="text-sm font-bold">
                お客様の会社名（必須）
              </label>
              <Input
                id="f-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createLink(); }}
                placeholder="例：株式会社〇〇"
                className="h-12 text-base"
                aria-invalid={!!companyError}
              />
              <div className="text-[13px] text-muted-foreground">
                誰向けのリンクかを弊社で見分けるためのものです。お客様が登録時に直せます。
              </div>
            </div>
            {companyError && <ErrorBox>{companyError}</ErrorBox>}
            <StockDevicePicker
              devices={devices}
              loading={devLoading}
              error={devError}
              onReload={loadDevices}
              selected={prePicked}
              onChange={setPrePicked}
              title="先にお渡しするマシンを選ぶ（あとからでも追加できます）"
              description="まだどのお客様にも割り当てていないマシンだけを表示しています。選ばずにリンクだけ作ることもできます。"
            />
            {prePicked.length > 0 && <OwnershipNotice />}
            <div className="rounded-[10px] bg-secondary px-[18px] py-4 text-sm leading-relaxed text-foreground/80">
              リンクを作ると、このお客様の管理画面がすぐにできあがり、お客様が登録する前から弊社で映像や価格を準備できます。
              <br />
              リンクは1社に1つで、7日間有効です。使われるとそれ以上は使えなくなります。
            </div>
          </div>
        )}

        {step === 2 && invite && (
          <div className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] font-bold">リンクをお客様に送ってください</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                メール・LINEなど、いつもの連絡手段で送れます。下の文章をそのまま貼り付けて使えます。
              </p>
            </div>
            <InviteLinkPanel invite={invite} />
            {invite.customer_id && (
              <div className="flex flex-col gap-4 rounded-xl border p-[18px]">
                <div className="flex flex-col gap-1">
                  <div className="text-[15px] font-bold">お客様の登録を待つあいだに、画面を準備できます</div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    「{invite.company_name_hint}」の管理画面はもうできています。弊社がこのお客様として映像・価格などを先に設定しておくと、お客様は登録後すぐに使い始められます。
                  </p>
                </div>
                <AssignedDeviceList
                  title="お渡ししたマシン"
                  devices={handedNames.map((n, i) => ({ id: String(i), name: n }))}
                />
                {assignNotice && (
                  <div role="status" className="rounded-[10px] border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">
                    {assignNotice}
                  </div>
                )}
                <div className="flex flex-wrap gap-2.5">
                  <PrepareButton customerId={invite.customer_id} customerName={invite.company_name_hint} />
                  <Button variant="outline" onClick={() => setAssignOpen(true)}>
                    マシンを追加する
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] font-bold">お客様が登録したら、承認してマシンを割り当てます</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                お客様が登録すると、{NOTIFY_EMAIL} に「承認待ち」のメールが届き、ホームにも表示されます。内容を確かめて、お渡しするマシンを選んでください。
              </p>
            </div>

            {reqLoading && requests.length === 0 ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                申し込みを確認しています…
              </div>
            ) : reqError ? (
              <div className="flex flex-col items-start gap-3">
                <ErrorBox>{reqError}</ErrorBox>
                <Button variant="outline" onClick={() => loadRequests(requestId, invite?.id ?? null)}>
                  もう一度読み込む
                </Button>
              </div>
            ) : !selectedRequest ? (
              <PendingChooser
                requests={requests}
                waitingFor={invite?.company_name_hint ?? null}
                loading={reqLoading}
                onReload={() => loadRequests(null, invite?.id ?? null)}
                onChoose={(id) => setRequestId(id)}
              />
            ) : (
              <>
                <RequestSummary request={selectedRequest} />
                {selectedRequest.customer_id ? (
                  <>
                    <AssignedDeviceList devices={selectedRequest.assigned_devices ?? []} />
                    <StockDevicePicker
                      devices={devices}
                      loading={devLoading}
                      error={devError}
                      onReload={loadDevices}
                      selected={picked}
                      onChange={setPicked}
                      title="追加でお渡しするマシン（任意）"
                      description="まだどのお客様にも割り当てていないマシンだけを表示しています。追加しないで承認することもできます。"
                    />
                    {picked.length > 0 && <OwnershipNotice />}
                  </>
                ) : (
                  <StockDevicePicker
                    devices={devices}
                    loading={devLoading}
                    error={devError}
                    onReload={loadDevices}
                    selected={picked}
                    onChange={setPicked}
                  />
                )}
                {approveError && <ErrorBox>{approveError}</ErrorBox>}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  {requests.length > 1 && (
                    <button
                      type="button"
                      className="font-bold text-foreground underline-offset-4 hover:underline"
                      onClick={() => { setRequestId(null); setPicked([]); }}
                    >
                      ほかの申し込みを選ぶ
                    </button>
                  )}
                  <button
                    type="button"
                    className="font-bold text-destructive underline-offset-4 hover:underline"
                    onClick={() => setRejectOpen(true)}
                  >
                    この申し込みをお断りする
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 4 && done && (
          <div className="flex flex-col items-start gap-[18px]">
            <DoneMark />
            {done.kind === 'approved' ? (
              <>
                <h2 className="text-[22px] font-bold">承認しました</h2>
                <p className="text-[15px] leading-[1.8] text-foreground/80">
                  {done.request.company_name}（{done.request.email}）に「ご利用いただけるようになりました」というメールが届きます（{NOTIFY_EMAIL} にも控えが届きます）。
                  <br />
                  お客様は、ご自身で決めたメールアドレスとパスワードでログインできます。
                  {done.count > 0 ? <><br />お渡ししたマシン：{done.count}台</> : <><br />マシンはまだ割り当てていません。後から「お客様にマシンを追加する」で割り当てられます。</>}
                </p>
                <div className="rounded-[10px] bg-secondary px-[18px] py-4 text-sm leading-[1.8] text-foreground/80">
                  お客様の画面を代わりに操作したいときは、「お客様」一覧から「このお客様として操作する」を押してください。
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[22px] font-bold">お断りしました</h2>
                <p className="text-[15px] leading-[1.8] text-foreground/80">
                  {done.request.company_name}（{done.request.email}）にお断りのメールが届きます。
                </p>
              </>
            )}
            <div className="flex flex-wrap gap-2.5">
              <Button asChild variant="secondary" className="h-12 px-6 text-[15px]">
                <Link href="/">ホームに戻る</Link>
              </Button>
              <Button variant="outline" className="h-12 px-6 text-[15px]" onClick={restart}>
                別のお客様の登録リンクを作る
              </Button>
            </div>
          </div>
        )}

        {step < 4 && (
          <div className="flex flex-wrap justify-between gap-2.5 border-t pt-5">
            <Button
              variant="outline"
              className={cn('h-12 px-6 text-base', !canBack && 'invisible')}
              onClick={onBack}
              disabled={!canBack}
            >
              戻る
            </Button>
            <Button className="h-12 px-7 text-base" onClick={onNext} disabled={nextDisabled}>
              {nextBusy && <Loader2 className="animate-spin" />}
              {nextLabel}
            </Button>
          </div>
        )}
      </section>

      {assignOpen && invite?.customer_id && (
        <AssignDevicesDialog
          customerId={invite.customer_id}
          customerName={invite.company_name_hint}
          onClose={() => setAssignOpen(false)}
          onAssigned={(n, names) => {
            setAssignOpen(false);
            setHandedNames((cur) => [...cur, ...names]);
            setAssignNotice(`${n}台のマシンをお渡ししました。`);
            signupAdmin.stockDevices().then((list) => setDevices(list)).catch(() => {});
          }}
        />
      )}

      {rejectOpen && selectedRequest && (
        <RejectDialog
          request={selectedRequest}
          onClose={() => setRejectOpen(false)}
          onRejected={() => {
            setRejectOpen(false);
            setDone({ kind: 'rejected', request: selectedRequest, count: 0 });
            setStep(4);
          }}
        />
      )}
    </div>
  );
}

function PendingChooser({
  requests,
  waitingFor,
  loading,
  onReload,
  onChoose,
}: {
  requests: SignupRequest[];
  waitingFor: string | null;
  loading: boolean;
  onReload: () => void;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {requests.length === 0 ? (
        <div className="rounded-[10px] bg-secondary px-[18px] py-4 text-sm leading-relaxed text-foreground/80">
          {waitingFor ? `「${waitingFor}」からの登録はまだ届いていません。` : '承認待ちの申し込みはいまはありません。'}
          お客様が登録を終えたら、下のボタンで確かめてください。この画面を閉じても、ホームの「承認待ちのお客様」から続きができます。
        </div>
      ) : (
        <>
          <div className="text-sm text-foreground/80">
            {waitingFor
              ? `「${waitingFor}」向けのリンクからの登録はまだ見つかりません。承認待ちの申し込みから選ぶこともできます。`
              : '承認する申し込みを選んでください。'}
          </div>
          <div className="flex flex-col gap-2">
            {requests.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onChoose(r.id)}
                className="flex min-h-[56px] w-full flex-wrap items-center justify-between gap-2 rounded-[10px] border bg-card px-4 py-3.5 text-left hover:bg-accent"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-base font-bold">{r.company_name}</span>
                  <span className="break-all text-[13px] text-muted-foreground">
                    {r.contact_name}・{r.email}
                  </span>
                </span>
                <span className="text-[13px] text-muted-foreground">申し込み {fmtDate(r.verified_at ?? r.created_at)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <Button variant="outline" className="self-start" onClick={onReload} disabled={loading}>
        {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        登録されたか確かめる
      </Button>
    </div>
  );
}
