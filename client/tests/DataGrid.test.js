import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import DataGrid from '../src/components/knowledge/DataGrid.svelte';
import { createQueryContext } from '../src/libs/query-context.js';

const mocks = vi.hoisted(() => ({ jssOptions: null, mockWs: null, jspreadsheet: null }));

vi.mock('jspreadsheet-ce', () => {
  const destroy = vi.fn();
  mocks.jspreadsheet = vi.fn((_container, opts) => {
    mocks.jssOptions = opts.worksheets[0];
    mocks.mockWs = {
      getData: vi.fn(() => [['a1', 1], ['a2', 2]]),
      getColumns: vi.fn(() => [{ title: 'x' }, { title: 'y' }]),
    };
    return { worksheets: [mocks.mockWs] };
  });
  mocks.jspreadsheet.destroy = destroy;
  return { default: mocks.jspreadsheet };
});

const queryResult = {
  columns: [
    { name: 'name', type: 'string' },
    { name: 'amount', type: 'number' },
    { name: 'day', type: 'date' },
  ],
  rows: [
    { name: 'a', amount: 100, day: '2026-08-01T00:00:00.000Z' },
    { name: 'b', amount: 200, day: '2026-08-02T00:00:00.000Z' },
  ],
};

describe('DataGrid.svelte', () => {
  beforeEach(() => {
    mocks.jssOptions = null;
    mocks.mockWs = null;
  });

  it('renders a grid from a plain object', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(DataGrid, { props: { ctx, data: queryResult } });
    await waitFor(() => expect(mocks.jssOptions).not.toBeNull());
    expect(mocks.jssOptions.data).toEqual([['a', 100, '2026-08-01T00:00:00.000Z'], ['b', 200, '2026-08-02T00:00:00.000Z']]);
    expect(mocks.jssOptions.columns.map((c) => c.title)).toEqual(['name', 'amount', 'day']);
  });

  it('auto-infers column types and widths when not given', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(DataGrid, { props: { ctx, data: queryResult } });
    await waitFor(() => expect(mocks.jssOptions).not.toBeNull());
    const types = mocks.jssOptions.columns.map((c) => c.type);
    expect(types[0]).toBe('text');
    expect(types[1]).toBe('numeric');
    expect(types[2]).toBe('date');
    expect(mocks.jssOptions.columns.every((c) => c.width > 0)).toBe(true);
  });

  it('honors explicit types and widths options', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(DataGrid, { props: { ctx, data: queryResult, types: 'text,date,checkbox', widths: '100,200,300' } });
    await waitFor(() => expect(mocks.jssOptions).not.toBeNull());
    expect(mocks.jssOptions.columns.map((c) => c.type)).toEqual(['text', 'date', 'checkbox']);
    expect(mocks.jssOptions.columns.map((c) => c.width)).toEqual([100, 200, 300]);
  });

  it('resolves a query name from the results store and auto-runs', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    ctx.results.set({ q: { status: 'done', data: queryResult } });
    render(DataGrid, { props: { ctx, data: 'q' } });
    await waitFor(() => expect(mocks.jssOptions).not.toBeNull());
    expect(mocks.jssOptions.data.length).toBe(2);
  });

  it('normalizes an object array', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(DataGrid, { props: { ctx, data: [{ a: 1, b: 'x' }, { a: 2, b: 'y' }] } });
    await waitFor(() => expect(mocks.jssOptions).not.toBeNull());
    expect(mocks.jssOptions.columns.map((c) => c.title)).toEqual(['a', 'b']);
    expect(mocks.jssOptions.data).toEqual([[1, 'x'], [2, 'y']]);
  });

  it('publishes edits via name → getGrid and dispatches change', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    let received = null;
    render(DataGrid, {
      props: { ctx, data: queryResult, name: 't', onchange: (v) => { received = v; } },
    });
    await waitFor(() => expect(mocks.jssOptions).not.toBeNull());
    mocks.jssOptions.onchange();
    await waitFor(() => expect(ctx.getGrid('t')).toBeTruthy());
    expect(ctx.getGrid('t')).toEqual({ headers: ['x', 'y'], rows: [['a1', 1], ['a2', 2]] });
    expect(received).toEqual({ headers: ['x', 'y'], rows: [['a1', 1], ['a2', 2]] });
  });

  it('keeps the grid mounted and re-initializes when the query re-runs', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    ctx.results.set({ q: { status: 'done', data: queryResult } });
    render(DataGrid, { props: { ctx, data: 'q' } });
    await waitFor(() => expect(mocks.jspreadsheet).toHaveBeenCalledTimes(1));

    // 再実行: running 中は data が無い（source が一時的に undefined）
    ctx.results.set({ q: { status: 'running' } });
    await tick();

    // グリッド div は消えない
    expect(document.querySelector('.mdx-datagrid')).not.toBeNull();

    // 完了 → 新データで再初期化される（消えたままにならない）
    ctx.results.set({
      q: { status: 'done', data: { ...queryResult, rows: [{ name: 'c', amount: 300, day: '2026-08-03T00:00:00.000Z' }] } },
    });
    await waitFor(() => expect(mocks.jspreadsheet).toHaveBeenCalledTimes(2));
    expect(document.querySelector('.mdx-datagrid')).not.toBeNull();
  });
});
