"use client";
// S148/S159: ビデオウォール 実機投影プレビューモーダル
// 実機写真(public/videowall/machine.png)のモニター部分に各タイル映像を matrix3d 射影ではめ込む。
// S159: 実効果モード — sourceUrl があれば、各タイルが「元動画」を共有し、
//   backend compute_tile_crops と同一ロジックで自分の crop 範囲だけを表示する。
//   これにより、入力中のベゼル値を上げると「隠れる部分」が増えて、
//   並べたとき映像が連続する“実際のベゼル補正効果”がリアルタイムに見える。
//   sourceUrl が無い場合は従来どおり焼き済み tile_asset_url にフォールバック。
// S159: 閉じる伝播遮断 — 親(編集 Radix Dialog)へ pointer/click を漏らさず、
//   × を押しても編集モーダルへ正しく戻る。

import { useMemo, useEffect, useState } from "react";

// 実機写真 634x880 上で測ったモニター四隅（px）
const IMGW = 524;
const IMGH = 791;
const TL: [number, number] = [79, 58];
const TR: [number, number] = [439, 58];
const BR: [number, number] = [439, 466];
const BL: [number, number] = [79, 466];

// タイル実解像度（backend と一致：縦長 1024x1280）
const TILE_W = 1024;
const TILE_H = 1280;

type Tile = {
  position_index: number;
  row: number;
  col: number;
  tile_asset_url?: string | null; // 焼き済みタイル動画（フォールバック用）
  device_name?: string | null;
};

type Props = {
  rows: number;
  cols: number;
  bezelPx: number;            // 画面上のタイル間ギャップ（見た目用px）
  machineWidth?: number;      // 1台の表示幅(px)
  tiles: Tile[];              // position_index順
  onClose: () => void;
  sourceUrl?: string | null;  // S159: 元動画URL（実効果モードの素）
  realBezelPx?: number;       // S159: 入力中の実機ベゼル(px, タイル1024基準)
};

function solveHomography(
  src: [number, number][],
  dst: [number, number][]
): number[][] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < n; r++) {
      if (r !== c) {
        const f = A[r][c] / A[c][c];
        for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
  }
  const h = b.map((bi, i) => bi / A[i][i]);
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
}

const PH_COLORS = ["#e2403f","#2a9d9d","#3399cc","#fbb333","#7cc555","#cc3999","#4abbe8","#e77431"];

export default function VideoWallPreviewModal({
  rows, cols, bezelPx, machineWidth = 180, tiles, onClose,
  sourceUrl, realBezelPx = 0,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const MW = machineWidth;
  const SCALE = MW / IMGW;
  // 映像要素のサイズ＝モニター四隅が作る矩形の実寸（表示px）
  const SCREEN_W = (TR[0] - TL[0]) * SCALE;
  const SCREEN_H = (BL[1] - TL[1]) * SCALE;

  const matrix3d = useMemo(() => {
    const src: [number, number][] = [
      [0, 0],
      [SCREEN_W, 0],
      [SCREEN_W, SCREEN_H],
      [0, SCREEN_H],
    ];
    const dst: [number, number][] = [TL, TR, BR, BL].map(
      (p) => [p[0] * SCALE, p[1] * SCALE] as [number, number]
    );
    const H = solveHomography(src, dst);
    const m = [
      H[0][0], H[1][0], 0, H[2][0],
      H[0][1], H[1][1], 0, H[2][1],
      0, 0, 1, 0,
      H[0][2], H[1][2], 0, H[2][2],
    ];
    return `matrix3d(${m.map((v) => v.toFixed(6)).join(",")})`;
  }, [SCALE, SCREEN_W, SCREEN_H]);

  const ordered = useMemo(
    () => [...tiles].sort((a, b) => a.position_index - b.position_index),
    [tiles]
  );

  // S159: 実効果モードの幾何（backend compute_tile_crops と一致）
  // 仮想大画面 wall を SCREEN(表示窓) 基準にスケールし、各タイルは
  // 元動画を wall サイズへ拡大→自タイルの位置だけを表示窓で切り出す。
  const useReal = !!sourceUrl;
  const bz = Math.max(0, realBezelPx);
  // S159 fix: 全て表示px(SCREEN_W/H)基準に統一する。
  // bz はタイル1024px基準なので、表示窓 SCREEN_W 基準へ換算する。
  const bzDisp = bz * (SCREEN_W / TILE_W);   // 横方向ベゼル(表示px)
  const bzDispV = bz * (SCREEN_H / TILE_H);  // 縦方向ベゼル(表示px, タイル縦長を考慮)
  // 元動画(1枚)を「全タイルを並べた仮想大画面」の表示サイズへ拡大する。
  const wallDispW = cols * SCREEN_W + (cols - 1) * bzDisp;
  const wallDispH = rows * SCREEN_H + (rows - 1) * bzDispV;

  // S159: inline panel — shrink each machine so up to ~20 tiles (e.g. 5 cols)
  // still fit inside the edit dialog; grid scrolls if taller than the cap.
  const DISP_MW = Math.max(70, Math.min(MW, Math.floor(760 / Math.max(1, cols))));
  const DISP_SCALE = DISP_MW / IMGW;
  const dScreenW = (TR[0] - TL[0]) * DISP_SCALE;
  const dScreenH = (BL[1] - TL[1]) * DISP_SCALE;
  void dScreenW; void dScreenH;
  if (!mounted) return null;

  return (
    <div
      style={{
        background: "#0b0d11", borderRadius: 14, padding: 16,
        border: "1px solid #1c2230", marginTop: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e8eaf0" }}>
          実機投影プレビュー（{rows}行 × {cols}列 / {rows * cols}台）
        </h3>
        <button type="button" onClick={onClose}
          style={{ background: "transparent", border: "none", color: "#8b94a6", fontSize: 20, lineHeight: 1, cursor: "pointer" }}>×</button>
      </div>
      <p style={{ margin: "0 0 4px", color: "#8b94a6", fontSize: 11 }}>
        設定した行×列ぶんの実機に、分割映像を投影した様子です。モニター部分のみ映像が流れます。
      </p>
      <p style={{ margin: "0 0 12px", color: useReal ? "#7cc555" : "#e0a23a", fontSize: 11 }}>
        {useReal
          ? `実効果プレビュー：ベゼル ${bz}px ぶん隣の映像が画面の裏に隠れ、並べると連続して見えます。`
          : "（元動画が取得できないため、焼き済みタイルで表示中。ベゼルの実効果は分割後に反映されます。）"}
      </p>
      <div style={{ maxHeight: "46vh", overflow: "auto", borderRadius: 12 }}>
        <div style={{
          display: "inline-grid",
          gridTemplateColumns: `repeat(${cols}, auto)`,
          gap: bezelPx,
          background: "#070809", padding: 12, borderRadius: 12,
        }}>
          {ordered.map((t, i) => (
            <div key={t.position_index}
              style={{ position: "relative", width: DISP_MW, aspectRatio: `${IMGW}/${IMGH}` }}>
              <div style={{
                position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
                transform: matrix3d, transformOrigin: "0 0", pointerEvents: "none",
              }}>
                {useReal ? (
                  <div style={{
                    position: "absolute", left: 0, top: 0,
                    width: SCREEN_W, height: SCREEN_H, overflow: "hidden", transformOrigin: "0 0",
                  }}>
                    <video
                      src={sourceUrl!}
                      autoPlay muted loop playsInline
                      style={{
                        position: "absolute",
                        left: -t.col * (SCREEN_W + bzDisp),
                        top: -t.row * (SCREEN_H + bzDispV),
                        width: wallDispW,
                        height: wallDispH,
                        objectFit: "fill",
                      }}
                    />
                  </div>
                ) : t.tile_asset_url ? (
                  <video
                    src={t.tile_asset_url}
                    autoPlay muted loop playsInline
                    style={{
                      position: "absolute", left: 0, top: 0,
                      width: SCREEN_W, height: SCREEN_H, objectFit: "cover", transformOrigin: "0 0",
                    }}
                  />
                ) : (
                  <div style={{
                    position: "absolute", left: 0, top: 0, width: SCREEN_W, height: SCREEN_H,
                    background: PH_COLORS[i % PH_COLORS.length],
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontWeight: 800, fontSize: 16,
                  }}>
                    R{t.row}C{t.col}
                  </div>
                )}
              </div>
              <img src="/videowall/machine.png" alt="GTCHA X"
                style={{ width: "100%", height: "100%", display: "block", userSelect: "none" }} draggable={false} />
              {t.device_name && (
                <div style={{
                  position: "absolute", bottom: 4, left: 0, right: 0, textAlign: "center",
                  color: "#cfe", fontSize: 10, textShadow: "0 1px 2px #000",
                }}>{t.device_name}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
