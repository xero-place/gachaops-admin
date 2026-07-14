#!/usr/bin/env bash
# ============================================================================
# apply_S161_onboard_existing.sh  (admin フロント / Mac ローカルで実行)
#   オンボーディング Step3 に「自社ストックから選択」トグルを追加する。
#   109事故（新規作成しかできず既存端末を割り当てられなかった）の入口予防。
#
#   方針（S161確定・案X）:
#     - 既存端末の母集団は「自社(cust_demo=自分のcustomer_id)所属」のみ
#     - 既存選択端末は onboard payload.devices[] に入れない
#     - onboard 成功後、既存端末を対応店舗へ reassign（S161 API 流用）
#       + グループありなら PATCH /device-groups/{group_id} で add_device_ids
#     - 既存端末を master にできるのは「新規端末0台」のときのみ
#       （onboard が "新規端末ありなのに master 不在" を400で弾くため）
#
# 実行: cd ~/Documents/gachaops-admin && bash apply_S161_onboard_existing.sh
# 安全作法: .bak + アンカーcount==1(python) + idempotentマーカー + 自動rollback。
#   適用後は必ず `npm run build` で Error 0 を確認。
# ============================================================================
set -euo pipefail

F="src/app/customers/page.tsx"
TS="$(date +%Y%m%d_%H%M%S)"
BAK="${F}.bak_S161_onbexist_${TS}"
MARKER="/* === S161 onboard existing === */"

if [ ! -f "$F" ]; then
  echo "FATAL: $F が見つかりません。~/Documents/gachaops-admin で実行してください。" >&2
  exit 1
fi
if grep -qF "$MARKER" "$F"; then
  echo "SKIP: 既に S161 onboard existing 適用済み。何もしません。"
  exit 0
fi

MD5_BEFORE="$(md5 -q "$F" 2>/dev/null || md5sum "$F" | awk '{print $1}')"
cp -p "$F" "$BAK"
echo "backup: $BAK (md5=$MD5_BEFORE)"
rollback() { echo "ROLLBACK: 元に戻します → $F" >&2; cp -p "$BAK" "$F"; }
trap 'rc=$?; if [ $rc -ne 0 ]; then rollback; fi' EXIT

python3 - "$F" <<'PYEOF'
import sys, io
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()

def repl(old, new, label):
    n = s_count(old)
    assert n == 1, f"FATAL: anchor '{label}' count={n} (expected 1)"
    return s.replace(old, new, 1)

def s_count(x):
    return s.count(x)

# ---- 0) Select を import に追加（未import）--------------------------------
a0 = "import { tokenStore } from '@/lib/token-store';"
assert s.count(a0) == 1, "import anchor (tokenStore) not unique"
s = s.replace(a0, a0 + "\nimport { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';", 1)

# ---- 1) DeviceForm 型拡張 --------------------------------------------------
a1 = "  id: string; name: string; serial: string; store_index: number; is_master: boolean;"
assert s.count(a1) == 1, "DeviceForm anchor not unique"
s = s.replace(a1,
  "  id: string; name: string; serial: string; store_index: number; is_master: boolean;\n"
  "  /* === S161 onboard existing === */\n"
  "  source_mode: 'new' | 'existing'; existing_device_id: string;",
  1)

# ---- 2) EMPTY_DEVICE 拡張 --------------------------------------------------
a2 = "  id: '', name: '', serial: '', store_index: 0, is_master: false,"
assert s.count(a2) == 1, "EMPTY_DEVICE anchor not unique"
s = s.replace(a2,
  "  id: '', name: '', serial: '', store_index: 0, is_master: false,\n"
  "  source_mode: 'new', existing_device_id: '',",
  1)

# ---- 3) 自社端末一覧 state + fetch（masterCount 定義の直後）----------------
a3 = "  const masterCount = devices.filter((d) => d.is_master).length;"
assert s.count(a3) == 1, "masterCount anchor not unique"
s = s.replace(a3, a3 + r"""

  /* === S161 onboard existing: 自社ストック端末 === */
  const [stockDevices, setStockDevices] = useState<{ id: string; name: string; serial: string; store_name?: string }[]>([]);
  useEffect(() => {
    const myCid = tokenStore.getUser()?.customer_id;
    const isSuper = tokenStore.getUser()?.role === 'lv1_super';
    if (!isSuper || !myCid) return;
    void (async () => {
      try {
        const res = await api.get<{ items?: { id: string; name: string; serial: string; customer_id: string; store_name?: string }[] } | { id: string; name: string; serial: string; customer_id: string; store_name?: string }[]>('/devices?limit=200');
        const arr = Array.isArray(res) ? res : (res.items ?? []);
        // 案X: 自社(cust_demo=自分のcustomer_id)所属のみをストックとして提示
        setStockDevices(arr.filter((d) => d.customer_id === myCid).map((d) => ({ id: d.id, name: d.name, serial: d.serial, store_name: d.store_name })));
      } catch {
        /* 取得失敗時はストック選択を出さない（新規登録のみで運用可能） */
      }
    })();
  }, []);
  const newDeviceCount = devices.filter((d) => d.source_mode === 'new').length;""", 1)

# ---- 4) validate 分岐（既存端末は serial 不要・existing_device_id 必須）----
a4 = "      if (!d.name.trim() || !d.serial.trim()) return '全端末の名前・シリアルは必須です';"
assert s.count(a4) == 1, "validate anchor not unique"
s = s.replace(a4,
  "      /* === S161 onboard existing === */\n"
  "      if (d.source_mode === 'existing') {\n"
  "        if (!d.existing_device_id) return '「自社ストックから選択」の端末が未選択です';\n"
  "        if (d.is_master && newDeviceCount > 0) return '新規登録の端末があるため、既存端末を master にはできません（master は新規端末から選んでください）';\n"
  "        continue;\n"
  "      }\n"
  "      if (!d.name.trim() || !d.serial.trim()) return '全端末の名前・シリアルは必須です';",
  1)

# serial 重複チェックは新規端末のみ対象に（既存はserial空でOK）
a4b = "    const serials = devices.map((d) => d.serial.trim());"
assert s.count(a4b) == 1, "serials anchor not unique"
s = s.replace(a4b,
  "    const serials = devices.filter((d) => d.source_mode === 'new').map((d) => d.serial.trim());",
  1)

# ---- 5) payload.devices は new のみ（既存は除外）---------------------------
a5 = "        devices: devices.map((d) => ({"
assert s.count(a5) == 1, "payload devices anchor not unique"
s = s.replace(a5,
  "        devices: devices.filter((d) => d.source_mode === 'new').map((d) => ({",
  1)

# ---- 6) onboard 成功後、既存端末を reassign + group 追加 -------------------
a6 = "      const res = await api.post<OnboardResult>('/customers/onboard', payload);\n      setResult(res);\n      onCreated();"
assert s.count(a6) == 1, "submit success anchor not unique"
s = s.replace(a6, r"""      const res = await api.post<OnboardResult>('/customers/onboard', payload);

      /* === S161 onboard existing: 既存端末を新顧客へ付け替え + グループ追加 === */
      const existing = devices.filter((d) => d.source_mode === 'existing' && d.existing_device_id);
      for (const d of existing) {
        const targetStoreId = res.store_ids[d.store_index];
        if (!targetStoreId) continue;
        await api.post(`/devices/${d.existing_device_id}/reassign`, { target_store_id: targetStoreId });
      }
      if (res.group_id && existing.length > 0) {
        const addIds = existing.map((d) => d.existing_device_id);
        const existingMaster = existing.find((d) => d.is_master)?.existing_device_id;
        const body: { add_device_ids: string[]; master_device_id?: string } = { add_device_ids: addIds };
        // 既存端末を master にできるのは新規0台時のみ（validateで担保済）
        if (existingMaster && newDeviceCount === 0) body.master_device_id = existingMaster;
        await api.patch(`/device-groups/${res.group_id}`, body);
      }

      setResult(res);
      onCreated();""", 1)

# ---- 7) Step3 UI: 端末カードにトグル + 既存選択プルダウン -----------------
# アンカー: 端末カード内の「端末ID（任意）」Field 〜 master チェックまでを差し替え。
a7 = """                  <Field label="端末ID（任意）">
                    <Input value={d.id} onChange={(e) => setDevice(i, { id: e.target.value })} placeholder={`dev_oga_0${i + 1}`} />
                  </Field>
                  <Field label="端末名 *">
                    <Input value={d.name} onChange={(e) => setDevice(i, { name: e.target.value })} placeholder={`男鹿市役所 #${i + 1}`} />
                  </Field>
                  <Field label="シリアル *">
                    <Input value={d.serial} onChange={(e) => setDevice(i, { serial: e.target.value })} placeholder={`SN-OGA-0${i + 1}`} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={d.is_master} onCheckedChange={(c) => c === true && setMaster(i)} />
                    master（連動グループの基準端末）
                  </label>"""
assert s.count(a7) == 1, f"Step3 UI anchor count={s.count(a7)} (expected 1)"
a7_new = """                  {/* === S161 onboard existing: 登録方法トグル === */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDevice(i, { source_mode: 'new' })}
                      className={`flex-1 h-8 rounded-md text-xs font-medium border transition-colors ${d.source_mode === 'new' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-accent'}`}
                    >新規登録</button>
                    <button
                      type="button"
                      onClick={() => setDevice(i, { source_mode: 'existing' })}
                      className={`flex-1 h-8 rounded-md text-xs font-medium border transition-colors ${d.source_mode === 'existing' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-accent'}`}
                    >自社ストックから選択</button>
                  </div>

                  {d.source_mode === 'new' ? (
                    <>
                      <Field label="端末ID（任意）">
                        <Input value={d.id} onChange={(e) => setDevice(i, { id: e.target.value })} placeholder={`dev_oga_0${i + 1}`} />
                      </Field>
                      <Field label="端末名 *">
                        <Input value={d.name} onChange={(e) => setDevice(i, { name: e.target.value })} placeholder={`男鹿市役所 #${i + 1}`} />
                      </Field>
                      <Field label="シリアル *">
                        <Input value={d.serial} onChange={(e) => setDevice(i, { serial: e.target.value })} placeholder={`SN-OGA-0${i + 1}`} />
                      </Field>
                    </>
                  ) : (
                    <Field label="自社ストックの端末 *">
                      <Select value={d.existing_device_id} onValueChange={(v) => setDevice(i, { existing_device_id: v })}>
                        <SelectTrigger><SelectValue placeholder={stockDevices.length ? '端末を選択' : '自社ストックがありません'} /></SelectTrigger>
                        <SelectContent>
                          {stockDevices.map((sd) => (
                            <SelectItem key={sd.id} value={sd.id}>{sd.name}（{sd.serial}{sd.store_name ? ` / ${sd.store_name}` : ''}）</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={d.is_master} onCheckedChange={(c) => c === true && setMaster(i)} />
                    master（連動グループの基準端末）
                  </label>
                  {d.source_mode === 'existing' && d.is_master && newDeviceCount > 0 && (
                    <p className="text-[11px] text-red-500">新規端末があるため既存端末は master にできません（master は新規から選択）。</p>
                  )}"""
s = s.replace(a7, a7_new, 1)

io.open(p, "w", encoding="utf-8").write(s)
print("all S161 onboard-existing blocks inserted")
PYEOF

grep -qF "$MARKER" "$F" || { echo "FATAL: マーカー未挿入。" >&2; exit 1; }
MD5_AFTER="$(md5 -q "$F" 2>/dev/null || md5sum "$F" | awk '{print $1}')"
echo "----------------------------------------------------------------"
echo "S161 onboard existing 適用完了"
echo "  before md5: $MD5_BEFORE"
echo "  after  md5: $MD5_AFTER"
echo "  backup    : $BAK"
echo "次: npm run build で Error 0 を確認 → named git add → push"
echo "----------------------------------------------------------------"
trap - EXIT
exit 0
