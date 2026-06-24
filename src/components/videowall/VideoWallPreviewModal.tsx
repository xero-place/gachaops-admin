"use client";
// S148: ビデオウォール 実機投影プレビューモーダル
// 実機写真(public/videowall/machine.png)のモニター部分に、各タイル動画を
// matrix3d射影ではめ込み、rows×colsぶん並べてベゼル間隔つきで表示する。
// 既存コンポーネントには非依存（単体で動く）。

import { useMemo } from "react";

// 実機写真 634x880 上で測ったモニター四隅（px）
const IMGW = 648;
const IMGH = 1035;
const TL: [number, number] = [133, 82];
const TR: [number, number] = [493, 82];
const BR: [number, number] = [493, 490];
const BL: [number, number] = [133, 490];

type Tile = {
  position_index: number;
  row: number;
  col: number;
  tile_asset_url?: string | null; // 各タイル動画の公開URL（無ければ色プレースホルダ）
  device_name?: string | null;
};

type Props = {
  rows: number;
  cols: number;
  bezelPx: number;        // 画面上のベゼル間隔（表示用px。実機ベゼルとは別の見た目用）
  machineWidth?: number;  // 1台の表示幅(px)
  tiles: Tile[];          // position_index順
  onClose: () => void;
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
}: Props) {
  const MW = machineWidth;
  const SCALE = MW / IMGW;
  // 映像要素のサイズ＝モニター四隅が作る矩形の実寸（表示px）。
  // これを四隅へ射影することで映像がモニター枠内にぴったり収まる（はみ出さない）。
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

  const ordered = [...tiles].sort((a, b) => a.position_index - b.position_index);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(5,7,11,0.86)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0b0d11", borderRadius: 16, padding: 24,
          maxWidth: "92vw", maxHeight: "92vh", overflow: "auto",
          boxShadow: "0 12px 60px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e8eaf0" }}>
            実機投影プレビュー（{rows}行 × {cols}列）
          </h2>
          <button onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#8b94a6", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <p style={{ margin: "0 0 18px", color: "#8b94a6", fontSize: 13 }}>
          設定した行×列ぶんの実機に、分割映像を投影した様子です。モニター部分のみ映像が流れます。
        </p>
        <div style={{
          display: "inline-grid",
          gridTemplateColumns: `repeat(${cols}, auto)`,
          gap: bezelPx,
          background: "#070809", padding: 16, borderRadius: 14,
        }}>
          {ordered.map((t, i) => (
            <div key={t.position_index}
              style={{ position: "relative", width: MW, aspectRatio: `${IMGW}/${IMGH}` }}>
              <div style={{
                position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
                transform: matrix3d, transformOrigin: "0 0", pointerEvents: "none",
              }}>
                {t.tile_asset_url ? (
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
                    color: "#fff", fontWeight: 800, fontSize: 18,
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
                  color: "#cfe", fontSize: 11, textShadow: "0 1px 2px #000",
                }}>{t.device_name}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
