# Tabularium

Tabularium — 知識ベースサーバ兼SPA。知識ベース（ファイルシステム上のディレクトリ）をREST APIで公開し、ブラウザ上で閲覧・編集するためのWebインタフェースを提供します。

## 機能

- **知識ベースAPI**: ファイルツリーの取得、Markdown/各種ファイルの閲覧・編集
- **マルチルート**: 複数のディレクトリを束ねて1つのツリーとして表示
- **SQL実行**: DuckDB / PostgreSQL へのインラインクエリ実行
- **Markdownレンダリング**: Prism.js シンタックスハイライト、Mermaid図
- **draw.io図**: ブラウザ上で編集・SVG出力
- **CSV**: スプレッドシートとしてその場で編集
- **WOPI連携**: Collabora Online によるOfficeドキュメント編集
- **ブックマーク管理**: URLの保存・ファビコン/OGPサムネイルの自動取得
- **カレンダー**: iCal/YAML形式のカレンダーファイルの閲覧・編集

## 言語

API のエラーメッセージはブラウザの `Accept-Language` ヘッダに応じて自動で切り替わります。
サーバ全体のデフォルトは環境変数 `LANG` で指定できます（デフォルト: `en`）。

対応言語: `en` / `ja` / `zh`

### 言語を追加するには

**サーバ側**:
1. `server/libs/locales/{lang}.json` を作成（`server/libs/locales/en.json` をコピーして翻訳）
2. `server/libs/i18n.js` の preload 部分に `loadLocale('{lang}');` を追加

**クライアント側**:
1. `client/src/libs/i18n.js` に該当言語の翻訳オブジェクトを追加
2. `dicts` オブジェクトに追加
3. `zh` と同様のキー構造で翻訳値を埋める

## インストール

```bash
git clone https://github.com/BeesNestInc/tabularium.git
cd tabularium
npm run setup
```

`npm run setup` は以下をまとめて実行します:
- `npm install`（サーバ依存）
- `cd client && npm install`（SPA依存）
- `npm run build`（SPAビルド → `public/` に出力）

### 個別の操作

```bash
npm install             # サーバ依存のインストール
npm run build           # SPAのビルドのみ
```

## 起動

```bash
npm start
```

## 設定

環境変数（`.env` またはシステム環境変数）:

| 変数 | 説明 | デフォルト |
|---|---|---|
| `PORT` | サーバポート | `8888` |
| `HOST` | バインドアドレス | `0.0.0.0` |
| `KNOWLEDGE_ROOTS` | ルート一覧（JSON配列） | 未設定時は `KNOWLEDGE_BASE` |
| `KNOWLEDGE_BASE` | 単一ルートのパス（フォールバック） | `./knowledge` |
| `DATABASE_URL` | PostgreSQL 接続文字列 | - |
| `PG_CONNECT_STRING` | DuckDB ATTACH用 libpq 形式接続文字列 | - |
| `WOPI_SRC` | WOPIサーバのベースURL | `http://localhost:8888` |
| `COLLABORA_HOST` | Collabora Online ホスト | `http://localhost:9980` |
| `COLLABORA_ENGINE` | コンテナエンジン（podman/docker） | 自動検出 |

### ルート設定例

```env
KNOWLEDGE_ROOTS='[{"name":"wiki","path":"/path/to/knowledge"},{"name":"docs","path":"./workspace/docs"}]'
```

## プロジェクト構成

```
tabularium/
├── server/               # サーバサイド（Node.js + Fastify）
│   ├── index.js          #   エントリポイント
│   ├── wopi.js           #   WOPIプロトコルルート
│   ├── collabora.js      #   Collaboraコンテナ管理
│   └── libs/             #   サーバサイドライブラリ
│       ├── knowledge-routes.js
│       ├── bookmarks.js
│       ├── i18n.js
│       └── locales/      #      翻訳ファイル (en/ja/zh)
├── client/               # SPA（Svelte + Vite）
│   ├── wiki.html
│   └── src/
│       ├── pages/Knowledge.svelte
│       ├── libs/         #   クライアントサイドライブラリ（i18n等）
│       ├── lib/          #   SPA内部ライブラリ
│       └── components/
├── public/               # SPAビルド成果物
└── package.json
```

## ライセンス

AGPL-3.0-or-later
