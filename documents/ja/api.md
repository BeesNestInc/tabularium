# APIリファレンス

ベースURL: `http://localhost:{PORT}` (デフォルト `8888`)

---

## Knowledge API

### GET `/api/knowledge`

ディレクトリ内のファイル一覧またはルートツリーを表示します。

| クエリ | 型 | 説明 |
|---|---|---|
| `path` | string | ディレクトリパス（省略時はルートツリー） |
| `showHidden` | boolean | `.` で始まるファイルを表示する |

### GET `/api/knowledge/page`

ファイルまたはディレクトリの詳細とindexの内容を取得します。

| クエリ | 型 | 説明 |
|---|---|---|
| `path` | string | **必須.** ファイルまたはディレクトリのパス |
| `showHidden` | boolean | 隠しファイルを表示 |

### GET `/api/knowledge/raw/*`

ファイルの内容をプレーンテキストで読み込みます。

### PUT `/api/knowledge/raw/*`

ファイルに書き込みます。

### DELETE `/api/knowledge/raw/*`

ファイルまたはディレクトリを削除します。

### POST `/api/knowledge/create/*`

新規ファイルを作成します。拡張子に応じてテンプレートが適用されます。

### POST `/api/knowledge/mkdir/*`

新規ディレクトリを作成します。

### POST `/api/knowledge/move`

ファイルを移動またはリネームします。

### GET `/api/knowledge/file/*`

ファイルをバイナリデータとして配信します（画像、PDF等）。`?dl=1` でダウンロード強制。

### GET `/api/knowledge/info`

ファイルメタデータを取得します（frontmatter含む）。

---

## ルート管理

| メソッド | エンドポイント | 説明 |
|---|---|---|
| GET | `/api/knowledge/roots` | 全ルート一覧 |
| POST | `/api/knowledge/roots` | ルート追加 |
| PUT | `/api/knowledge/roots` | ルート置き換え |
| DELETE | `/api/knowledge/roots/:name` | ルート削除（環境変数設定のルートは不可） |

## クエリ実行

### POST `/api/execute`

DuckDB（インメモリ）またはPostgreSQLでSQLを実行します。

```json
{ "language": "sql", "code": "SELECT * FROM table" }
```

## ブックマーク

`/api/knowledge/bookmarks` でブックマークの CRUD 操作が行えます。

## Collabora Online

| メソッド | エンドポイント |
|---|---|
| GET | `/api/collabora/status` |
| POST | `/api/collabora/start` |
| POST | `/api/collabora/stop` |
| GET | `/api/collabora/logs?lines=50` |
| GET | `/api/collabora/config` |

## WOPIプロトコル

| メソッド | エンドポイント | 説明 |
|---|---|---|
| GET | `/hosting/discovery` | WOPI discovery XML |
| GET | `/wopi/files/:id` | CheckFileInfo |
| GET | `/wopi/files/:id/contents` | GetFile |
| POST | `/wopi/files/:id/contents` | PutFile |
