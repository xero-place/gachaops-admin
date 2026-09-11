export const salesTrendDict = {
  ja: {
    metricTotal: "全体（売上合計）",
    metricQr: "QR売上",
    metricCash: "現金売上",
    metricMedal: "メダル投入数",
    medalUnit: (n: string) => `${n}枚`,
    dateLabel: (l: string) => `日付: ${l}`,
  },
  en: {
    metricTotal: "Total (revenue)",
    metricQr: "QR revenue",
    metricCash: "Cash revenue",
    metricMedal: "Medals inserted",
    medalUnit: (n: string) => `${n}`,
    dateLabel: (l: string) => `Date: ${l}`,
  },
} as const;
