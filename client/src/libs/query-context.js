import { writable, get } from 'svelte/store';

export const createQueryContext = (meta = null) => {
  const results = writable({});
  const running = writable({});
  const params = writable({});
  const paramVersion = writable(0);
  const queries = new Map();
  const env = {};

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

  return { meta, results, running, params, paramVersion, env, runQuery, registerQuery, setParam, applyParams };
};
