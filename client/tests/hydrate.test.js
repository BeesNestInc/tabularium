import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/svelte';
import { hydrate, unmountAll } from '../src/libs/hydrate.js';
import { placeholderHtml } from '../src/libs/markdown-render.js';
import { createQueryContext } from '../src/libs/query-context.js';

vi.mock('echarts', () => ({
  init: () => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }),
}));

const ok = () => ({
  ok: true,
  json: async () => ({ columns: [{ name: 'val', type: 'integer' }], rows: [{ val: 1 }], rowCount: 1, duration: 3 }),
});

describe('hydrate', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok()));
    document.body.innerHTML = '';
  });

  it('mounts a Query component onto its placeholder', async () => {
    const root = document.createElement('div');
    root.innerHTML = placeholderHtml('Query', { name: 'q', sql: 'SELECT 1;' }, '');
    document.body.appendChild(root);

    const ctx = createQueryContext({ engine: 'duckdb' });
    const mounted = await hydrate(root, ctx);

    expect(mounted.length).toBe(1);
    expect(root.querySelector('.sql-run-btn')).not.toBeNull();
    expect(root.textContent).toContain('SELECT 1;');
    unmountAll(mounted);
  });

  it('sets auto=true on a query referenced by a chart', async () => {
    const root = document.createElement('div');
    root.innerHTML =
      placeholderHtml('Query', { name: 'q1', sql: 'SELECT 1;' }, '') +
      placeholderHtml('Chart', { type: 'LineChart', data: 'q1', x: 'x', y: 'y' }, '');
    document.body.appendChild(root);

    const ctx = createQueryContext({ engine: 'duckdb' });
    const mounted = await hydrate(root, ctx);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.code).toBe('SELECT 1;');
    unmountAll(mounted);
  });

  it('mounts Chart + DataTable and wires them to query results', async () => {
    const root = document.createElement('div');
    root.innerHTML =
      placeholderHtml('Query', { name: 'q1', sql: 'SELECT 1;' }, '') +
      placeholderHtml('DataTable', { type: 'DataTable', data: 'q1' }, '');
    document.body.appendChild(root);

    const ctx = createQueryContext({ engine: 'duckdb' });
    const mounted = await hydrate(root, ctx);

    await waitFor(() => expect(root.querySelector('.mdx-table-wrap')).not.toBeNull());
    expect(root.querySelectorAll('.sql-run-btn').length).toBe(1);
    unmountAll(mounted);
  });

  it('ignores unknown hydrate names', async () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="mdx-hydrate" data-hydrate="DoesNotExist" data-props='{}'>x</div>`;
    document.body.appendChild(root);
    const ctx = createQueryContext({ engine: 'duckdb' });
    const mounted = await hydrate(root, ctx);
    expect(mounted.length).toBe(0);
  });

  it('returns [] when no placeholders present', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>plain</p>';
    const ctx = createQueryContext({ engine: 'duckdb' });
    expect(await hydrate(root, ctx)).toEqual([]);
  });
});
