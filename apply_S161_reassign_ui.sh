#!/usr/bin/env bash
# ============================================================================
# apply_S161_reassign_ui.sh  (admin フロント / Mac ローカルで実行)
#   端末詳細 overview タブに「所属顧客を変更（運営専用）」Card を追加する。
#   - lv1_super のみ表示（既存 isSuperAdmin ガード）。先方(lv2_admin)には出さない。
#   - 顧客→店舗の2段プルダウン → 確認(preview) → 実行(reassign)。
#   - backend: GET /devices/{id}/reassign-preview, POST /devices/{id}/reassign（S161・適用済）
#
# 実行場所: ~/Documents/gachaops-admin で実行。
#   cd ~/Documents/gachaops-admin && bash apply_S161_reassign_ui.sh
# 安全作法: .bak + アンカーcount==1(python判定) + idempotentマーカー + 自動rollback。
#   ※フロントは py_compile 相当が無いので、適用後に必ず `npm run build` で Error 0 確認。
# ============================================================================
set -euo pipefail

F="src/app/devices/[id]/page.tsx"
TS="$(date +%Y%m%d_%H%M%S)"
BAK="${F}.bak_S161_reassignui_${TS}"
MARKER="/* === S161 reassign UI === */"

if [ ! -f "$F" ]; then
  echo "FATAL: $F が見つかりません。~/Documents/gachaops-admin で実行してください。" >&2
  exit 1
fi

if grep -qF "$MARKER" "$F"; then
  echo "SKIP: 既に S161 reassign UI 適用済み（マーカー検出）。何もしません。"
  exit 0
fi

MD5_BEFORE="$(md5 -q "$F" 2>/dev/null || md5sum "$F" | awk '{print $1}')"
cp -p "$F" "$BAK"
echo "backup: $BAK (md5=$MD5_BEFORE)"

rollback() { echo "ROLLBACK: 元に戻します → $F" >&2; cp -p "$BAK" "$F"; }
trap 'rc=$?; if [ $rc -ne 0 ]; then rollback; fi' EXIT

# ---- 1) state を差し込む（isSuperAdmin 定義の直後）--------------------------
# アンカー(既存217行): const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';
python3 - "$F" <<'PYEOF'
import sys, io
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()

anchor = "const isSuperAdmin = tokenStore.getUser()?.role === 'lv1_super';"
n = s.count(anchor)
assert n == 1, f"FATAL: isSuperAdmin anchor count={n} (expected 1)"

state = anchor + r"""

  /* === S161 reassign UI (state) === */
  const [reCustList, setReCustList] = useState<{ id: string; name: string }[]>([]);
  const [reStoreList, setReStoreList] = useState<{ id: string; customer_id: string; name: string }[]>([]);
  const [reCustomerId, setReCustomerId] = useState('');
  const [reStoreId, setReStoreId] = useState('');
  const [rePreview, setRePreview] = useState<{
    current_customer_name?: string | null;
    coin_insertion_event_count: number;
    gacha_draw_count: number;
    coin_setting_count: number;
    group_membership_count: number;
    has_dedicated_pool: boolean;
  } | null>(null);
  const [reBusy, setReBusy] = useState(false);
  const [reErr, setReErr] = useState<string | null>(null);
  const [reDone, setReDone] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void (async () => {
      try {
        const cs = await api.get<{ items?: { id: string; name: string }[] } | { id: string; name: string }[]>('/customers?limit=200');
        const cList = Array.isArray(cs) ? cs : (cs.items ?? []);
        setReCustList(cList);
        const ss = await api.get<{ items?: { id: string; customer_id: string; name: string }[] } | { id: string; customer_id: string; name: string }[]>('/stores?limit=200');
        const sList = Array.isArray(ss) ? ss : (ss.items ?? []);
        setReStoreList(sList);
      } catch {
        /* 一覧取得失敗時は付け替えUIを黙って無効化（致命ではない） */
      }
    })();
  }, [isSuperAdmin]);

  const reLoadPreview = useCallback(async () => {
    setReErr(null); setRePreview(null);
    try {
      const pv = await api.get<{
        current_customer_name?: string | null;
        coin_insertion_event_count: number;
        gacha_draw_count: number;
        coin_setting_count: number;
        group_membership_count: number;
        has_dedicated_pool: boolean;
      }>(`/devices/${params.id}/reassign-preview`);
      setRePreview(pv);
    } catch (e) {
      setReErr(e instanceof ApiError ? e.message : '取得に失敗しました');
    }
  }, [params.id]);

  const reExecute = useCallback(async () => {
    if (!reStoreId) return;
    setReBusy(true); setReErr(null);
    try {
      await api.post(`/devices/${params.id}/reassign`, { target_store_id: reStoreId });
      setReDone(true);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setReErr(e instanceof ApiError ? e.message : '付け替えに失敗しました');
    } finally {
      setReBusy(false);
    }
  }, [params.id, reStoreId]);
  /* === /S161 reassign UI (state) === */
"""
s = s.replace(anchor, state, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("state block inserted")
PYEOF

# ---- 2) Card を overview タブ末尾（危険ゾーンの後）に挿入 -------------------
# アンカー: 危険ゾーンCard閉じ 〜 screenshots タブ開始（overview の </TabsContent> は一意にここ）
python3 - "$F" <<'PYEOF'
import sys, io
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()

anchor = """              </Card>
            </TabsContent>

            <TabsContent value="screenshots">"""
n = s.count(anchor)
assert n == 1, f"FATAL: overview close anchor count={n} (expected 1)"

card = """              </Card>

              {/* === S161 reassign UI === */}
              {isSuperAdmin && (
                <Card className="mt-4 border-amber-500/40">
                  <CardHeader>
                    <CardTitle className="text-sm text-amber-400">運営専用：所属顧客を変更（付け替え）</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      この端末を別の顧客・店舗へ付け替えます。運営（lv1_super）のみ表示されます。
                      付け替え時、この端末の<span className="text-amber-400">抽選履歴・コイン投入履歴は削除</span>され、
                      現在のグループからは外れます（価格設定と専用プールは新しい顧客へ引き継がれます）。
                    </p>

                    {reDone ? (
                      <p className="text-sm text-emerald-400">付け替えました。画面を更新します…</p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-muted-foreground">移動先の顧客</label>
                            <Select
                              value={reCustomerId}
                              onValueChange={(v) => { setReCustomerId(v); setReStoreId(''); setRePreview(null); }}
                            >
                              <SelectTrigger><SelectValue placeholder="顧客を選択" /></SelectTrigger>
                              <SelectContent>
                                {reCustList
                                  .filter((c) => c.id !== detail.customer_id)
                                  .map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}（{c.id}）</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <label className="text-xs text-muted-foreground">移動先の店舗</label>
                            <Select
                              value={reStoreId}
                              onValueChange={(v) => setReStoreId(v)}
                              disabled={!reCustomerId}
                            >
                              <SelectTrigger><SelectValue placeholder={reCustomerId ? '店舗を選択' : '先に顧客を選択'} /></SelectTrigger>
                              <SelectContent>
                                {reStoreList
                                  .filter((st) => st.customer_id === reCustomerId)
                                  .map((st) => (
                                    <SelectItem key={st.id} value={st.id}>{st.name}（{st.id}）</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => void reLoadPreview()} disabled={!reStoreId}>
                            影響を確認
                          </Button>
                        </div>

                        {rePreview && (
                          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-1">
                            <div className="text-amber-300 font-medium">この付け替えで起きること</div>
                            <div>現在の顧客: <span className="font-mono">{rePreview.current_customer_name ?? detail.customer_id}</span></div>
                            <div>削除される抽選履歴: <span className="tabular-nums">{rePreview.gacha_draw_count}</span> 件</div>
                            <div>削除されるコイン投入履歴: <span className="tabular-nums">{rePreview.coin_insertion_event_count}</span> 件</div>
                            <div>外れるグループ所属: <span className="tabular-nums">{rePreview.group_membership_count}</span> 件</div>
                            <div>引き継ぐ価格設定: <span className="tabular-nums">{rePreview.coin_setting_count}</span> 件{rePreview.has_dedicated_pool ? '・専用プールあり' : ''}</div>
                          </div>
                        )}

                        {reErr && <p className="text-xs text-red-400">{reErr}</p>}

                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void reExecute()}
                          disabled={reBusy || !reStoreId || !rePreview}
                        >
                          {reBusy ? '付け替え中…' : 'この端末を選択した顧客へ付け替える'}
                        </Button>
                        {!rePreview && reStoreId && (
                          <p className="text-[11px] text-muted-foreground">※先に「影響を確認」を押してください。</p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
              {/* === /S161 reassign UI === */}
            </TabsContent>

            <TabsContent value="screenshots">"""
s = s.replace(anchor, card, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("reassign Card inserted")
PYEOF

# ---- 3) マーカー確認 --------------------------------------------------------
grep -qF "$MARKER" "$F" || { echo "FATAL: マーカー未挿入。" >&2; exit 1; }

MD5_AFTER="$(md5 -q "$F" 2>/dev/null || md5sum "$F" | awk '{print $1}')"
echo "----------------------------------------------------------------"
echo "S161 reassign UI 適用完了"
echo "  before md5: $MD5_BEFORE"
echo "  after  md5: $MD5_AFTER"
echo "  backup    : $BAK"
echo "次: npm run build で Error 0 を確認 → named git add → push（Vercel自動デプロイ）"
echo "----------------------------------------------------------------"

trap - EXIT
exit 0
