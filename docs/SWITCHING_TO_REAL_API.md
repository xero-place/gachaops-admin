# 本番 API への切替手順

このプロジェクトは Mock API (Next.js Route Handlers) を使ってローカルで完結動作しますが、Step B で定義した本番 REST API が起動した時点で、UI は無修正で本番に切り替えられます。

## 切替の仕組み

`src/lib/api.ts` がベース URL を環境変数で切り替えます:

```typescript
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';
```

- 環境変数なし → `/api/v1` → Next.js Route Handler (モック)
- 環境変数あり → 本番 API

UI コードは `api.get('/devices')` 等を呼ぶだけで、URL の差を吸収します。

## 切替方法

### 開発環境

プロジェクトルートに `.env.local` を作成:

```
NEXT_PUBLIC_API_BASE_URL=https://api.gachaops.example/v1
```

`npm run dev` を再起動して反映。

### 本番環境

ホスティング先 (Vercel / AWS Amplify 等) の環境変数として `NEXT_PUBLIC_API_BASE_URL` を設定してビルドします。

### Docker

```dockerfile
ENV NEXT_PUBLIC_API_BASE_URL=https://api.gachaops.example/v1
RUN npm run build
```

## 注意事項

### CORS

ブラウザから本番 API ドメインに直接 fetch する場合、API サーバ側で CORS ヘッダの設定が必要です:

```
Access-Control-Allow-Origin: https://admin.gachaops.example
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE
Access-Control-Allow-Headers: Authorization, Content-Type
```

リバースプロキシ (nginx 等) で同一オリジン化する設計なら、上記は不要です。

### 認証

現在のモックでは `/auth/me` が常に `usr_super_001` を返します。本番 API に切り替えると 401 が返り、ログイン画面が必要になります。Phase 2 でログインページを追加する想定です。

```typescript
// 現在の実装 (簡略)
const me = await api.get<User>('/auth/me');
```

実装時にやること:
1. `src/app/(auth)/login/page.tsx` を新規作成
2. `src/lib/auth.ts` でアクセストークン管理 (cookie or localStorage)
3. `api.ts` の fetch wrapper で `Authorization: Bearer <token>` を自動付与
4. 401 受信時にログイン画面へリダイレクト

### WebSocket

`/ws-console` は現在ローカルシミュレーターです。本番接続するには:

1. `useWebSocket` hook を作成 (`src/hooks/use-websocket.ts`)
2. `wss://ws.gachaops.example/v2/admin?token=<jwt>` に接続
3. 受信メッセージを `onMessage` で `appendLog` に流す
4. 送信は `ws.send(JSON.stringify(message))` で

`/ws-console` の現在の `simulate()` 関数を `ws.send()` 呼び出しに差し替えるだけで切替可能な構造になっています。

### モック画像

`/api/_mock/screenshot.svg` 等のモック画像エンドポイントは本番では存在しないため、本番モードでは:

- 端末詳細の screenshot URL → 本番では S3 URL が返る
- アセットサムネイル → 本番では S3 URL が返る

OpenAPI レスポンスがそのまま `<img src={url}>` で表示されるよう実装してあるので、URL のホストが変わるだけで動作します。

## 段階的切替のコツ

すべて一度に切り替えず、エンドポイントごとに段階的に進めると安全です。

```typescript
// 例: 一時的に dashboard だけ本番にする
const useRealApi = (path: string) =>
  ['/dashboard/overview', '/stats/sales'].some((p) => path.startsWith(p));

const baseUrl = useRealApi(path)
  ? process.env.NEXT_PUBLIC_API_BASE_URL!
  : '/api/v1';
```

これで「ダッシュボードだけ本番、他はモック」のような検証ができます。

## モック実装の削除

完全に本番 API に切り替わったら、以下を削除可能:

- `src/app/api/v1/[...slug]/route.ts`
- `src/app/api/_mock/`
- `src/mocks/fixtures.ts`
- `src/lib/api-mock-helpers.ts`

`fixtures.ts` を `src/test/fixtures.ts` に移動して、Storybook/テスト用に残す選択肢もあります。
