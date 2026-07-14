#!/usr/bin/env node
/* S183c: admin に pulse_unit_yen 対応を追加（自己検証型・既存非破壊）
 *   page.tsx:
 *     (1) DeviceDetail 型に pulse_unit_yen?: number
 *     (2) savingPulseUnit / pulseUnitInput state
 *     (3) handlePulseUnitSave handler（handleLocaleToggle の後）
 *     (4) UI 欄（isSuperAdmin ブロック内・qr_locale の後）
 *   dictionaries.ts:
 *     (5) ja / en の pricing.qr に pulseUnit ラベル群
 *   鉄則: md5照合 → アンカー count==1 → .bak → 置換
 *   検証は本スクリプト後に `npx tsc --noEmit`。
 */
const fs = require('fs');
const crypto = require('crypto');

const STAMP = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);

const PAGE = 'src/app/devices/[id]/page.tsx';
const DICT = 'src/i18n/dictionaries.ts';
const EXPECT = {
  [PAGE]: '0baeb97ca56e93ea072fe0b2e9595a81',
  [DICT]: 'e27a0ab34601f7912c3733ecd584d44d',
};

function die(m) { console.error('[FATAL] ' + m); process.exit(1); }
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }

for (const [p, want] of Object.entries(EXPECT)) {
  const got = md5(p);
  if (got !== want) die(`md5 mismatch ${p}: got ${got} want ${want}`);
}
console.log('[OK] md5照合 通過');

function replaceOnce(text, anchor, next, tag) {
  const idx = text.indexOf(anchor);
  if (idx === -1) die(`[${tag}] anchor not found`);
  if (text.indexOf(anchor, idx + anchor.length) !== -1) die(`[${tag}] anchor appears >1 time`);
  return text.slice(0, idx) + next + text.slice(idx + anchor.length);
}

// ============================================================
// page.tsx
// ============================================================
let page = fs.readFileSync(PAGE, 'utf8');

// (1) 型: qr_locale?: string; の直後に pulse_unit_yen?: number;
const T_ANCHOR = '  qr_locale?: string;\n';
page = replaceOnce(page, T_ANCHOR,
  '  qr_locale?: string;\n  pulse_unit_yen?: number;\n', 'type');
console.log('[OK] (1) 型に pulse_unit_yen 追加');

// (2) state: savingLocale 宣言の隣に savingPulseUnit / pulseUnitInput
const S_ANCHOR = '  const [savingLocale, setSavingLocale] = useState(false);\n';
page = replaceOnce(page, S_ANCHOR,
  S_ANCHOR +
  '  const [savingPulseUnit, setSavingPulseUnit] = useState(false);\n' +
  '  const [pulseUnitInput, setPulseUnitInput] = useState<string>(\'\');\n',
  'state');
console.log('[OK] (2) state 追加');

// (3) handler: handleLocaleToggle の閉じ } の後に handlePulseUnitSave
//     アンカー = handleLocaleToggle 関数末尾〜handleEffectChange 直前
const H_ANCHOR =
  '  const handleEffectChange = async (val: string) => {\n';
const H_NEW =
  '  const handlePulseUnitSave = async () => {\n' +
  '    const raw = (pulseUnitInput ?? \'\').trim();\n' +
  '    if (raw === \'\') return;\n' +
  '    const unit = parseInt(raw, 10);\n' +
  '    if (!Number.isFinite(unit) || unit < 1) {\n' +
  '      alert(\'1パルス単価は1以上の整数で入力してください\');\n' +
  '      return;\n' +
  '    }\n' +
  '    if (unit === (baseDetail?.pulse_unit_yen ?? 100)) return; // 変化なしは保存しない\n' +
  '    setSavingPulseUnit(true);\n' +
  '    try {\n' +
  '      await api.patch(`/devices/${params.id}/pulse_unit_yen`, { pulse_unit_yen: unit });\n' +
  '      setBaseDetail((prev) => (prev ? { ...prev, pulse_unit_yen: unit } : prev));\n' +
  '    } catch (e) {\n' +
  '      alert(e instanceof ApiError ? (e.problem.detail || e.problem.title) : \'保存に失敗しました\');\n' +
  '    } finally {\n' +
  '      setSavingPulseUnit(false);\n' +
  '    }\n' +
  '  };\n' +
  '\n';
page = replaceOnce(page, H_ANCHOR, H_NEW + H_ANCHOR, 'handler');
console.log('[OK] (3) handlePulseUnitSave 追加');

// (4) UI: qr_locale の localeNote <p> の直後、isSuperAdmin ブロック閉じ </div> の前
const U_ANCHOR =
  '                        <p className="text-xs text-muted-foreground">{t.pricing.qr.localeNote}</p>\n' +
  '                      </div>\n' +
  '                      )}\n';
const U_NEW =
  '                        <p className="text-xs text-muted-foreground">{t.pricing.qr.localeNote}</p>\n' +
  '                        {/* S183: 1パルス単価（円）— 運営専用。什器コインアクセプタ物理設定と一致必須。 */}\n' +
  '                        <div className="pt-2 space-y-1">\n' +
  '                          <div className="flex items-center gap-2">\n' +
  '                            <span className="text-sm font-medium">{t.pricing.pulseUnit.label}</span>\n' +
  '                            {savingPulseUnit && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}\n' +
  '                          </div>\n' +
  '                          <div className="flex items-center gap-2">\n' +
  '                            <input type="number" inputMode="numeric" min={1}\n' +
  '                              className="w-32 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"\n' +
  '                              value={pulseUnitInput === \'\' ? String(detail.pulse_unit_yen ?? 100) : pulseUnitInput}\n' +
  '                              disabled={savingPulseUnit}\n' +
  '                              onChange={(e) => setPulseUnitInput(e.target.value)}\n' +
  '                              onBlur={() => void handlePulseUnitSave()} />\n' +
  '                            <span className="text-sm text-muted-foreground">{t.pricing.pulseUnit.suffix}</span>\n' +
  '                          </div>\n' +
  '                          {(() => {\n' +
  '                            const unit = parseInt(pulseUnitInput === \'\' ? String(detail.pulse_unit_yen ?? 100) : pulseUnitInput, 10);\n' +
  '                            const price = parseInt(setPrice, 10);\n' +
  '                            if (!Number.isFinite(unit) || unit < 1) return null;\n' +
  '                            if (!Number.isFinite(price) || price < 1) return (\n' +
  '                              <p className="text-xs text-muted-foreground">{t.pricing.pulseUnit.note}</p>\n' +
  '                            );\n' +
  '                            const pulses = Math.floor(price / unit);\n' +
  '                            const indivisible = price % unit !== 0;\n' +
  '                            const over9 = pulses > 9;\n' +
  '                            return (\n' +
  '                              <div className="text-xs space-y-0.5">\n' +
  '                                <p className="text-muted-foreground">{price}{t.pricing.pulseUnit.exampleMid}{unit}{t.pricing.pulseUnit.exampleTail}{pulses}{t.pricing.pulseUnit.pulseWord}</p>\n' +
  '                                {over9 && <p className="text-red-600 dark:text-red-400">{t.pricing.pulseUnit.warnOver9}</p>}\n' +
  '                                {indivisible && <p className="text-amber-600 dark:text-amber-400">{t.pricing.pulseUnit.warnIndivisible}</p>}\n' +
  '                              </div>\n' +
  '                            );\n' +
  '                          })()}\n' +
  '                          <p className="text-xs text-muted-foreground">{t.pricing.pulseUnit.note}</p>\n' +
  '                        </div>\n' +
  '                      </div>\n' +
  '                      )}\n';
page = replaceOnce(page, U_ANCHOR, U_NEW, 'ui');
console.log('[OK] (4) UI 欄追加');

// 簡易ブラケット均衡チェック（雑だが破損検知の一助）
for (const ch of [['{', '}'], ['(', ')']]) {
  const o = (page.match(new RegExp('\\' + ch[0], 'g')) || []).length;
  const c = (page.match(new RegExp('\\' + ch[1], 'g')) || []).length;
  if (o !== c) die(`page.tsx bracket imbalance ${ch[0]}${ch[1]}: ${o} vs ${c}`);
}
console.log('[OK] page.tsx ブラケット均衡');

// ============================================================
// dictionaries.ts
// ============================================================
let dict = fs.readFileSync(DICT, 'utf8');

// (5-ja) localeNote(ja) の直後に pulseUnit(ja)
const JA_ANCHOR =
  '      localeNote: "ONにするとモニターのQR画面が英語表示になります（金額はドル換算・100円=$1.00）",\n' +
  '    },\n';
const JA_NEW =
  '      localeNote: "ONにするとモニターのQR画面が英語表示になります（金額はドル換算・100円=$1.00）",\n' +
  '    },\n' +
  '    pulseUnit: {\n' +
  '      label: "1パルス単価（円）",\n' +
  '      suffix: "円 ／ 1パルス（運営専用）",\n' +
  '      note: "什器のコインアクセプタ物理設定（1パルス＝何円）と必ず一致させてください。高額什器はこの値を上げてパルス数を9以下に抑えます。",\n' +
  '      exampleMid: "円 ÷ ",\n' +
  '      exampleTail: "円 = ",\n' +
  '      pulseWord: "パルス",\n' +
  '      warnOver9: "⚠ パルス数が9を超えています。什器は最大9パルスまでしか出せません。単価を上げてください。",\n' +
  '      warnIndivisible: "△ 料金が単価で割り切れません。端数はパルスに反映されません（切り捨て）。",\n' +
  '    },\n';
dict = replaceOnce(dict, JA_ANCHOR, JA_NEW, 'dict-ja');
console.log('[OK] (5-ja) 辞書 ja pulseUnit 追加');

// (5-en) localeNote(en) の直後に pulseUnit(en)
const EN_ANCHOR =
  '      localeNote: "When on, the monitor QR screen is shown in English (amount in USD, 100 yen = $1.00).",\n' +
  '    },\n';
const EN_NEW =
  '      localeNote: "When on, the monitor QR screen is shown in English (amount in USD, 100 yen = $1.00).",\n' +
  '    },\n' +
  '    pulseUnit: {\n' +
  '      label: "Yen per pulse",\n' +
  '      suffix: "yen / pulse (operator only)",\n' +
  '      note: "Must match the coin acceptor\'s physical setting (yen per pulse). For high-value machines, raise this to keep pulses at 9 or fewer.",\n' +
  '      exampleMid: " yen / ",\n' +
  '      exampleTail: " yen = ",\n' +
  '      pulseWord: " pulses",\n' +
  '      warnOver9: "\\u26A0 Pulses exceed 9. The machine can emit at most 9 pulses. Increase the unit.",\n' +
  '      warnIndivisible: "\\u25B3 Price is not divisible by the unit. The remainder is dropped (floor).",\n' +
  '    },\n';
dict = replaceOnce(dict, EN_ANCHOR, EN_NEW, 'dict-en');
console.log('[OK] (5-en) 辞書 en pulseUnit 追加');

// ============================================================
// 書き込み
// ============================================================
for (const [p, out] of [[PAGE, page], [DICT, dict]]) {
  const bak = `${p}.bak_S183c_${STAMP}`;
  fs.copyFileSync(p, bak);
  fs.writeFileSync(p, out, 'utf8');
  console.log(`[OK] wrote ${p}  (backup: ${bak})`);
}
console.log('[DONE] S183c admin パッチ適用完了。次: npx tsc --noEmit → npm run build → デプロイ。');
