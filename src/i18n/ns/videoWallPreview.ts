export const videoWallPreviewDict = {
  ja: {
    title: (rows: number, cols: number, total: number) => `実機投影プレビュー（${rows}行 × ${cols}列 / ${total}台）`,
    desc: "設定した行×列ぶんの実機に、分割映像を投影した様子です。モニター部分のみ映像が流れます。",
    realNote: (bz: number) => `実効果プレビュー：ベゼル ${bz}px ぶん隣の映像が画面の裏に隠れ、並べると連続して見えます。`,
    fallbackNote: "（元動画が取得できないため、焼き済みタイルで表示中。ベゼルの実効果は分割後に反映されます。）",
  },
  en: {
    title: (rows: number, cols: number, total: number) => `Physical projection preview (${rows} rows × ${cols} cols / ${total} units)`,
    desc: "How the split video looks projected onto the configured rows × cols of physical units. Video plays only on the monitor area.",
    realNote: (bz: number) => `Real-effect preview: the ${bz}px bezel worth of adjacent video hides behind the screen, so tiling looks continuous.`,
    fallbackNote: "(The source video is unavailable, so pre-rendered tiles are shown. The real bezel effect is applied after splitting.)",
  },
} as const;
