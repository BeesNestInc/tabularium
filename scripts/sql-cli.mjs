#!/usr/bin/env node
// オフライン SQL 検証 CLI（DuckDB を直接使う）
//
// ブラウザ/サーバを起動せずに、wiki の front matter / CSV を DuckDB へ import し、
// 指定した SQL を実行して検証する。クエリエンジンはサーバーと同一の
// server/libs/query-engine.js を再利用するため、実環境と同じ挙動を確認できる。
//
// Usage:
//   node scripts/sql-cli.mjs [options]
//
// Options:
//   -r, --root <dir>          knowledge ルートのファイルシステム上のディレクトリ
//                             （既定: KNOWLEDGE_BASE 環境変数 or ../knowledge）
//   -n, --root-name <name>    パスに使うルート名（既定: knowledge）
//   --import <path> [as <名>] import するパス（複数指定可）。例: 'knowledge/demo-data as demodb'
//   -c, --sql <sql>           実行する SQL
//   -f, --file <file>         SQL をファイルから読む
//   --json                   結果を JSON で出力（既定は console.table）
//   --debug                   書き換え後の SQL を表示（ネストキー省略記法の確認用）
//
// Examples:
//   node scripts/sql-cli.mjs \
//     --import "knowledge/demo-data as demodb" \
//     -c "SELECT data->>'owner' AS owner, count(*) AS n FROM demodb GROUP BY 1"
//
//   printf '%s\n' "SELECT * FROM demodb" \
//     | node scripts/sql-cli.mjs --import "knowledge/demo-data as demodb"
//
//   node scripts/sql-cli.mjs --import "knowledge/demo-data as demodb" \
//     -c "SELECT data->>'score.grade' AS grade FROM demodb WHERE data->>'score.value' IS NOT NULL"
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importFrontmatter, execQuery, rewriteNestedArrow } from '../server/libs/query-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// --- 引数パース ---
const args = process.argv.slice(2);
const imports = [];
let sql = null;
let json = false;
let debug = false;
let rootName = 'knowledge';
let rootDir = process.env.KNOWLEDGE_BASE || path.join(projectRoot, '..', 'knowledge');

const parseImports = (raw) => {
  const m = raw.match(/^(\S+)(?:\s+as\s+(\w+))?$/);
  if (!m) return;
  imports.push({ path: m[1], as: m[2] || '' });
};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--import') {
    parseImports(args[++i]);
  } else if (a === '--sql' || a === '-c') {
    sql = args[++i];
  } else if (a === '--file' || a === '-f') {
    sql = readFileSync(args[++i], 'utf-8');
  } else if (a === '--root' || a === '-r') {
    rootDir = args[++i];
  } else if (a === '--root-name' || a === '-n') {
    rootName = args[++i];
  } else if (a === '--json') {
    json = true;
  } else if (a === '--debug') {
    debug = true;
  } else {
    console.error(`Unknown option: ${a}`);
    console.error('Usage: node scripts/sql-cli.mjs --import "knowledge/demo-data as demodb" [-c SQL | -f file] [--json]');
    process.exit(1);
  }
}

// --- パス解決（サーバー server/index.js の splitRootPath 相当のルール） ---
const absRoot = path.resolve(rootDir);
const resolvePath = (target) => {
  let t = target.trim();
  if (t.startsWith('/')) t = t.replace(/^\//, '');
  if (t === rootName) return { root: { name: rootName, path: absRoot }, filePath: '' };
  if (t.startsWith(rootName + '/')) {
    return { root: { name: rootName, path: absRoot }, filePath: t.slice(rootName.length + 1) };
  }
  // ルート名プレフィックスが無い場合は projectRoot からの相対として解決を試みる
  // （存在しなければ importFrontmatter が `path not found` を投げる＝サーバーと同じ挙動）
  const expanded = path.resolve(process.cwd(), t);
  if (expanded.startsWith(absRoot)) {
    return { root: { name: rootName, path: absRoot }, filePath: expanded.slice(absRoot.length).replace(/^[/\\]/, '') };
  }
  return null;
};

// --- import 実行 ---
try {
  for (const imp of imports) {
    const res = await importFrontmatter({ path: imp.path, as: imp.as, resolvePath }, {});
    const unit = res.kind === 'csv' ? '行' : 'ページ';
    console.log(`✔ import ${res.table}: ${res.rows} ${unit}（kind=${res.kind}）`);
  }
} catch (err) {
  console.error(`✘ import failed: ${err.message}`);
  process.exit(1);
}

// --- SQL 実行 ---
if (sql == null) {
  sql = readFileSync(0, 'utf-8');
}
if (!sql.trim()) {
  console.error('No SQL given. Pass -c/--sql or pipe SQL to stdin.');
  process.exit(1);
}

try {
  if (debug) {
    console.error('--- rewritten SQL ---');
    console.error(rewriteNestedArrow(sql));
    console.error('--------------------');
  }
  const result = await execQuery(sql);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`列: ${result.columns.map((c) => c.name).join(', ')}（${result.rowCount} 行 / ${result.duration ?? ''}ms）`);
    if (result.rows.length) console.table(result.rows);
  }
} catch (err) {
  console.error(`✘ query failed: ${err.message}`);
  process.exit(1);
}