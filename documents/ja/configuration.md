# 設定

## 環境変数

`.env` ファイル（プロジェクトルートまたは `server/.env`）またはシステム環境変数で設定します。

### サーバ

| 変数 | デフォルト | 説明 |
|---|---|---|
| `PORT` | `8888` | HTTPサーバのポート |
| `HOST` | `0.0.0.0` | バインドアドレス |
| `LANG` | `en` | APIエラーメッセージのデフォルト言語 |

### 知識ベース

| 変数 | デフォルト | 説明 |
|---|---|---|
| `KNOWLEDGE_ROOTS` | — | ルートディレクトリのJSON配列 |
| `KNOWLEDGE_BASE` | `./knowledge` | 単一ルートのパス（フォールバック） |

### データベース

| 変数 | 説明 |
|---|---|
| `DATABASE_URL` | PostgreSQL接続文字列 |
| `PG_CONNECT_STRING` | DuckDB ATTACH用 libpq 形式接続文字列 |

### Collabora Online

| 変数 | デフォルト | 説明 |
|---|---|---|
| `WOPI_SRC` | `http://localhost:8888` | WOPIサーバのベースURL |
| `COLLABORA_HOST` | `http://localhost:9980` | Collabora Online ホスト |
| `COLLABORA_ENGINE` | `podman` | コンテナエンジン（Podmanのみ対応） |
| `COLLABORA_IMAGE` | `docker.io/collabora/code` | コンテナイメージ |
| `COLLABORA_CONTAINER_NAME` | `legion-cool` | コンテナ名 |
| `COLLABORA_PORT` | `9980:9980` | ポートマッピング |
| `COLLABORA_USERNAME` | — | Adminコンソールのユーザー名 |
| `COLLABORA_PASSWORD` | — | Adminコンソールのパスワード |

## ルートの永続化

APIで追加したルートはプロジェクトルートの `roots.json` に保存されます。
環境変数 `KNOWLEDGE_ROOTS` で設定したルートはAPIで削除できません。
