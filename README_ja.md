# Tabularium

Tabularium — オープンなファイルベース知識ワークスペース。人間とAIのためのナレッジベースサーバ兼SPAです。
Markdown、スプレッドシート、カレンダー、Office文書、図、ブックマーク、データ分析を統合したブラウザインタフェースを提供します。

## クイックスタート

```bash
git clone https://github.com/BeesNestInc/tabularium.git
cd tabularium
npm run setup
npm start
```

http://localhost:8888 をブラウザで開いてください。

## 機能

- **知識ベースAPI**: ファイルツリー、Markdown/各種ファイルの閲覧・編集
- **マルチルート**: 複数のディレクトリを束ねて1つのツリーとして表示
- **SQL実行**: DuckDB / PostgreSQL へのインラインクエリ実行
- **Markdownレンダリング**: Prism.js シンタックスハイライト、Mermaid図
- **draw.io図**: ブラウザ上で編集・SVG出力
- **CSV**: スプレッドシートとしてその場で編集
- **WOPI連携**: Collabora Online によるOfficeドキュメント編集
- **ブックマーク管理**: URLの保存・ファビコン/OGPサムネイルの自動取得
- **カレンダー**: iCal/YAML形式のカレンダーファイルの閲覧・編集

## ドキュメント

- [APIリファレンス](documents/ja/api.md)
- [設定](documents/ja/configuration.md)
- [依存ライブラリ](documents/ja/dependencies.md)
- [使い方](documents/ja/usage.md)

## 言語

| ロケール | 言語 | 自動検出 |
|---|---|---|
| `en` | [English](README.md) | `Accept-Language: en` |
| `ja` | 日本語 | `Accept-Language: ja` |
| `zh` | [简体中文](README_zh.md) | `Accept-Language: zh` |

## プロジェクト構成

```
tabularium/
├── server/               # サーバサイド（Node.js + Fastify）
├── client/               # SPA（Svelte + Vite）
├── documents/            # ドキュメント（en/ja）
├── public/               # SPAビルド成果物
└── package.json
```

## ライセンス

AGPL-3.0-or-later

このソフトウェアには図編集のために [draw.io](https://github.com/jgraph/drawio) (AGPL-3.0) が同梱されています。
