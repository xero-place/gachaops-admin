#!/usr/bin/env python3
# S148: device-groups/page.tsx のグループ編集モーダルに「ビデオウォール分割」セクションを追記。
# 既存の state/handleSave/JSX には一切触れない。4箇所を追記するのみ。
# count==1・.bak・md5。JSXのため構文の機械検証は最小（balance確認）。
import hashlib, shutil, datetime

TARGET = "src/app/device-groups/page.tsx"
def md5(p): return hashlib.md5(open(p,"rb").read()).hexdigest()

pre = md5(TARGET); print(f"[pre]  md5 = {pre}")
ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
bak = f"{TARGET}.bak_S148_videowall_{ts}"
shutil.copy2(TARGET, bak); print(f"[bak]  {bak}")

src = open(TARGET, encoding="utf-8").read()

# ── 編集1: import に VideoWallPreviewModal と Monitor アイコンを追加 ──
old1 = "import { Loader2, Layers3, ChevronRight, Plus, Link2, Sparkles, Crown, Trash2, AlertTriangle } from 'lucide-react';\n"
new1 = ("import { Loader2, Layers3, ChevronRight, Plus, Link2, Sparkles, Crown, Trash2, AlertTriangle, Grid3x3, Play } from 'lucide-react';\n"
        "import VideoWallPreviewModal from '@/components/videowall/VideoWallPreviewModal';\n")
assert src.count(old1) == 1, f"[FAIL] import anchor = {src.count(old1)}"
src = src.replace(old1, new1)

# ── 編集2: ビデオウォール用の型を DeviceLite 付近に追加 ──
old2 = "type DeviceLite = { id: string; name?: string; status?: string; current_program_name?: string | null };\n"
new2 = (old2 +
        "type VwAssetLite = { id: string; name: string; type?: string };\n"
        "type VwTile = { id: string; row: number; col: number; position_index: number; tile_asset_id?: string | null; device_id?: string | null; tile_asset_url?: string | null };\n"
        "type VideoWall = { id: string; name: string; rows: number; cols: number; bezel_px: number; status: string; tiles: VwTile[] };\n")
assert src.count(old2) == 1, f"[FAIL] type anchor = {src.count(old2)}"
src = src.replace(old2, new2)

# ── 編集3: GroupEditDialog 内に state を追加（error state の直後）──
# アンカー: GroupEditDialog の saving/error 宣言（279行群の最後 = restProgramId の後）
old3 = "  const [restProgramId, setRestProgramId] = useState<string>(initialRest);  // S145\n  const [saving, setSaving] = useState(false);\n  const [error, setError] = useState<string | null>(null);\n"
new3 = (old3 +
        "  // S148: ビデオウォール分割\n"
        "  const [vwEnabled, setVwEnabled] = useState(false);\n"
        "  const [vwAssets, setVwAssets] = useState<VwAssetLite[]>([]);\n"
        "  const [vwSourceId, setVwSourceId] = useState<string>('');\n"
        "  const [vwRows, setVwRows] = useState<number>(1);\n"
        "  const [vwCols, setVwCols] = useState<number>(group.members.length || 2);\n"
        "  const [vwBezel, setVwBezel] = useState<number>(0);  // 実測デフォルト（後で確定）\n"
        "  const [vw, setVw] = useState<VideoWall | null>(null);\n"
        "  const [vwBusy, setVwBusy] = useState(false);\n"
        "  const [vwPreview, setVwPreview] = useState(false);\n"
        "  const [vwErr, setVwErr] = useState<string | null>(null);\n"
        "\n"
        "  useEffect(() => {\n"
        "    if (!vwEnabled || vwAssets.length) return;\n"
        "    api.get<{ items?: VwAssetLite[] } | VwAssetLite[]>('/assets?limit=200')\n"
        "      .then((r) => {\n"
        "        const list = Array.isArray(r) ? r : (r.items ?? []);\n"
        "        setVwAssets(list.filter((a) => (a.type ?? 'video') === 'video'));\n"
        "      })\n"
        "      .catch(() => setVwErr('素材の取得に失敗しました'));\n"
        "  }, [vwEnabled, vwAssets.length]);\n"
        "\n"
        "  const vwCreate = async () => {\n"
        "    if (!vwSourceId) { setVwErr('元動画を選択してください'); return; }\n"
        "    const n = vwRows * vwCols;\n"
        "    if (n < 2 || n > 20) { setVwErr('台数は2〜20の範囲です'); return; }\n"
        "    setVwBusy(true); setVwErr(null);\n"
        "    try {\n"
        "      const created = await api.post<VideoWall>('/videowalls', {\n"
        "        name: `${name}_wall`, source_asset_id: vwSourceId,\n"
        "        rows: vwRows, cols: vwCols, bezel_px: vwBezel, device_group_id: group.id,\n"
        "      });\n"
        "      setVw(created);\n"
        "    } catch { setVwErr('作成に失敗しました（権限・接続を確認）'); }\n"
        "    finally { setVwBusy(false); }\n"
        "  };\n"
        "  const vwSplit = async () => {\n"
        "    if (!vw) return; setVwBusy(true); setVwErr(null);\n"
        "    try { const r = await api.post<VideoWall>(`/videowalls/${vw.id}/split`, {}); setVw(r); }\n"
        "    catch { setVwErr('分割の開始に失敗しました'); } finally { setVwBusy(false); }\n"
        "  };\n"
        "  const vwAutoAssign = async () => {\n"
        "    if (!vw) return; setVwBusy(true); setVwErr(null);\n"
        "    try { const r = await api.post<VideoWall>(`/videowalls/${vw.id}/auto-assign`, {}); setVw(r); }\n"
        "    catch { setVwErr('自動割当に失敗しました'); } finally { setVwBusy(false); }\n"
        "  };\n"
        "  const vwAssignTile = async (tileId: string, deviceId: string) => {\n"
        "    if (!vw) return;\n"
        "    try { const r = await api.patch<VideoWall>(`/videowalls/${vw.id}/tiles/${tileId}`, { device_id: deviceId || null }); setVw(r); }\n"
        "    catch { setVwErr('割当の変更に失敗しました'); }\n"
        "  };\n")
assert src.count(old3) == 1, f"[FAIL] state anchor = {src.count(old3)}"
src = src.replace(old3, new3)

# ── 編集4: メンバーセクション後・DialogFooter直前にJSXブロックを追加 ──
old4 = """            <p className="text-[10px] text-muted-foreground">
              連動再生グループでは、master 端末が同期の基準になります。メンバーに含まれる端末のみ master 指定できます。
            </p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
"""
new4 = """            <p className="text-[10px] text-muted-foreground">
              連動再生グループでは、master 端末が同期の基準になります。メンバーに含まれる端末のみ master 指定できます。
            </p>
          </div>

          {/* S148: ビデオウォール分割 */}
          <div className="space-y-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-xs font-medium">
              <Checkbox checked={vwEnabled} onCheckedChange={() => setVwEnabled((v) => !v)} />
              <Grid3x3 className="h-3.5 w-3.5" />ビデオウォール分割（1映像を複数台に分割投影）
            </label>
            {vwEnabled && (
              <div className="space-y-2 pl-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-[10px] text-muted-foreground">元動画</label>
                    <select className="w-full rounded border bg-background px-2 py-1 text-xs"
                      value={vwSourceId} onChange={(e) => setVwSourceId(e.target.value)}>
                      <option value="">選択してください</option>
                      {vwAssets.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">行</label>
                    <input type="number" min={1} max={20} value={vwRows}
                      onChange={(e) => setVwRows(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded border bg-background px-2 py-1 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">列</label>
                    <input type="number" min={1} max={20} value={vwCols}
                      onChange={(e) => setVwCols(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded border bg-background px-2 py-1 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">ベゼル補正(px)</label>
                    <input type="number" min={0} max={400} value={vwBezel}
                      onChange={(e) => setVwBezel(Math.max(0, Number(e.target.value)))}
                      className="w-full rounded border bg-background px-2 py-1 text-xs" />
                  </div>
                  <div className="flex items-end text-[10px] text-muted-foreground">
                    {vwRows * vwCols} 台に分割
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={vwCreate} disabled={vwBusy || !vwSourceId}>
                    {vwBusy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}作成
                  </Button>
                  <Button size="sm" variant="outline" onClick={vwSplit} disabled={vwBusy || !vw}>分割実行</Button>
                  <Button size="sm" variant="outline" onClick={vwAutoAssign} disabled={vwBusy || !vw}>自動割当</Button>
                  <Button size="sm" onClick={() => setVwPreview(true)} disabled={!vw}>
                    <Play className="h-3 w-3 mr-1" />実機投影プレビュー
                  </Button>
                </div>
                {vw && (
                  <div className="text-[10px] text-muted-foreground">
                    状態: {vw.status}　タイル: {vw.tiles.length}枚
                  </div>
                )}
                {vw && vw.tiles.length > 0 && (
                  <div className="space-y-1">
                    {vw.tiles.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-[10px]">
                        <span className="w-12 text-muted-foreground">R{t.row}C{t.col}</span>
                        <select className="flex-1 rounded border bg-background px-2 py-1"
                          value={t.device_id ?? ''} onChange={(e) => vwAssignTile(t.id, e.target.value)}>
                          <option value="">未割当</option>
                          {devices.filter((d) => memberIds.includes(d.id)).map((d) => (
                            <option key={d.id} value={d.id}>{d.name ?? d.id}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
                {vwErr && <p className="text-[10px] text-red-500">{vwErr}</p>}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
"""
assert src.count(old4) == 1, f"[FAIL] jsx anchor = {src.count(old4)}"
src = src.replace(old4, new4)

# ── 編集5: プレビューモーダルの描画（最後の </Dialog> の直前に挿入）──
# GroupEditDialog の return 末尾 </Dialog> （424行）にプレビューを足す
old5 = """      </DialogContent>
    </Dialog>
  );
}
"""
# 最初の出現（GroupEditDialog）だけに当てたいので、より長い一意アンカーを使う
old5_unique = """          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}"""
new5_unique = """          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
      {vwPreview && vw && (
        <VideoWallPreviewModal
          rows={vw.rows}
          cols={vw.cols}
          bezelPx={Math.max(6, Math.round(vw.bezel_px / 6))}
          tiles={vw.tiles.map((t) => ({
            position_index: t.position_index, row: t.row, col: t.col,
            tile_asset_url: t.tile_asset_url ?? null,
            device_name: devices.find((d) => d.id === t.device_id)?.name ?? null,
          }))}
          onClose={() => setVwPreview(false)}
        />
      )}
    </Dialog>
  );
}"""
assert src.count(old5_unique) == 1, f"[FAIL] preview anchor = {src.count(old5_unique)}"
src = src.replace(old5_unique, new5_unique)

# JSX balance 簡易チェック
ob = src.count("{"); cb = src.count("}")
print(f"[check] braces {{ }} = {ob} / {cb}")
open(TARGET,"w",encoding="utf-8").write(src)
post = md5(TARGET); print(f"[post] md5 = {post}")
assert pre != post
print("[OK] device-groups/page.tsx にビデオウォール分割セクションを追記")
print("    → 次に: npm run build でゼロエラー確認してから push")
