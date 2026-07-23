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

## SPAのビルド

```bash
npm run build
```

出力先は `public/` です。

## Collabora Online（Office編集）

Office文書（.docx, .xlsx, .pptx）をブラウザ上で編集できます。

### セットアップ

```bash
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
