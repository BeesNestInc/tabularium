// ============================================================
// 独自コンポーネントの登録ポイント
// ============================================================
// Wiki のマークダウン内で `<名前 プロパティ="値"/>` として使える
// カスタム Svelte コンポーネントをここで登録します。
//
//   import { registerHydratable } from './libs/hydrate.js';
//   registerHydratable('MyWidget', () => import('./components/knowledge/MyWidget.svelte'));
//
// コンポーネントには `ctx` プロパティ（クエリコンテキスト）が渡ります。
//   const { results, running, params, runQuery, setParam, meta } = ctx;
// `data={クエリ名}` を書くと、そのクエリはページ表示時に自動実行されます。
//
// 同名で登録すると組み込みコンポーネントを上書きできます（例: Query を差し替え）。
// ============================================================
import { registerHydratable } from './libs/hydrate.js';

// サンプル: クエリ結果の KPI カード
registerHydratable('Badge', () => import('./components/knowledge/Badge.svelte'));
