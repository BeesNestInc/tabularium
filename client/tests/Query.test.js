import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/svelte';
import Query from '../src/components/knowledge/Query.svelte';
import { createQueryContext } from '../src/libs/query-context.js';

vi.mock('echarts', () => ({
  init: () => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }),
}));

const rows = (n) => Array.from({ length: n }, (_, i) => ({ val: i }));
const ok = () => ({
  ok: true,
  json: async () => ({ columns: [{ name: 'val', type: 'integer' }], rows: rows(2), rowCount: 2, duration: 3 }),
});

describe('Query.svelte', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok()));
  });

  it('renders SQL code and a run button', () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(Query, { props: { ctx, name: 'q', sql: 'SELECT 1;', auto: false } });
    expect(screen.getByText('SELECT 1;')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '▶ Run' })).toBeInTheDocument();
  });

  it('runs the query on button click and shows the result table', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(Query, { props: { ctx, name: 'q', sql: 'SELECT 1;', auto: false } });
    await fireEvent.click(screen.getByRole('button', { name: '▶ Run' }));
    await waitFor(() => expect(screen.getByText(/✔ 2 rows/)).toBeInTheDocument());
    expect(screen.getByText('val')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 rows
  });

  it('auto-runs on mount when auto=true', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(Query, { props: { ctx, name: 'q', sql: 'SELECT 1;', auto: true } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/✔ 2 rows/)).toBeInTheDocument());
  });

  it('shows error message when the query fails', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'syntax error' }) });
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(Query, { props: { ctx, name: 'q', sql: 'BAD SQL', auto: true } });
    await waitFor(() => expect(screen.getAllByText(/✘ syntax error/).length).toBeGreaterThan(0));
  });

  it('posts with engine + attach from page meta', async () => {
    const ctx = createQueryContext({ engine: 'duckdb', databases: { default: 'x' } });
    render(Query, { props: { ctx, name: 'q', sql: 'SELECT 1;', auto: true } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.language).toBe('duckdb');
    expect(body.attach).toEqual({ default: 'x' });
  });
});
