export const statusBadgesDict = {
  ja: {
    device: { online: "オンライン", offline: "オフライン", maintenance: "保守中", never_connected: "未接続" },
    play: { plan: "計画配信中", manual: "手動再生中", idle: "待機" },
    task: { draft: "下書き", scheduled: "予約", distributing: "配信中", completed: "完了", partial_success: "一部成功", failed: "失敗", cancelled: "キャンセル" },
    order: { pending: "未決済", paid: "支払済", failed: "失敗", cancelled: "キャンセル", refunded: "返金済", expired: "期限切れ" },
  },
  en: {
    device: { online: "Online", offline: "Offline", maintenance: "Maintenance", never_connected: "Not connected" },
    play: { plan: "Scheduled", manual: "Manual play", idle: "Idle" },
    task: { draft: "Draft", scheduled: "Scheduled", distributing: "Distributing", completed: "Completed", partial_success: "Partial success", failed: "Failed", cancelled: "Cancelled" },
    order: { pending: "Unpaid", paid: "Paid", failed: "Failed", cancelled: "Cancelled", refunded: "Refunded", expired: "Expired" },
  },
} as const;
