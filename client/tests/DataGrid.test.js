import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import DataGrid from '../src/components/knowledge/DataGrid.svelte';
import { createQueryContext } from '../src/libs/query-context.js';

let jssOptions = null;
let mockWs = null;

vi.mock('jspreadsheet-ce', () => {
  const destroy = vi.fn();
  const jspreadsheet = vi.fn((_container, opts) => {
    jssOptions = opts.worksheets[0];
    mockWs = {
      getData: vi.fn(() => [['a1', 1], ['a2', 2]]),
      getColumns: vi.fn(() => [{ title: 'x' }, { title: 'y' }]),
    };
    return { worksheets: [mockWs] };
  });
  jspreadsheet.destroy = destroy;
  return { default: jspreadsheet };
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
    jssOptions = null;
    mockWs = null;
  });

  it('renders a grid from a plain object', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(DataGrid, { props: { ctx, data: queryResult } });
    await waitFor(() => expect(jssOptions).not.toBeNull());
    expect(jssOptions.data).toEqual([['a', 100, '2026-08-01T00:00:00.000Z'], ['b', 200, '2026-08-02T00:00:00.000Z']]);
    expect(jssOptions.columns.map((c) => c.title)).toEqual(['name', 'amount', 'day']);
  });

  it('auto-infers column types and widths when not given', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(DataGrid, { props: { ctx, data: queryResult } });
    await waitFor(() => expect(jssOptions).not.toBeNull());
    const types = jssOptions.columns.map((c) => c.type);
    expect(types[0]).toBe('text');
    expect(types[1]).toBe('numeric');
    expect(types[2]).toBe('date');
    expect(jssOptions.columns.every((c) => c.width > 0)).toBe(true);
  });

  it('honors explicit types and widths options', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(DataGrid, { props: { ctx, data: queryResult, types: 'text,date,checkbox', widths: '100,200,300' } });
    await waitFor(() => expect(jssOptions).not.toBeNull());
    expect(jssOptions.columns.map((c) => c.type)).toEqual(['text', 'date', 'checkbox']);
    expect(jssOptions.columns.map((c) => c.width)).toEqual([100, 200, 300]);
  });

  it('resolves a query name from the results store and auto-runs', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    ctx.results.set({ q: { status: 'done', data: queryResult } });
    render(DataGrid, { props: { ctx, data: 'q' } });
    await waitFor(() => expect(jssOptions).not.toBeNull());
    expect(jssOptions.data.length).toBe(2);
  });

  it('normalizes an object array', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(DataGrid, { props: { ctx, data: [{ a: 1, b: 'x' }, { a: 2, b: 'y' }] } });
    await waitFor(() => expect(jssOptions).not.toBeNull());
    expect(jssOptions.columns.map((c) => c.title)).toEqual(['a', 'b']);
    expect(jssOptions.data).toEqual([[1, 'x'], [2, 'y']]);
  });

  it('publishes edits via name → getGrid and dispatches change', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    let received = null;
    render(DataGrid, {
      props: { ctx, data: queryResult, name: 't', onchange: (v) => { received = v; } },
    });
    await waitFor(() => expect(jssOptions).not.toBeNull());
    jssOptions.onchange();
    await waitFor(() => expect(ctx.getGrid('t')).toBeTruthy());
    expect(ctx.getGrid('t')).toEqual({ headers: ['x', 'y'], rows: [['a1', 1], ['a2', 2]] });
    expect(received).toEqual({ headers: ['x', 'y'], rows: [['a1', 1], ['a2', 2]] });
  });
});
