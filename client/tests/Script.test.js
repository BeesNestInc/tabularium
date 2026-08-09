import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/svelte';
import Script from '../src/components/knowledge/Script.svelte';
import { createQueryContext } from '../src/libs/query-context.js';

const ok = () => ({
  ok: true,
  json: async () => ({ columns: [{ name: 'val', type: 'integer' }], rows: [{ val: 1 }, { val: 2 }], rowCount: 2, duration: 3 }),
});

describe('Script.svelte', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok()));
  });

  it('shows the code and a run button', () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(Script, { props: { ctx, code: 'output("hi")' } });
    expect(screen.getByText('output("hi")')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '▶ Run' })).toBeInTheDocument();
  });

  it('runs async code with ctx and writes via output()', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    const code = `const d = await runQuery('q', 'SELECT 1;');\noutput('<h3>got ' + d.rowCount + '</h3>');`;
    render(Script, { props: { ctx, code } });
    await fireEvent.click(screen.getByRole('button', { name: '▶ Run' }));
    await waitFor(() => expect(screen.getByText(/got 2/)).toBeInTheDocument());
  });

  it('runQuery(name) runs a query registered by a Query block', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    ctx.registerQuery('q1', 'SELECT 1;', false);
    const code = `const d = await runQuery('q1');\noutput(d.rowCount);`;
    render(Script, { props: { ctx, code } });
    await fireEvent.click(screen.getByRole('button', { name: '▶ Run' }));
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
  });

  it('shows the error message when a query fails', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'boom' }) });
    const ctx = createQueryContext({ engine: 'duckdb' });
    const code = `await runQuery('q', 'SELECT 1;');`;
    render(Script, { props: { ctx, code } });
    await fireEvent.click(screen.getByRole('button', { name: '▶ Run' }));
    await waitFor(() => expect(screen.getAllByText(/boom/).length).toBeGreaterThan(0));
  });

  it('captures thrown exceptions from user code', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    const code = `throw new Error('my boom');`;
    render(Script, { props: { ctx, code } });
    await fireEvent.click(screen.getByRole('button', { name: '▶ Run' }));
    await waitFor(() => expect(screen.getAllByText(/my boom/).length).toBeGreaterThan(0));
  });
});
