import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { createQueryContext } from '../src/libs/query-context.js';

const okResponse = (data) => ({ ok: true, json: async () => data });
const errResponse = (error) => ({ ok: false, json: async () => ({ error }) });

describe('createQueryContext', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('posts to /api/execute with engine + attach from meta', async () => {
    const ctx = createQueryContext({ engine: 'postgresql', databases: { default: 'pg://x' } });
    fetch.mockResolvedValue(okResponse({ columns: [], rows: [], rowCount: 0, duration: 3 }));
    await ctx.runQuery('q', 'SELECT 1;');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/execute');
    expect(JSON.parse(init.body)).toEqual({
      language: 'postgresql',
      code: 'SELECT 1;',
      attach: { default: 'pg://x' },
    });
  });

  it('defaults language to sql when no engine meta', async () => {
    const ctx = createQueryContext(null);
    fetch.mockResolvedValue(okResponse({ columns: [], rows: [], rowCount: 0 }));
    await ctx.runQuery('q', 'SELECT 1;');
    expect(JSON.parse(fetch.mock.calls[0][1].body).language).toBe('sql');
  });

  it('stores done result and running state', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    fetch.mockResolvedValue(okResponse({ columns: [{ name: 'a', type: 'integer' }], rows: [{ a: 1 }], rowCount: 1, duration: 5 }));
    await ctx.runQuery('q1', 'SELECT 1;');
    expect(get(ctx.results).q1.status).toBe('done');
    expect(get(ctx.results).q1.data.rowCount).toBe(1);
    expect(get(ctx.running).q1).toBe(false);
  });

  it('stores error result when fetch fails', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    fetch.mockResolvedValue(errResponse('boom'));
    await expect(ctx.runQuery('q', 'BAD SQL')).rejects.toThrow('boom');
    expect(get(ctx.results).q.status).toBe('error');
    expect(get(ctx.results).q.error).toBe('boom');
  });

  it('substitutes {param} placeholders in sql', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    fetch.mockResolvedValue(okResponse({ columns: [], rows: [], rowCount: 0 }));
    ctx.setParam('region', 'JP');
    await ctx.runQuery('q', "SELECT * FROM t WHERE region = '{region}'");
    expect(JSON.parse(fetch.mock.calls[0][1].body).code).toBe("SELECT * FROM t WHERE region = 'JP'");
  });

  it('leaves unknown params untouched', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    fetch.mockResolvedValue(okResponse({ columns: [], rows: [], rowCount: 0 }));
    await ctx.runQuery('q', "WHERE x = '{missing}'");
    expect(JSON.parse(fetch.mock.calls[0][1].body).code).toBe("WHERE x = '{missing}'");
  });

  it('setParam re-runs only queries that reference the param and were already run', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    fetch.mockResolvedValue(okResponse({ columns: [], rows: [], rowCount: 0 }));

    ctx.registerQuery('uses_param', "SELECT '{region}'", false);
    ctx.registerQuery('no_param', 'SELECT 1', false);

    // run both manually
    await ctx.runQuery('uses_param', "SELECT '{region}'");
    await ctx.runQuery('no_param', 'SELECT 1');
    expect(fetch.mock.calls.length).toBe(2);

    ctx.setParam('region', 'JP');
    // only uses_param should re-run
    const bodies = fetch.mock.calls.slice(2).map((c) => JSON.parse(c[1].body).code);
    expect(bodies).toEqual(["SELECT 'JP'"]);
  });

  it('applyParams sets params and re-runs affected queries once each', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    fetch.mockResolvedValue(okResponse({ columns: [], rows: [], rowCount: 0 }));

    ctx.registerQuery('q1', 'WHERE price >= {min_price}', false);
    ctx.registerQuery('q2', "WHERE region = '{region}'", false);
    ctx.registerQuery('q3', 'SELECT 1', false);

    ctx.applyParams({ min_price: '100', region: '東京' });

    expect(get(ctx.params).min_price).toBe('100');
    expect(get(ctx.params).region).toBe('東京');
    // q1/q2 のみ、それぞれ1回実行 (applyParams は未実行クエリも対象)
    expect(fetch.mock.calls.length).toBe(2);
    const bodies = fetch.mock.calls.map((c) => JSON.parse(c[1].body).code);
    expect(bodies).toContain('WHERE price >= 100');
    expect(bodies).toContain("WHERE region = '東京'");
  });

  it('applyParams with no values is a no-op', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    fetch.mockResolvedValue(okResponse({ columns: [], rows: [], rowCount: 0 }));
    ctx.registerQuery('q1', 'SELECT 1', false);
    ctx.applyParams({});
    expect(fetch).not.toHaveBeenCalled();
  });
});
