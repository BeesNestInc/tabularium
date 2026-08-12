import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Tablarium, Legion, configure } from '../src/libs/std.js';

const ok = (data) => ({ ok: true, json: async () => data });
const err = (message) => ({ ok: false, json: async () => ({ error: message }) });

describe('std / Tablarium', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    configure({ tablariumBase: '', legionBase: '', credentials: 'include' });
  });
  afterEach(() => configure({ tablariumBase: '', legionBase: '', credentials: 'include' }));

  it('query.run posts to /api/execute with code + language', async () => {
    fetch.mockResolvedValue(ok({ rows: [{ a: 1 }] }));
    await Tablarium.query.run('SELECT 1');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/execute');
    expect(JSON.parse(init.body)).toEqual({ language: 'sql', code: 'SELECT 1' });
    expect(init.credentials).toBe('include');
  });

  it('query.run passes attach', async () => {
    fetch.mockResolvedValue(ok({}));
    await Tablarium.query.run('SELECT 1', { language: 'duckdb', attach: { pg: 'x' } });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ language: 'duckdb', code: 'SELECT 1', attach: { pg: 'x' } });
  });

  it('query.importFrontmatter posts to /api/frontmatter/import', async () => {
    fetch.mockResolvedValue(ok({ table: 't', rows: 3 }));
    await Tablarium.query.importFrontmatter('knowledge/x', 't');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/frontmatter/import');
    expect(JSON.parse(init.body)).toEqual({ path: 'knowledge/x', as: 't' });
  });

  it('collab.config / auth.me hit the right endpoints', async () => {
    fetch.mockResolvedValue(ok({}));
    await Tablarium.collab.config();
    expect(fetch.mock.calls[0][0]).toBe('/api/collabora/config');
    await Tablarium.auth.me();
    expect(fetch.mock.calls[1][0]).toBe('/api/auth/me');
  });

  it('knowledge namespace is reused from knowledge-api', () => {
    expect(typeof Tablarium.knowledge.fetchRaw).toBe('function');
    expect(typeof Tablarium.knowledge.saveRaw).toBe('function');
    expect(typeof Tablarium.knowledge.fetchInfo).toBe('function');
    expect(typeof Tablarium.knowledge.bookmarkAdd).toBe('function');
  });

  it('knowledge.list resolves entries from the page API', async () => {
    fetch.mockResolvedValue(ok({ type: 'directory', entries: [{ name: 'a.md' }, { name: 'b.md' }] }));
    const entries = await Tablarium.knowledge.list('knowledge/x');
    expect(fetch.mock.calls[0][0]).toBe('/api/knowledge/page?path=' + encodeURIComponent('knowledge/x'));
    expect(entries.length).toBe(2);
  });

  it('throws the server error message on !ok', async () => {
    fetch.mockResolvedValue(err('path not found'));
    await expect(Tablarium.query.importFrontmatter('nope')).rejects.toThrow('path not found');
  });
});

describe('std / Legion', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    configure({ legionBase: '', credentials: 'include' });
  });
  afterEach(() => configure({ legionBase: '', credentials: 'include' }));

  it('personas.list hits /api/personas', async () => {
    fetch.mockResolvedValue(ok([{ id: 1 }]));
    await Legion.personas.list();
    expect(fetch.mock.calls[0][0]).toBe('/api/personas');
  });

  it('chat.send posts message to /api/chat', async () => {
    fetch.mockResolvedValue(ok({}));
    await Legion.chat.send('hello');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/chat');
    expect(JSON.parse(init.body)).toEqual({ message: 'hello' });
  });

  it('tasks.list builds query string', async () => {
    fetch.mockResolvedValue(ok({ tasks: [] }));
    await Legion.tasks.list({ status: 'running', limit: 5 });
    expect(fetch.mock.calls[0][0]).toBe('/api/tasks?status=running&limit=5');
  });

  it('supervisor.logs hits the persona/mode path', async () => {
    fetch.mockResolvedValue(ok({}));
    await Legion.supervisor.logs('ichinose', 'web');
    expect(fetch.mock.calls[0][0]).toBe('/api/supervisor/logs/ichinose/web');
  });

  it('uses the configured legionBase for cross-origin calls', async () => {
    configure({ legionBase: 'http://legion.example' });
    fetch.mockResolvedValue(ok([]));
    await Legion.roles.list();
    expect(fetch.mock.calls[0][0]).toBe('http://legion.example/api/roles');
  });
});
