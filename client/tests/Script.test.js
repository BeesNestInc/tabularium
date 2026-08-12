import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/svelte';
import Script from '../src/components/knowledge/Script.svelte';
import { createQueryContext } from '../src/libs/query-context.js';
import { registerScriptHelper } from '../src/libs/script-helpers.js';

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

  it('shares top-level declarations across script blocks (let/const/function)', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(Script, { props: { ctx, code: `let base = 10;\nconst step = 5;\nfunction total() { return base + step; }\n` } });
    await fireEvent.click(screen.getByRole('button', { name: '▶ Run' }));
    await waitFor(() => expect(ctx.scriptStore.base).toBe(10));

    // 別ブロック(同一ctx)から共有宣言を参照
    render(Script, { props: { ctx, code: `output('total=' + total());` } });
    const buttons = screen.getAllByRole('button', { name: '▶ Run' });
    await fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(screen.getAllByText(/total=15/).length).toBeGreaterThan(0));
    expect(ctx.scriptStore.step).toBe(5);
  });

  it('does not leak script declarations onto the global object', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(Script, { props: { ctx, code: `let leaked = 123;\n` } });
    await fireEvent.click(screen.getByRole('button', { name: '▶ Run' }));
    await waitFor(() => expect(ctx.scriptStore.leaked).toBe(123));
    expect(globalThis.leaked).toBeUndefined();
  });

  it('injects registered script helpers into the run scope', async () => {
    registerScriptHelper('MyStd', { greet: () => 'hello-from-std' });
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(Script, { props: { ctx, code: `output(MyStd.greet());` } });
    await fireEvent.click(screen.getByRole('button', { name: '▶ Run' }));
    await waitFor(() => expect(screen.getByText('hello-from-std')).toBeInTheDocument());
  });

  it('stores the return value of a named script and exposes it via getScript', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(Script, { props: { ctx, name: 'compute', code: `const x = 6 * 7;\nreturn x;` } });
    await fireEvent.click(screen.getByRole('button', { name: '▶ Run' }));
    await waitFor(() => expect(ctx.getScriptResult('compute')).toBe(42));

    // 別ブロックから getScript で参照
    render(Script, { props: { ctx, code: `output('result: ' + getScript('compute'));` } });
    const buttons = screen.getAllByRole('button', { name: '▶ Run' });
    await fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(screen.getAllByText(/result: 42/).length).toBeGreaterThan(0));
  });

  it('unnamed scripts do not store a script result', async () => {
    const ctx = createQueryContext({ engine: 'duckdb' });
    render(Script, { props: { ctx, code: `return 99;` } });
    await fireEvent.click(screen.getByRole('button', { name: '▶ Run' }));
    await waitFor(() => expect(screen.getByText('99')).toBeInTheDocument());
    expect(Object.keys(ctx.scriptResults).length).toBe(0);
  });
});
