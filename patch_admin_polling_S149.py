#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
S149-admin: ビデオウォール分割UIの改善（page.tsx + VideoWallPreviewModal.tsx）
  1. vwSplit をポーリング化: split開始→ready/failedまで監視。経過秒数表示。
     ready時に auto-assign を自動実行（課題4: 2ステップ化）。
  2. プレビューモーダルの×/背景クリックが親Dialogへ伝播して一覧に戻る不具合を修正。
  安全策: count==1 assert / .bak / md5。バックエンドは一切触らない。
"""
import hashlib, os, shutil, sys, time

PAGE = "src/app/device-groups/page.tsx"
MODAL = "src/components/videowall/VideoWallPreviewModal.tsx"
# サンドボックス検証時のフォールバック
if not os.path.exists(PAGE):
    PAGE = "page_fragment.tsx"
if not os.path.exists(MODAL):
    MODAL = "VideoWallPreviewModal.tsx"

def md5(s): return hashlib.md5(s.encode("utf-8")).hexdigest()

def patch_file(path, edits, label):
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    before = md5(src)
    print(f"[INFO] {label}: {path}")
    print(f"[INFO]   before md5 = {before}")
    for i, (old, new) in enumerate(edits, 1):
        cnt = src.count(old)
        assert cnt == 1, f"[FAIL] {label} edit{i} anchor count={cnt}"
        src = src.replace(old, new)
        print(f"[OK]   edit{i} applied")
    bak = f"{path}.bak_{int(time.time())}"
    shutil.copy2(path, bak)
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"[OK]   backup = {bak}")
    print(f"[OK]   after md5 = {md5(src)}")
    return True

# ── PAGE 編集: vwSplit をポーリング化 ──
OLD_VWSPLIT = """  const vwSplit = async () => {
    if (!vw) return; setVwBusy(true); setVwErr(null);
    try { const r = await api.post<VideoWall>(`/videowalls/${vw.id}/split`, {}); setVw(r); }
    catch { setVwErr('分割の開始に失敗しました'); } finally { setVwBusy(false); }
  };"""

NEW_VWSPLIT = """  // S149: split開始→ready/failedまでポーリング。経過秒数を表示し、
  //       ready到達時に auto-assign まで自動実行（分割→反映の2ステップ化）。
  const vwSplit = async () => {
    if (!vw) return;
    const wallId = vw.id;
    setVwBusy(true); setVwErr(null); setVwSplitSec(0);
    try {
      const started = await api.post<VideoWall>(`/videowalls/${wallId}/split`, {});
      setVw(started);
      const t0 = Date.now();
      const TIMEOUT_MS = 240000; // 1コアVPSで余裕を見て4分
      // 1秒ごとに経過秒数を更新、3秒ごとに状態を取得
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((res) => setTimeout(res, 1000));
        const sec = Math.floor((Date.now() - t0) / 1000);
        setVwSplitSec(sec);
        if (Date.now() - t0 > TIMEOUT_MS) {
          setVwErr('分割がタイムアウトしました。ログを確認してください。');
          break;
        }
        if (sec % 3 !== 0) continue;
        let latest: VideoWall | null = null;
        try {
          const list = await api.get<{ items?: VideoWall[] } | VideoWall[]>(`/videowalls?group_id=${group.id}`);
          const arr = Array.isArray(list) ? list : (list.items ?? []);
          latest = arr.find((w) => w.id === wallId) ?? null;
        } catch { /* 一時的な失敗は無視して継続 */ }
        if (!latest) continue;
        if (latest.status === 'ready') {
          // ready到達 → 自動割当まで自動実行
          try {
            const assigned = await api.post<VideoWall>(`/videowalls/${wallId}/auto-assign`, {});
            setVw(assigned);
            setVwErr('分割と自動割当が完了しました。「実機に反映」を押してください。');
          } catch {
            setVw(latest);
            setVwErr('分割は完了しましたが自動割当に失敗しました。手動で割り当ててください。');
          }
          break;
        }
        if (latest.status === 'failed') {
          setVw(latest);
          setVwErr('分割に失敗しました。ログを確認してください。');
          break;
        }
        setVw(latest); // splitting中も状態を反映
      }
    } catch {
      setVwErr('分割の開始に失敗しました');
    } finally {
      setVwBusy(false); setVwSplitSec(0);
    }
  };"""

# ── PAGE 編集: vwSplitSec state を追加（vwPreview stateの直後）──
OLD_STATE = "  const [vwPreview, setVwPreview] = useState(false);"
NEW_STATE = """  const [vwPreview, setVwPreview] = useState(false);
  const [vwSplitSec, setVwSplitSec] = useState(0); // S149: 分割の経過秒数表示用"""

page_edits = [(OLD_STATE, NEW_STATE), (OLD_VWSPLIT, NEW_VWSPLIT)]

# ── PAGE 編集: ボタンのクルクル表示に経過秒数を出す ──
OLD_BTN = """                  <Button size="sm" variant="outline" onClick={vwSplit} disabled={vwBusy || !vw}>
                    {vwBusy ? (<><Loader2 className="h-3 w-3 animate-spin mr-1" />分割中…</>) : '分割実行'}
                  </Button>"""
NEW_BTN = """                  <Button size="sm" variant="outline" onClick={vwSplit} disabled={vwBusy || !vw}>
                    {vwBusy ? (<><Loader2 className="h-3 w-3 animate-spin mr-1" />分割中… {vwSplitSec}秒</>) : '分割実行'}
                  </Button>"""
page_edits.append((OLD_BTN, NEW_BTN))

patch_file(PAGE, page_edits, "PAGE")
print()

# ── MODAL 編集: 背景onClickで伝播停止（親Dialogへ漏らさない）──
OLD_MODAL_ROOT = """    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(5,7,11,0.86)\","""
NEW_MODAL_ROOT = """    <div
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed", inset: 0, background: "rgba(5,7,11,0.86)\","""

# ── MODAL 編集: ×ボタンも伝播停止 ──
OLD_X = """          <button onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#8b94a6", fontSize: 22, cursor: "pointer" }}>×</button>"""
NEW_X = """          <button onClick={(e) => { e.stopPropagation(); onClose(); }}
            style={{ background: "transparent", border: "none", color: "#8b94a6", fontSize: 22, cursor: "pointer" }}>×</button>"""

modal_edits = [(OLD_MODAL_ROOT, NEW_MODAL_ROOT), (OLD_X, NEW_X)]
patch_file(MODAL, modal_edits, "MODAL")
print()
print("[DONE] admin patch applied. push前に npm run build で確認してください。")
