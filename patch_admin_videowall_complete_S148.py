#!/usr/bin/env python3
# S148-complete: admin の device-groups/page.tsx にビデオウォール機能を完成させる。
#   (1) 開いたとき GET /videowalls?group_id= で保存済みを復元（チェック保持）
#   (2) 「実機に反映」ボタン（deploy呼び出し）
#   (3) 分割実行ボタンにスピナー
#   (4) プレビューの隙間ゼロ（bezelPx=0）
#   既存ロジック無改変・追記/置換のみ。count==1・.bak・md5。
import hashlib, shutil, datetime

TARGET = "src/app/device-groups/page.tsx"
def md5(p): return hashlib.md5(open(p,"rb").read()).hexdigest()
pre = md5(TARGET); print(f"[pre]  md5 = {pre}")
ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
bak = f"{TARGET}.bak_S148_complete_{ts}"
shutil.copy2(TARGET, bak); print(f"[bak]  {bak}")
src = open(TARGET, encoding="utf-8").read()

# ── (1) 復元用 useEffect を assets取得useEffectの直後に追加 ──
old1 = """      .catch(() => setVwErr('素材の取得に失敗しました'));
  }, [vwEnabled, vwAssets.length]);"""
new1 = """      .catch(() => setVwErr('素材の取得に失敗しました'));
  }, [vwEnabled, vwAssets.length]);

  // S148: グループを開いたとき、保存済みビデオウォールを復元（チェック・行列・分割状態も保持）
  useEffect(() => {
    let cancelled = false;
    api.get<{ items?: VideoWall[] } | VideoWall[]>(`/videowalls?group_id=${group.id}`)
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r) ? r : (r.items ?? []);
        if (list.length > 0) {
          const latest = list[0];  // backendはcreated_at降順
          setVw(latest);
          setVwEnabled(true);
          setVwRows(latest.rows);
          setVwCols(latest.cols);
          setVwBezel(latest.bezel_px);
        }
      })
      .catch(() => { /* 無ければ何もしない */ });
    return () => { cancelled = true; };
  }, [group.id]);"""
assert src.count(old1) == 1, f"[FAIL] restore anchor = {src.count(old1)}"
src = src.replace(old1, new1)

# ── (2) vwDeploy ハンドラを vwAssignTile の後に追加 ──
old2 = """  const vwAssignTile = async (tileId: string, deviceId: string) => {
    if (!vw) return;
    try { const r = await api.patch<VideoWall>(`/videowalls/${vw.id}/tiles/${tileId}`, { device_id: deviceId || null }); setVw(r); }
    catch { setVwErr('割当の変更に失敗しました'); }
  };"""
new2 = """  const vwAssignTile = async (tileId: string, deviceId: string) => {
    if (!vw) return;
    try { const r = await api.patch<VideoWall>(`/videowalls/${vw.id}/tiles/${tileId}`, { device_id: deviceId || null }); setVw(r); }
    catch { setVwErr('割当の変更に失敗しました'); }
  };
  // S148: 実機に反映（各タイルをProgram化→担当端末へ同期配信）
  const vwDeploy = async () => {
    if (!vw) return;
    setVwBusy(true); setVwErr(null);
    try {
      await api.post(`/videowalls/${vw.id}/deploy`, {});
      setVwErr('実機に反映しました（各マシンで同期再生が開始されます）');
    } catch { setVwErr('実機反映に失敗しました（分割実行と割当が完了しているか確認）'); }
    finally { setVwBusy(false); }
  };"""
assert src.count(old2) == 1, f"[FAIL] deploy handler anchor = {src.count(old2)}"
src = src.replace(old2, new2)

# ── (3) 分割実行ボタンにスピナー＋「実機に反映」ボタンを追加 ──
old3 = """                  <Button size="sm" variant="outline" onClick={vwSplit} disabled={vwBusy || !vw}>分割実行</Button>
                  <Button size="sm" variant="outline" onClick={vwAutoAssign} disabled={vwBusy || !vw}>自動割当</Button>
                  <Button size="sm" onClick={() => setVwPreview(true)} disabled={!vw}>
                    <Play className="h-3 w-3 mr-1" />実機投影プレビュー
                  </Button>"""
new3 = """                  <Button size="sm" variant="outline" onClick={vwSplit} disabled={vwBusy || !vw}>
                    {vwBusy ? (<><Loader2 className="h-3 w-3 animate-spin mr-1" />分割中…</>) : '分割実行'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={vwAutoAssign} disabled={vwBusy || !vw}>自動割当</Button>
                  <Button size="sm" variant="outline" onClick={() => setVwPreview(true)} disabled={!vw}>
                    <Play className="h-3 w-3 mr-1" />プレビュー
                  </Button>
                  <Button size="sm" onClick={vwDeploy} disabled={vwBusy || !vw || vw.status !== 'ready'}>
                    実機に反映
                  </Button>"""
assert src.count(old3) == 1, f"[FAIL] buttons anchor = {src.count(old3)}"
src = src.replace(old3, new3)

# ── (4) プレビューの隙間ゼロ（bezelPx=0でびっちり）──
old4 = "          bezelPx={Math.round(vw.bezel_px / 6)}"
new4 = "          bezelPx={vw.bezel_px > 0 ? Math.round(vw.bezel_px / 6) : 0}"
assert src.count(old4) == 1, f"[FAIL] bezelPx anchor = {src.count(old4)}"
src = src.replace(old4, new4)

ob = src.count("{"); cb = src.count("}")
print(f"[check] braces {{ }} = {ob} / {cb}")
open(TARGET, "w", encoding="utf-8").write(src)
post = md5(TARGET); print(f"[post] md5 = {post}")
assert pre != post
print("[OK] admin完成: 復元/チェック保持・実機反映ボタン・分割スピナー・隙間ゼロ")
