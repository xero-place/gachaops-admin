# GachaOps 管理画面 (Step C)

ガチャサイネージ統合管理プラットフォームのモック管理画面 (Next.js)。

要件定義書 v0.2 / OpenAPI v0.1 / WebSocket プロトコル v2.0 に準拠した、運用担当が日次で触るオペレーション UI です。

## 何が入っているか

サイドバーから到達可能な 18 ルート (全画面動作):

| カテゴリ | ルート | 内容 |
|---|---|---|
| **コア** | `/` | ダッシュボード (KPI、売上推移、低在庫、配信タスク、オフライン端末) |
| | `/live-control` ⚡ | **ライブ操作センター** (映像の遠隔切替・全マシン/店舗/グループ/個別) |
| | `/devices` | 端末一覧 (検索・絞込・ステータス別カウント・複数選択 + 一括切替) |
| | `/devices/[id]` | 端末詳細 (概要 / SS / 電源スケジュール / タスク履歴 タブ + 映像切替) |
| | `/devices/map` | 日本地図上の店舗マーカー表示 |
| | `/device-groups` | グループ階層 (連動再生グループ含む) |
| | `/orders` | 注文一覧 (絞込 + 返金ダイアログ) |
| | `/inventories` | 在庫一覧 (低在庫絞込 + 補充記録ダイアログ) |
| **配信** | `/programs` | プログラム一覧 (グリッド) |
| | `/programs/[id]` | プログラム詳細 (シーン構成、配信状況) |
| | `/assets` | 素材 (グリッド/リスト切替, タグ検索) |
| | `/tasks` | 配信タスク一覧 (進捗バー付き) |
| | `/tasks/[id]` | タスク詳細 (端末別配信ステータス) |
| | `/plan-schedules` | 時間割 (週間グリッド) |
| **設定** | `/stores` | 店舗 |
| | `/products` | 商品マスタ |
| | `/users` | ユーザ管理 (ロール表示) |
| | `/apk` | APK リリース (チャネル / 配信 / ロールバック) |
| **システム** | `/audit-logs` | 監査ログ検索 |
| | `/ws-console` | WebSocket デバッグコンソール (Step D 模擬) |
| | `/settings` | 環境設定 (テーマ・通知・API エンドポイント) |

ライブ映像切替の詳細は [`docs/LIVE_CONTROL.md`](./docs/LIVE_CONTROL.md) を参照。

## 起動

```bash
npm install
npm run dev          # http://localhost:3000
```

本番ビルド:

```bash
npm run build
npm run start
```

## 技術スタック

- **Next.js 14.2** (App Router)
- **TypeScript** (strict)
- **Tailwind CSS** + **shadcn/ui** (Radix UI ベース)
- **recharts** (売上推移チャート)
- **lucide-react** (アイコン)
- **date-fns** (日付フォーマット, ja ロケール)

## アーキテクチャ

```
src/
├── app/                          # Next.js App Router
│   ├── api/v1/[...slug]/         # 全 API モック (route handler)
│   ├── api/_mock/                # モック画像 (SVG 生成)
│   └── (各ページ)
├── components/
│   ├── ui/                       # shadcn/ui (Button, Card, Dialog 等)
│   ├── layout/                   # AppShell, Sidebar, Header
│   └── domain/                   # ドメイン特化 (StatusBadge 等)
├── lib/
│   ├── api.ts                    # fetch wrapper (RFC 9457 対応)
│   ├── api-mock-helpers.ts       # paginate / problem / delay
│   ├── format.ts                 # fmtYen / fmtDate / fmtRelative
│   └── utils.ts                  # cn() (Tailwind class merger)
├── mocks/
│   └── fixtures.ts               # 全モックデータ (deterministic seed)
└── types/
    └── domain.ts                 # OpenAPI v0.1 準拠の TS 型定義
```

### モック API の仕組み

`/api/v1/[...slug]/route.ts` が **全 API エンドポイントの単一ディスパッチャ**になっています。OpenAPI で定義した約 90 のオペレーションのうち UI が叩くものを実装し、未対応エンドポイントは RFC 9457 形式 (`application/problem+json`) の 404 を返します。

意図:
- 80+ 個の `route.ts` ファイルを作るより一覧性が高い
- どのエンドポイントが実装済かを 1 ファイルで監査可能
- 実 API 接続後の段階的削除が容易

人工レイテンシ 120-300ms を入れているので、ローディング状態の UI 確認も自然に行えます。

## 本番 API への接続切替

`.env.local` に環境変数を追加:

```
NEXT_PUBLIC_API_BASE_URL=https://api.gachaops.example/v1
```

`src/lib/api.ts` がこの値を見て `/api/v1` → 本番に切り替わります。Route Handler (`src/app/api/v1/`) は残ったままですが、UI からは呼ばれなくなります。詳しくは [`docs/SWITCHING_TO_REAL_API.md`](./docs/SWITCHING_TO_REAL_API.md) 参照。

## デザイン

- **ダーク優先** (運用担当が長時間見るため)
- アクセントは PayPay 風 vermillion red (`hsl(7, 78%)`)
- ドメインステータス色を分離 (`--ok`, `--warn`)
- 数値は全テーブルで `tabular-nums` (桁ズレ防止)
- フォント: システムフォント + 日本語 (Hiragino Sans / Yu Gothic UI)

詳しくは [`docs/DESIGN.md`](./docs/DESIGN.md) 参照。

## 参考: 既存成果物との関係

| Step | 成果物 | この管理画面との関係 |
|---|---|---|
| Step A | DB スキーマ v0.1 | フィクスチャの構造の元 |
| Step B | OpenAPI v0.1 (87 endpoints) | API モックの根拠、型定義の元 |
| Step D | WS プロトコル v2.0 | `/ws-console` で再現 |
| Step E | PayPay モック | 注文の決済フローの相手側 (本接続時) |

## 制限事項

- ブラウザストレージ未使用 (リロードで状態リセット)
- ログインフォームなし (常に Lv1 スーパー管理者として動作)
- 認証フローはモックの `/auth/me` のみ
- 本物の WebSocket 接続なし (`/ws-console` はメッセージシミュレーター)

これらは Step B (REST API) と Step D (WS) が完成した後、実サーバ接続に切り替えるタイミングで実装します。
