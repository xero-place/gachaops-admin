# gachaops-admin v0.4.0 リリースノート

## このバージョンで直したこと

v0.3.0 では LIVE API モード切替を有効にしても、ダッシュボードと端末ページが
モックフィクスチャを表示し続けるバグがありました。これは以下の 3 ページが
`@/mocks/fixtures` から直接データを import していたためです。

v0.4.0 では:

- `src/app/page.tsx` (ダッシュボード) — 実 API `/dashboard/overview` と `/stats/sales` を呼ぶ
- `src/app/devices/page.tsx` (端末一覧) — 実 API `/devices` と `/stores` を呼ぶ
- `src/app/live-control/page.tsx` (ライブ操作センター) — 実 API `/devices`, `/stores`, `/device-groups` を呼ぶ
- `src/stores/live-control-store.ts` — `applySwitch` / `restorePlan` で実 API `/devices/bulk` を POST するように
- `src/components/layout/header.tsx` — LIVE/MOCK バッジを画面幅問わず表示

新規追加:
- `src/lib/dashboard-data.ts` — ダッシュボード用の API/MOCK 両対応 hooks

## モード判定の動作

- 環境変数 `NEXT_PUBLIC_API_BASE_URL` が **未設定** → `MOCK` モード (オレンジ「MOCK」バッジ表示)
  - 起動時に `BASE_URL = '/api/v1'` になる
  - データ取得は同プロセスのモックハンドラから
  - ログイン不要、フィクスチャを表示

- 環境変数 `NEXT_PUBLIC_API_BASE_URL=http://10.0.0.42:8000/v1` のように **設定済み** → `LIVE API` モード (緑「LIVE API」バッジ表示)
  - 全 fetch が指定 URL に飛ぶ
  - ログイン必須 → `/login` へリダイレクト
  - 実バックエンドのデータを表示
  - ライブ操作で実際に Android タブレットへ play_program が送信される

## 現状で対応していないページ

以下のページは v0.4.0 でも fixture データを表示します。LIVE モード時は
タブレット連動テストには影響しません (Phase 2 では使わないため):

- /assets (素材)
- /audit-logs (監査ログ)
- /apk (APK 配布)
- /device-groups (端末グループ単独編集)
- /devices/[id] (端末詳細)
- /devices/map (端末マップ)
- /inventories (在庫)
- /orders (注文)
- /plan-schedules (時間割)
- /products (商品)
- /programs と /programs/[id] (プログラム)
- /stores 単独 (店舗)
- /tasks と /tasks/[id] (配信タスク)
- /users (ユーザ)
- /ws-console (WebSocket デバッグコンソール)
- /settings (設定)

これらは Phase 3 以降で順次 LIVE 対応予定。

## アップグレード手順

1. v0.3.0 を起動中の `npm run dev` を `Ctrl + C` で停止
2. 古い `gachaops-admin` フォルダを `gachaops-admin.old` にリネーム (バックアップ)
3. v0.4.0 zip を解凍してリネーム後の場所に置く
4. 既存の `.env.local` を新フォルダにコピー:
   ```bash
   cp ~/Documents/gachaops-admin.old/.env.local ~/Documents/gachaops-admin/.env.local
   ```
5. 依存をインストール:
   ```bash
   cd ~/Documents/gachaops-admin
   npm install
   ```
6. 起動:
   ```bash
   npm run dev
   ```
7. ブラウザでハードリロード (`Cmd + Shift + R`)
8. 自動で `/login` 画面に飛ぶ → `admin@gachaops.example` / `admin1234`
9. ヘッダーに **緑「LIVE API」バッジ**、稼働中端末 **0/44** (タブレット未接続なので)、売上 **¥0** が表示されれば成功
