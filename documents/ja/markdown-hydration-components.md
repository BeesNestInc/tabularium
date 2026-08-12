# マークダウンコンポーネント活性化システム

**作成: 2026-08-12** — この文書は、Tabularium の wiki マークダウンに埋め込むインタラクティブコンポーネント（SQL実行・チャート・フォーム・JS実行など）の設計と実装を、開発者がコードを扱える粒度で記録したものです。

> **用語**: 「活性化」はソフトウェア用語 **hydration（ハイドレーション）** のこと。
> コード上は `hydrate()` / `data-hydrate` と英語のまま書かれている。

## 1. コードの場所と運用

- 実コードは **`client/`**（Svelte + Vite の SPA）。サーバー側 API は **`server/`**。
- マークダウンレンダリングの主な流れ: `client/src/libs/markdown-render.js` → `client/src/libs/hydrate.js` → `client/src/components/knowledge/*.svelte`。
- クエリ実行エンジン（DuckDB / PostgreSQL 直）は **`server/libs/query-engine.js`** に一元化（`server/index.js` が import）。
- **Legion 連携**: 本リポジトリは Legion プロジェクト（web-ui）からも参照される。フロントエンドは `client/` への symlink、サーバー側は `query-engine.js` を import する薄いラッパーで共有されている。

### コマンド

```bash
cd client
npm run build        # vite build → ../public/ に出力
npm test             # vitest run（ユニットテスト）
npm run test:watch   # ウォッチ
```

## 2. 全体アーキテクチャ

```
markdown 本文
   │  createMd() (markdown-it) ＋ processComponentTags()
   ▼
<div class="mdx-hydrate" data-hydrate="Query" data-props='{json}'>
   │  レンダリング後 Knowledge.svelte の hydrateContent()
   ▼
hydrate(root, ctx) がレジストリから import() + Svelte5 mount()
   ▼
各コンポーネントが ctx（クエリコンテキスト）経由で状態を共有
```

- markdown-it は**型付きプレースホルダ**を出力し、ページ描画後に `hydrate()` が該当 Svelte コンポーネントを活性化（ハイドレーション）する。SQL実行・チャート等は HTML文字列 + 正規表現置換のハックを**廃止**している。
- コンポーネント同士は独立に `mount()` されるため、Svelte の `getContext` は使えない。状態共有は全て `ctx`（query-context）経由。

> **設計判断: なぜ mdsvex / MDX を使わないか**
>
> - mdsvex は **ビルド時**に `.svx`（markdown + Svelte）を Svelte コンポーネントへコンパイルする前処理。MDX も同様にビルド時（runtime `evaluate` もあるが、コンパイラ/JSX ランタイムが必要で重い）。
> - 本 wiki の本文は **実行時に API から取得してクライアント側で描画する、ユーザー編集可能なデータ**であり、ビルドグラフに入らない → mdsvex/MDX では処理できない。
> - ブラウザに Svelte コンパイラ等を積んで任意のユーザー markdown を実行時コンパイルするのは重い上、**任意コード実行のセキュリティリスク**。
> - そこで **ランタイム水化**（markdown-it → 型付きプレースホルダ → `hydrate()` で `mount()`）を自作した。mdsvex の狙い（markdown にコンポーネントを埋め込む）を runtime で実現する方式で、当該ユースケースにドロップインな既存ライブラリは無い。
> - 一部のプリミティブは既存技術の踏襲: JS ブロックの共有実行（livenote/jsconsole 方式の再実装）、`hydrate` の命名（React/SvelteKit と同概念）。

## 3. ファイルマップ

| パス（`client/` 基準） | 役割 |
|---|---|
| `src/libs/markdown-render.js` | `createMd()`（markdown-it設定・フェンス/コンテナ規則）、`processComponentTags()`、`placeholderHtml()` |
| `src/libs/hydratable-registry.js` | コンポーネントレジストリ。`registerHydratable()` / `getHydratable()` / `isHydratable()` |
| `src/libs/hydrate.js` | `hydrate(root, ctx)` / `unmountAll()`。`registerHydratable` を再export |
| `src/libs/query-context.js` | `createQueryContext(meta)`。クエリ実行・パラメータ・Script 共有実行 |
| `src/libs/script-precompile.js` | Script ブロックのトップレベル宣言を共有代入に変換（`@babel/parser`、動的 import） |
| `src/libs/std.js` | `Tablarium` / `Legion` 標準ライブラリ（セクション15） |
| `src/libs/script-helpers.js` | `registerScriptHelper(name, value)` — Script 実行スコープへの追加ヘルパー |
| `src/components/knowledge/*.svelte` | 組み込みコンポーネント（Query/Chart/DataTable/ResultTable/EChart/ParamInput/DynamicValue/Script/Form/FrontmatterImport/DataGrid/Badge） |
| `src/extensions.js` | **カスタムコンポーネント / スクリプトヘルパー登録エントリ**（`wiki-main.js` が import） |
| `src/wiki-main.js` | SPA エントリ。`import './extensions.js'` を読む |
| `src/pages/Knowledge.svelte` | ページ本体。`hydrateContent()` で `hydrate()` を呼ぶ |
| `src/lib/content-types/markdown.js` | markdown コンテンツの `load()`。front matter の `engine`/`databases` を `<div data-page-meta>` で包む |
| `src/lib/preview.js` | 編集モードのプレビュー（`processComponentTags` 適用） |
| `src/styles/markdown-content.scss` | コンテンツ共通スタイル（`.sql-block`, `.mdx-hydrate-*`, `.form-container`, `.callout` 等） |

## 4. マークダウン構文リファレンス

### 4.1 フェンス（```…```）

| フェンス | 動作 |
|---|---|
| ` ```sql:run 名前 ` | **実行クエリ**（Query コンポーネント・▶Run） |
| ` ```js:run 名前 ` | **実行スクリプト**（Script コンポーネント・▶Run） |
| ` ```sql ` / ` ```javascript ` / ` ```js ` | **表示のみ**（Prism ハイライト） |
| ` ```sql:show ` / ` ```js:show `（他に `plain`/`display`/`static`/`example`） | 表示専用（明示） |
| ` ```mermaid ` | Mermaid 図 |
| その他言語 | Prism で表示 |

**規約（重要）**: `sql` も `javascript` も「素のフェンス＝表示、実行は `:run`」に統一している。表示専用コード例を誤って実行ブロック化しないため。

### 4.2 自己閉じコンポーネントタグ

```md
<LineChart data={q1} x=month y=revenue />
<BarChart data={q} x=region y=sales />
<PieChart data={q} x=region y=sales />
<AreaChart data={q} x=month y=orders fill=true />
<DataTable data={q} />
<ParamInput name="region" label="地域:" options="東京,大阪,名古屋" default="大阪" />
<DynamicValue data={q} column="sales" />
```

- 属性は `key=value`、クォート内スペース可（`suffix=" 百万円"`）。
- `{...}` はクエリ名などの参照（中括弧を外して渡る）。
- **登録済みタグのみ**変換され、未登録の大文字始まり自己閉じタグは素通し（`processComponentTags`）。
- **HTML 内への埋め込み**: markdown-it は `html: true` のため、raw HTML ブロック（`<form>` 等）の中に書いた `<ParamInput/>` / `<DynamicValue/>` も変換・水化され動作する（`processComponentTags` はレンダリング後のHTML全体を走査するため）。`:::form` 内の raw HTML に置いた ParamInput も適用ボタンの集計対象になる。
- **インライン生成**: `ParamInput` / `DynamicValue` は `<span class="mdx-hydrate mdx-hydrate-inline">` で生成され、本文に直接書くと改行されずテキストに流れ込む。チャート・テーブル等は `<div>`（ブロック）のまま。
- **コード例の書き方**: タグの**使い方の例示**は必ず ``` フェンスで書くこと（フェンス内は HTML エスケープされるので変換・水化されない）。`<pre><code>` の生HTML内では変換されてしまうが、例示はフェンスを使うのが基本のため**対応しない**（既知の挙動として許容）。

### 4.3 コンテナ（`:::`）

```md
:::callout warning
**注意** 本文（markdown 可）
:::

:::collapse 詳細を表示
折りたたみ本文
:::

:::query q1
SELECT 1;
:::

:::form filter
<ParamInput name="min_price" label="最低価格:" type="number" default="1000" />
<ParamInput name="region" label="地域:" options="東京,大阪" default="大阪" />
:::

:::import knowledge/demo-data as demodb
:::

:::import knowledge/demo-data/sales.csv as sales
:::
```

- `:::query` は SQL クエリ定義（Query コンポーネント、実行は `sql:run` フェンスと同じ）。
- `:::form` はフィールド群＋**適用**ボタンのコンテナ。引数はフォーム名（省略可）。
- `:::import パス [as 名前]` は **front matter / CSV の DuckDB インポート**（FrontmatterImport コンポーネント）。`.md`（ディレクトリ or 1ファイル）→ front matter テーブル、`.csv`（1ファイル）→ 内容そのまま。詳細はセクション14。

## 5. クエリコンテキスト（ctx）

`createQueryContext(meta)` が返すオブジェクト。全コンポーネントが props として受け取る。

| メンバ | 型・説明 |
|---|---|
| `meta` | `{ engine, databases }`（front matter 由来、無ければ null） |
| `results` | Svelte store。`{ クエリ名: { status:'running'/'done'/'error', data?, error? } }` |
| `running` | store。`{ クエリ名: bool }` |
| `params` | store。`{ パラメータ名: 文字列値 }`（SQL の `{name}` に置換） |
| `paramVersion` | store（数値）。`setParam`/`applyParams` のたびに増える |
| `scriptStore` | プレーンオブジェクト。**Script ブロック間で共有されるトップレベル宣言**の現在値 |
| `runScript(code, helpers)` | Script ブロック実行。トップレベル宣言を共有スコープへ蓄積し、`helpers`（`output`/`runQuery`/`container` 等のブロック別注入）を渡す。返り値を unwrap して返す |
| `scriptResults` | プレーンオブジェクト。**名前付き Script の返り値**を name キーで保持 |
| `setScriptResult(name, value)` | 名前付き Script の返り値を保存（Script.svelte が内部使用） |
| `getScriptResult(name)` | 名前付き Script の返り値を取得（Script 内では `getScript(name)` として公開） |
| `runQuery(name, sql?)` | 実行。`sql` 省略時は `registerQuery` されたSQLを使う |
| `registerQuery(name, sql, auto)` | 名前付きクエリ定義（Query が onMount で登録） |
| `setParam(k, v)` | パラメータ設定＋**参照する実行済みクエリを再実行** |
| `applyParams({k:v})` | 一括設定＋**参照する登録済みクエリを1回ずつ再実行**（未実行も対象） |
| `grids` | Svelte store。**DataGrid の編集結果**を name キーで保持（`{ headers, rows }`） |
| `setGrid(name, value)` / `getGrid(name)` | DataGrid の編集結果を保存/取得（Script 内では `getGrid(name)` として公開） |

### パラメータ置換

`runQuery` は SQL 中の `{name}` を `params[name]` で置換する。空文字・未定義のパラメータは**置換せず `{name}` のまま**（SQL エラーになる＝作者に知らせる）。

## 6. 自動実行ルール

- `hydrate()` は `data` プロパティを持つ任意コンポーネントの参照クエリ名を収集し、同名の `Query` に `auto=true` を渡す → onMount で自動実行。
- `ParamInput` の `default` は onMount で `setParam` される（自動実行クエリが初期値を使うため）。
- Form 内のフィールドは変更で即実行**しない**（保留）。**適用**ボタンで `applyParams` → 参照クエリ再実行。

## 7. コンポーネント詳細

### Query.svelte
- props: `ctx`, `name`, `sql`, `auto`
- ▶Run ボタン + 状態表示 + テーブル/チャートタブ（`ResultTable` / `EChart`）。
- onMount で `ctx.registerQuery(name, sql, auto)`、`auto` なら実行。

### Chart.svelte / EChart.svelte
- `Chart`: props `ctx, data(クエリ名), type(LineChart/BarChart/AreaChart/ScatterPlot/PieChart), x, y, y2, fill`。結果を `buildOption()` で ECharts option 化 → `EChart`。
- `EChart`: `option` を受け、動的 `import('echarts')`、ResizeObserver、dispose 管理。

### DataTable.svelte / ResultTable.svelte
- `DataTable`: props `ctx, data`。結果を `ResultTable` へ。
- `ResultTable`: データ表示。ヘッダクリックでソート、ページング（100件/頁）、CSV 出力。

### ParamInput.svelte（runes モード）
- props: `ctx, name, label, type(text/number/date/textarea/checkbox), options, default, min, max, step, rows, apply, inForm`
- `options` → select / `type=checkbox` → boolean（値は `true`/`false` 文字列）/ `textarea` / `number` / `date` / 既定 text。
- `inForm`（Form内、hydrate が注入）または `apply=true` のとき **deferred**：入力で即 `setParam` せず保留し `.param-pending` を付ける。`apply` 時は単体で「適用」ボタン表示。
- `bind:value` の number は数値になるため、`commit()` で `String()` に正規化して `setParam`。

### Script.svelte
- props: `ctx, name, code`。▶Run で `ctx.runScript(code, helpers)` を実行。
- 実行スコープで渡る変数（`helpers`）:
  `ctx`, `runQuery`, `getResult`, `setParam`, `getParam`, `getScript`, `getGrid`, `output(html)`, `append(html)`, `clearOutput()`, `container`（結果DOM）, `meta` ＋ **`...getScriptHelpers()`**（`script-helpers.js` で登録した標準ライブラリ `Tablarium` / `Legion` 等。セクション15）
- async/await 対応。例外はエラー表示。
- **共有環境**: 同一ページの全 Script ブロックは **トップレベルの宣言（`let`/`const`/`var`/`function`/`class`）を共有**する。`const x = 5` と書けば別ブロックから `x` を参照できる。入れ子の宣言は通常どおりブロックスコープ。
- **名前付き**（` ```js:run 名前 `）のスクリプトは、**返り値**を `ctx.setScriptResult(name, value)` で保持。別ブロックから `getScript('名前')` で参照できる。

### Script の共有実行メカニズム（`query-context.runScript` + `script-precompile`）

1. `script-precompile.js`: コードを async 関数として Babel で解析し、**トップレベル宣言を共有スコープへの代入**に書き換える（`const x = 5` → `void (x = 5)`、`function f(){}` → `f = function f(){}`、最終式 → `return {returnValue: (...)}`、先頭 `"use strict"` は除去）。さらに**静的 `import ... from '絶対URL'` を `await import(...)` に変換**する（named/default/namespace/side-effect 対応）。livenote/jsconsole 方式の再実装。`@babel/parser` は動的 import で分離。
2. `query-context.runScript`: 書き換えた文を **`with(scope)`** 内で `new Function` 実行。`scope` は `has: () => true` の **Proxy**（読みは ヘルパー → scriptStore → 実グローバル、書きは scriptStore へ）。これで **window を汚さず**にブロック間で共有できる。
3. `with` は**非 strict の `new Function` 本文のみ**で使用（モジュール/アプリコードでは使わない）。

### Form.svelte（container）
- props: `ctx, name, button, target`（`target` = hydrate が渡す mount 対象 el）。
- **適用**ボタンで `target.querySelectorAll('[data-hydrate="ParamInput"]')` を走査し、各フィールドの現在値（checkbox は checked）を集めて `ctx.applyParams(values)`。
- container のため hydrate が innerHTML を**消さず** mount する（子 placeholder を残す）。

### FrontmatterImport.svelte
- props: `path, as, _imported`。表示のみ（実際の import は `hydrate()` が mount 前に実行）。
- `kind: 'csv'` なら「N 行」、`'frontmatter'` なら「N ページ」表示。

### DataGrid.svelte（jspreadsheet テーブル編集）
- props: `ctx, data, name, types, widths, height, readonly, value, onchange`
- `data`: クエリ名（`data={q}`、ctx.results から解決）またはテーブルオブジェクト（`{columns,rows}` / `{headers,rows}` / オブジェクト配列 / 2次元配列）。`normalize()` で正規化して jspreadsheet に投入。
- `types`（`text`/`numeric`/`date`/`checkbox`… カンマ区切り）/ `widths`（px）はオプション。**省略時は推定**: 型はクエリ結果の `columns[].type` か値サンプリング（number→numeric、date→date、boolean→checkbox）、幅はヘッダ長から `max(80,min(220,len×10+24))`。
- 編集は `onchange` で検知し、`{ headers, rows }` を `name` があれば `ctx.setGrid(name, v)`、Svelte コンポーネントとしては `value` 更新 + `dispatch('change')` + `onchange(v)`。
- 初期化時に初期値も `setGrid` するので、編集前から `getGrid('名前')` で読める。

### Badge.svelte（カスタムの参考例）
- props: `ctx, data, column, label, prefix, suffix, format`。クエリ結果の先頭行の値を KPI カード表示。

## 8. カスタムコンポーネントの追加手順

1. `src/components/knowledge/` に `.svelte` を作る。
2. `src/extensions.js` で登録:
   ```js
   import { registerHydratable } from './libs/hydrate.js';
   registerHydratable('MyWidget', () => import('./components/knowledge/MyWidget.svelte'));
   ```
   - 第3引数 `{ container: true }` で、子プレースホルダを内包するコンテナ型にできる（Form と同様）。
   - 同名登録で組み込みを上書き可能。
3. マークダウンで `<MyWidget prop="val"/>` と書く。
4. コンポーネントは `ctx` を受け取れる。`data={クエリ名}` を書くと自動実行対象になる。

## 9. hydrate の内部挙動（コードを触る前に）

- `[...root.querySelectorAll('[data-hydrate]')]` を DOM 順に走査。
- `data` プロパティのクエリ名を `referenced` に収集（自動実行判定）。
- 各 el: レジストリから `{ loader, container }`。`container` 以外は `el.innerHTML=''` してから `mount`。props に `{ ...dataProps, ctx, target: el }` を渡す。
- `Query` には `props.auto`、`ParamInput` には `props.inForm`（`el.closest('[data-hydrate="Form"]')`）を注入。
- **FrontmatterImport は mount の前に import を await**（自動実行クエリがテーブル未作成で失敗しない順序保証）。
- **container は子 placeholder を残す**ため `innerHTML` を消さない。mount 順は DOM 順なので Form が先、子が後。

## 10. markdown-render 内部

- `placeholderHtml(name, props, label, { inline })` → `<div class="mdx-hydrate" data-hydrate="NAME" data-props='JSON(escaped)'>`（inline 時は `<span class="mdx-hydrate mdx-hydrate-inline">`）。
- `processComponentTags(html)`: 大文字始まり自己閉じタグを正規表現 `/<([A-Z][\w]*)\s+([\s\S]*?)\/>/g` で拾い、`isHydratable` ならプレースホルダへ。チャートタグは `type` を付けて hydrate 名 `Chart` にマップ。
- 属性パーサ: `/(\w+)=(\{[^}]+\}|"[^"]*"|'[^']*'|[^\s/>]+)/g`（クォート内スペース対応）。
- コンテナ規則は `mdxContainer(md, name, openFn, closeFn)` / `mdxQuery(md)`（markdown-it block.ruler.before('paragraph')）。
- `createMd({ useAnchor, useLinkOpen, mermaidSanitize })`。

## 11. テスト

- vitest + jsdom + @testing-library/svelte。`client/tests/` 配下。
- `vitest.config.js`: `resolve.conditions` に `'browser'` を追加（**Svelte5 の `mount` が server エントリに解決されるのを防ぐため必須**）。`environment: 'jsdom'`、`setupFiles: tests/setup.js`（ResizeObserver polyfill / fetch リセット / cleanup）。
- ECharts はテストで `vi.mock('echarts')`。
- 対象: markdown-render（フェンス/コンテナ/タグ/エスケープ）、query-context（runQuery/params/applyParams）、Query/Script/ParamInput/Form/FrontmatterImport/std コンポーネント、hydrate（活性化・auto・container）。
- テスト用ウィジェット: `tests/TestWidget.svelte`（`registerHydratable` の検証用）。

## 12. 既知の落とし穴

- フェンス `:run`/`:show` 規約を守る。素の ` ```sql `/` ```javascript ` は表示。
- 数値/チェックも `params` には文字列で入る。SQL では `WHERE price >= {min_price}` のように**クォートなし**、文字列は `'{name}'` とクォート付きで使う。
- Script は任意コード実行。**信頼できる編集者のみ**が使える前提。
- コンテナ（Form）追加時は必ず `{ container: true }` で登録し、hydrate の container 処理を理解する。
- Script の共有実行は **`with` + Proxy** を非 strict の `new Function` 本文内でのみ使用する。`"use strict"` は precompile で除去。**アプリのモジュールコードには `with` を絶対に使わない**。
- Script ブロック内でヘルパー名（`output`/`runQuery` 等）をトップレベルで宣言すると、共有スコープがヘルパーを隠す（予約名扱い）。
- `@babel/parser` は動的 import でメインバンドルから分離（初回 Script 実行時にロード）。

## 13. front matter / CSV を DuckDB に（`:::import`、Dataview の SQL 版）

マークダウンで「この markdown を使うよ」と**宣言**すると、その場で DuckDB に import される:

```md
:::import knowledge/demo-data as demodb
:::

```sql:run projects
SELECT path, title, data->>'status' AS status, data->>'owner' AS owner
FROM demodb WHERE data->>'type' = 'project'
```

- 仕組み:
  1. `:::import path [as 名前]` コンテナ → `<div data-hydrate="FrontmatterImport">`（markdown-render の `mdxContainer`）
  2. **`hydrate()` が mount の前に import を完了**させる（FrontmatterImport プレースホルダの `POST /api/frontmatter/import` を await）。**自動実行クエリが import より先に走らないための順序保証**
  3. サーバー `importFrontmatter()`: パス解決（`splitRootPath`）→ `.md`/`.mmd` 再帰収集（`node_modules`/`.git`/`dist`/`.trash` 除外）→ `matter()` で front matter パース → 共有 DuckDB に `CREATE OR REPLACE TABLE`（prepared statement）
  4. `FrontmatterImport.svelte` は結果表示のみ（`_imported` prop）
- スキーマ: `path, root, name, title, mtime, size, data`（`data` は全 front matter の JSON 文字列）
  - 任意プロパティは `data->>'key'` / `json_extract_string(data, '$.key')`（DuckDB の VARCHAR JSON 操作を利用）
- **CSV**: `:::import ファイル.csv [as 名前]` と指定すると、`read_csv_auto` で内容をそのままテーブル化（型は DuckDB が自動推定）。`.md` 以外の単一ファイルは `unsupported file type` エラー。戻り値の `kind: 'csv'` / `'frontmatter'` で表示単位（行/ページ）を切り替え。
- 再 import は冪等（`CREATE OR REPLACE`）。ページ表示ごとに hydrate が実行するので常に最新。

## 14. 標準ライブラリ（`Tablarium` / `Legion`）

`js:run` スクリプト内で使える API 標準ライブラリ。

- **`src/libs/std.js`**（フレームワーク非依存・プレーン ESM・fetch ベース）
  - `Tablarium`: `knowledge`（`knowledge-api.js` を再利用）、`query.run(sql, {language, attach})`、`query.importFrontmatter(path, as)`、`collab.config()`、`auth.me()`
  - `Legion`: `auth.me()`、`personas.list()`、`roles.list()`、`supervisor.{status,start,stop,restart,logs,startCoding}`、`tasks.{list,get}`、`mailbox.{graph,messages}`、`logs.{list,get}`、`chat.{send,history}`、`instruction.{send,history}`
  - `configure({ tablariumBase, legionBase, credentials })`: 基点URLを差し替え可能。既定は同オリジン `/api`
- **`src/libs/script-helpers.js`**: `registerScriptHelper(name, value)` / `getScriptHelpers()`。`Script.svelte` が毎回 `...getScriptHelpers()` を実行スコープに合成
- **`extensions.js`** が `Tablarium` / `Legion` を**デフォルト登録**（名前はここで決める。追加・上書きもここ）
- **Legion は別オリジン**（web-ui）なので、wiki から使うには `configure({ legionBase })` + 相手側の CORS（credentials）設定が必要。プラグイン・アプリからは `std.js` を直接 import して `configure()` で基点指定
