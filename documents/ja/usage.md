# 使い方

## インストール

```bash
git clone https://github.com/BeesNestInc/tabularium.git
cd tabularium
npm run setup
```

`npm run setup` は以下を実行します: `npm install`（サーバ）→ `cd client && npm install`（SPA）→ `npm run build`（SPAビルド）

## 起動

```bash
npm start
```

http://localhost:8888 をブラウザで開いてください。

## 認証

Tabularium にはマルチユーザー認証が組み込まれています。セッションクッキー方式です。

### 初回セットアップ

最初にサインアップしたユーザーが自動的に **admin** になります。2人目以降は **user** ロールです。

1. ブラウザで Tabularium を開くとログイン画面が表示されます
2. **Sign Up** タブからユーザーを作成してください
3. 最初のユーザーは admin としてログイン状態になります

### ユーザー管理API

| エンドポイント | メソッド | 認証 | 説明 |
|---|---|---|---|
| `/api/auth/signup` | POST | 不要 | 新規ユーザー作成。最初のユーザーは admin に。 |
| `/api/auth/login` | POST | 不要 | `loginId` と `password` でログイン。セッションクッキーが返る。 |
| `/api/auth/logout` | POST | 必要 | セッション破棄。 |
| `/api/auth/me` | GET | 必要 | 現在のユーザー情報を返す。 |
| `/api/auth/change-password` | POST | 必要 | パスワード変更。`currentPassword` + `newPassword` を送信。 |
| `/api/auth/users` | GET | Admin | 全ユーザー一覧。 |

### セッション

`@fastify/secure-session` による暗号化クッキー（httpOnly, sameSite=Lax）を使用します。
セッションキーは `WIKI_SESSION_KEY` 環境変数で設定するか、未設定なら自動生成されます
（自動生成の場合、再起動ですべてのセッションが無効になります）。

セッションクッキーの有効期間はデフォルトで7日間です。

### ユーザーデータベース

ユーザー情報はデフォルトで `./data/tabularium.json` にJSON形式で保存されます。
保存先は `USER_DB_URL` 環境変数で変更できます。

```env
USER_DB_URL=/path/to/users.json
```

### Legion連携

Tabularium が [Legion](https://github.com/BeesNestInc/legion) の一部として動作する場合、
認証は Legion 側で処理されます。Tabularium のログイン画面やユーザーメニューは自動的に非表示になります。
SPA は `/api/auth/me` で現在のユーザーを取得しますが、ユーザー管理（サインアップ、パスワード変更など）は
Legion のインターフェースを通じて行います。

### WOPI / Collabora

Officeドキュメントを開くと、Collabora Online の iframe に渡す短期署名付きアクセストークン（5分間有効）が
自動生成されます。トークンはセッションキーを使った HMAC-SHA256 で署名され、ユーザーの loginId に紐付きます。
WOPIトークンの追加設定は不要です。

## SPAのビルド

```bash
npm run build
```

出力先は `public/` です。

## Collabora Online（Office編集）

Office文書（.docx, .xlsx, .pptx）をブラウザ上で編集できます。

### セットアップ

[Podman](https://podman.io) をインストールしておきます。

```bash
# Collaboraイメージを取得
podman pull docker.io/collabora/code

# Collaboraコンテナ起動
node server/collabora.js start

# 状態確認
node server/collabora.js status

# ログ確認
node server/collabora.js logs

# 停止
node server/collabora.js stop
```

### 設定

```env
WOPI_SRC=http://あなたのホスト:8888
COLLABORA_SERVER_NAME=あなたのホスト:9980
```

`WOPI_SRC` は **Collaboraコンテナ内部から到達可能な** URL を指定します。
tabularium からコンテナを起動するとデフォルトで `--network host` が使われるため、
`http://localhost:8888` で動作します。ブリッジネットワークの場合はホストマシンのIPを指定してください。

`COLLABORA_HOST` を明示的に設定すると、自動検出の代わりにその値が使われます。

管理者認証（オプション）:

```env
COLLABORA_USERNAME=admin
COLLABORA_PASSWORD=secret
```

### トラブルシューティング

| 症状 | 原因 | 対策 |
|---|---|---|
| 「プロキシの設定が…」/ Collabora UIは表示されるが文書が表示されない | コンテナがWOPIサーバに到達できない | `WOPI_SRC` にコンテナ内から到達可能なホスト名を設定。コンテナを作り直す: `node server/collabora.js remove && node server/collabora.js start`（`--network host` が適用される） |
| Collabora iframe が「サーバが見つかりません」 | Collaboraコンテナが起動していない | `node server/collabora.js status` で確認、`node server/collabora.js start` で起動 |
| Officeファイルが開かない / ダウンロードになる | 拡張子が未対応 | 対応: `.doc`, `.docx`, `.odt`, `.xls`, `.xlsx`, `.ods`, `.ppt`, `.pptx`, `.odp`, `.rtf`, `.csv`, `.txt` |

## SQL実行

frontmatter に `engine` と `databases` を指定すると、Markdown内のSQLブロックを実行できます。

```markdown
---
engine: duckdb
databases:
  pg: postgres://user:pass@host/db
---
```

````
```sql
SELECT product, SUM(amount) FROM sales GROUP BY product
```
````

## マルチルート

複数のディレクトリを1つのツリーとして表示できます。

```env
KNOWLEDGE_ROOTS='[
  {"name":"wiki","path":"/path/to/knowledge"},
  {"name":"docs","path":"./workspace/docs"}
]'
```

## ブックマーク

URLをコンテンツペインにドラッグ＆ドロップしてブックマークを追加できます。
`.bookmarks/bookmarks.yaml` に保存され、ファビコンとOGPサムネイルが自動取得されます。

## カレンダー

`.ical` / `.mycal` ファイルをインタラクティブなカレンダーとして表示します。
月/週/日表示、繰り返しイベント、ICSインポート/エクスポート、マルチカレンダー対応。
