import { writable, get } from 'svelte/store';

export const createQueryContext = (meta = null) => {
  const results = writable({});
  const running = writable({});
  const params = writable({});
  const paramVersion = writable(0);
  const grids = writable({});
  const queries = new Map();
  const scriptStore = {};
  const scriptResults = {};

  const setGrid = (name, value) => {
    if (name) grids.update((g) => ({ ...g, [name]: value }));
  };
  const getGrid = (name) => get(grids)[name];

  const setScriptResult = (name, value) => {
    if (name) scriptResults[name] = value;
  };
  const getScriptResult = (name) => scriptResults[name];

  let precompilePromise;
  const getPrecompile = () => (precompilePromise ||= import('./script-precompile.js'));

  // Script ブロックの共有実行。ブロック内のトップレベル宣言（let/const/var/function/class）は
  // scriptStore に蓄積され、別ブロックから参照できる。window は汚さない。
  const runScript = async (code, blockHelpers = {}) => {
    const { precompile } = await getPrecompile();
    const body = precompile(code);
    const helperMap = new Map(Object.entries(blockHelpers));
    // has を常に true にし、識別子の解決をすべて Proxy 経由にする。
    // 読みはヘルパー → scriptStore → 実グローバル、書きは scriptStore へ（隔離）。
    const scope = new Proxy(scriptStore, {
      has: () => true,
      get(target, key) {
        if (typeof key !== 'string') return Reflect.get(target, key);
        if (helperMap.has(key)) return helperMap.get(key);
        if (key in target) return target[key];
        return Reflect.get(globalThis, key);
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    });
    // 非 strict の new Function 本文内でのみ with を使う（モジュール/アプリコードでは使わない）
    const fn = new Function('__scope__', `return (async () => {\n  with (__scope__) {\n${body}\n  }\n})();`);
    const result = await fn(scope);
    return result && typeof result === 'object' && 'returnValue' in result ? result.returnValue : result;
  };

  const substituteParams = (sql) => {
    const pv = get(params);
    return String(sql || '').replace(/\{(\w+)\}/g, (m, key) => {
      return pv[key] !== undefined && pv[key] !== '' ? pv[key] : m;
    });
  };

  const runQuery = async (name, sql) => {
    if (sql === undefined) {
      const stored = queries.get(name);
      if (stored) sql = stored.sql;
    }
    if (sql === undefined) {
      results.update((r) => ({ ...r, [name]: { status: 'error', error: `query "${name}" is not defined` } }));
      throw new Error(`query "${name}" is not defined`);
    }
    const resolved = substituteParams(sql);
    running.update((r) => ({ ...r, [name]: true }));
    results.update((r) => ({ ...r, [name]: { status: 'running' } }));
    try {
      const body = { language: meta?.engine || 'sql', code: resolved };
      if (meta?.databases) body.attach = meta.databases;
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      results.update((r) => ({ ...r, [name]: { status: 'done', data } }));
      return data;
    } catch (err) {
      results.update((r) => ({ ...r, [name]: { status: 'error', error: err.message } }));
      throw err;
    } finally {
      running.update((r) => ({ ...r, [name]: false }));
    }
  };

  const registerQuery = (name, sql, auto = false) => {
    const refParams = [...String(sql).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    queries.set(name, { sql, refParams, auto });
  };

  const setParam = (key, value) => {
    params.update((p) => ({ ...p, [key]: value }));
    paramVersion.update((v) => v + 1);
    const resultsNow = get(results);
    for (const [name, q] of queries) {
      if (q.refParams.includes(key) && resultsNow[name]) {
        runQuery(name, q.sql);
      }
    }
  };

  // フォームの適用: 複数パラメータを一括設定し、参照しているクエリを1回ずつ再実行する
  const applyParams = (values) => {
    const entries = Object.entries(values || {}).filter(([, v]) => v !== undefined);
    if (!entries.length) return [];
    params.update((p) => ({ ...p, ...Object.fromEntries(entries) }));
    paramVersion.update((v) => v + 1);
    const changed = new Set(entries.map(([k]) => k));
    const affected = [...queries]
      .filter(([, q]) => q.refParams.some((k) => changed.has(k)))
      .map(([name]) => name);
    for (const name of affected) {
      runQuery(name);
    }
    return affected;
  };

  return { meta, results, running, params, paramVersion, grids, setGrid, getGrid, scriptStore, scriptResults, setScriptResult, getScriptResult, runQuery, registerQuery, setParam, applyParams, runScript };
};
