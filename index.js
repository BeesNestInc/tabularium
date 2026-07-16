import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, rmSync, accessSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import { createBookmarkRoutes } from '../src/libs/bookmarks.js';
import { registerKnowledgeRoutes } from '../src/libs/knowledge-routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const envLocal = path.join(__dirname, '.env');
const envParent = path.join(projectRoot, '.env');
if (existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (existsSync(envParent)) {
  dotenv.config({ path: envParent });
}

const PORT = parseInt(process.env.PORT || '8888', 10);
const HOST = process.env.HOST || '0.0.0.0';

// --- multi-root setup ---

const resolvePath = (p) => {
  let s = p;
  if (s.startsWith('~/') || s === '~') s = (process.env.HOME || '/root') + s.slice(1);
  if (s.startsWith('$HOME')) s = (process.env.HOME || '/root') + s.slice(5);
  if (path.isAbsolute(s)) return path.resolve(s);
  return path.resolve(projectRoot, s);
};

const parseRootsFromEnv = () => {
  const raw = process.env.KNOWLEDGE_ROOTS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(r => ({ ...r, path: resolvePath(r.path) }));
      }
    } catch {}
  }
  const fallback = resolvePath(process.env.KNOWLEDGE_BASE || 'knowledge');
  const name = path.basename(fallback);
  return [{ name, path: fallback }];
};

const ROOTS_FILE = path.join(__dirname, 'roots.json');

const loadRootsFile = () => {
  try {
    if (existsSync(ROOTS_FILE)) {
      const data = JSON.parse(readFileSync(ROOTS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch {}
  return [];
};

const saveRootsFile = (data) => {
  writeFileSync(ROOTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
};

let persistedRoots = loadRootsFile();

const getRoots = () => {
  const envRoots = parseRootsFromEnv();
  const merged = [...envRoots];
  for (const pr of persistedRoots) {
    if (!merged.some(r => r.name === pr.name)) {
      merged.push({ ...pr, path: resolvePath(pr.path) });
    }
  }
  return merged;
};

let roots = getRoots();

const isPathAccessible = (dirPath) => {
  try {
    accessSync(dirPath, 4);
    const parent = path.dirname(dirPath);
    accessSync(parent, 4 | 1);
    return true;
  } catch {
    return false;
  }
};

const resolveRoot = (rootName) => {
  if (!rootName) return roots[0] || null;
  return roots.find(r => r.name === rootName) || null;
};

const assertRootAccess = (rootDir) => {
  if (!existsSync(rootDir)) return { ok: false, code: 404, error: 'not found' };
  if (!isPathAccessible(rootDir)) return { ok: false, code: 403, error: 'パーミッションがないよ' };
  return null;
};

const splitRootPath = (pathStr) => {
  if (!pathStr) return null;
  const slashIdx = pathStr.indexOf('/');
  const firstSeg = slashIdx === -1 ? pathStr : pathStr.slice(0, slashIdx);
  const restPath = slashIdx === -1 ? '' : pathStr.slice(slashIdx + 1);
  const byName = resolveRoot(firstSeg);
  if (byName) {
    const err = assertRootAccess(byName.path);
    if (!err) return { root: byName, filePath: restPath };
  }
  const expanded = pathStr.startsWith('/')
    ? (pathStr.startsWith(projectRoot) ? pathStr : path.resolve(projectRoot, pathStr.slice(1)))
    : path.resolve(projectRoot, pathStr);
  for (const r of roots) {
    if (expanded.startsWith(r.path)) {
      const rel = expanded.slice(r.path.length).replace(/^\//, '');
      const err = assertRootAccess(r.path);
      if (!err) return { root: r, filePath: rel || '' };
    }
  }
  for (const r of roots) {
    const testPath = path.resolve(r.path, pathStr);
    if (existsSync(testPath) || existsSync(path.dirname(testPath))) {
      const err = assertRootAccess(r.path);
      if (!err) return { root: r, filePath: pathStr };
    }
  }
  return null;
};

// --- markdown ---

const buildTree = (dirPath, relativeRoot, showHidden = false, depth = 0, ctx = null) => {
  if (depth > 8) return [];
  if (!ctx) ctx = { count: 0 };
  if (ctx.count > 2000) return [];
  let entries;
  try {
    entries = readdirSync(dirPath);
  } catch { return []; }
  if (entries.length > 200) entries = entries.slice(0, 200);
  const children = [];

  for (const entry of entries) {
    if (ctx.count > 2000) break;
    if (!showHidden && entry.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry);
    const relativePath = path.join(relativeRoot, entry);
    let stat;
    try { stat = statSync(fullPath); } catch { continue; }
    ctx.count++;

    children.push({
      name: entry, type: stat.isDirectory() ? 'directory' : 'file', path: relativePath,
      size: stat.size, mtime: stat.mtime.toISOString(), birthtime: stat.birthtime.toISOString(),
      mode: stat.mode, uid: stat.uid, gid: stat.gid,
      ...(stat.isDirectory() ? { children: buildTree(fullPath, relativePath, showHidden, depth + 1, ctx) } : {}),
    });
  }

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return children;
};

const MIME_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain', '.csv': 'text/csv',
  '.json': 'application/json', '.yaml': 'text/yaml', '.yml': 'text/yaml',
  '.js': 'text/javascript', '.ts': 'text/typescript',
  '.css': 'text/css', '.scss': 'text/x-scss',
  '.html': 'text/html', '.htm': 'text/html',
  '.xml': 'application/xml',
  '.ical': 'text/calendar',
};

const checkPath = (absolutePath, rootDir) => {
  return absolutePath.startsWith(rootDir);
};

import { status as coolStatus, start as coolStart, stop as coolStop, logs as coolLogs } from './collabora.js';
import wopiRoutes from './wopi.js';

const registerCollaboraRoutes = (app) => {
  app.get('/api/collabora/status', async () => coolStatus());
  app.post('/api/collabora/start', async (request, reply) => {
    try { return await coolStart(); } catch (err) { return reply.code(500).send({ ok: false, error: err.message }); }
  });
  app.post('/api/collabora/stop', async (request, reply) => {
    try { return await coolStop(); } catch (err) { return reply.code(500).send({ ok: false, error: err.message }); }
  });
  app.get('/api/collabora/logs', async (request) => {
    const lines = parseInt(request.query.lines, 10) || 50;
    return coolLogs(lines);
  });
  app.get('/api/collabora/config', async () => {
    const wopiHost = process.env.WOPI_SRC || `http://localhost:${PORT}`;
    const coolHost = process.env.COLLABORA_HOST || `http://localhost:9980`;
    const coolBrowserPath = process.env.COLLABORA_BROWSER_PATH || '/browser/de013a57f9/cool.html';
    return { coolHost, coolBrowserPath, wopiHost };
  });
};

const registerWikiKnowledgeRoutes = (app) => {

  // --- root management (wiki-server specific: persists to roots.json) ---

  app.get('/api/knowledge/roots', async () => {
    const withAccess = roots.map(r => {
      const accessible = existsSync(r.path) && isPathAccessible(r.path);
      return { ...r, accessible, exists: existsSync(r.path) };
    });
    return { roots: withAccess };
  });

  app.post('/api/knowledge/roots', async (request, reply) => {
    const { name, path: rootPath } = request.body ?? {};
    if (!name || !rootPath) return reply.code(400).send({ error: 'name and path are required' });
    if (name.includes('/') || name.includes('\\') || name.includes('..')) return reply.code(400).send({ error: 'invalid name' });
    const resolvedPath = resolvePath(rootPath);
    if (!existsSync(resolvedPath)) return reply.code(404).send({ error: 'not found' });
    if (!isPathAccessible(resolvedPath)) return reply.code(403).send({ error: 'パーミッションがないよ' });
    if (roots.some(r => r.name === name)) return reply.code(409).send({ error: 'root name already exists' });
    persistedRoots.push({ name, path: rootPath });
    saveRootsFile(persistedRoots);
    roots = getRoots();
    return { ok: true, roots: roots.map(r => ({ ...r, accessible: isPathAccessible(r.path), exists: existsSync(r.path) })) };
  });

  app.put('/api/knowledge/roots', async (request, reply) => {
    const { roots: newRoots } = request.body ?? {};
    if (!Array.isArray(newRoots)) return reply.code(400).send({ error: 'roots must be an array' });
    for (const r of newRoots) {
      if (!r.name || !r.path) return reply.code(400).send({ error: 'each root must have name and path' });
      if (r.name.includes('/') || r.name.includes('\\') || r.name.includes('..')) return reply.code(400).send({ error: `invalid root name: ${r.name}` });
      const resolvedPath = resolvePath(r.path);
      if (!existsSync(resolvedPath)) return reply.code(404).send({ error: `root path not found: ${r.name}` });
      if (!isPathAccessible(resolvedPath)) return reply.code(403).send({ error: `パーミッションがないよ: ${r.name}` });
      r.path = resolvedPath;
    }
    const envNames = parseRootsFromEnv().map(r => r.name);
    persistedRoots = newRoots.filter(r => !envNames.includes(r.name));
    saveRootsFile(persistedRoots);
    roots = getRoots();
    return { ok: true, roots: roots.map(r => ({ ...r, accessible: isPathAccessible(r.path), exists: existsSync(r.path) })) };
  });

  app.delete('/api/knowledge/roots/:name', async (request, reply) => {
    const { name } = request.params;
    const envNames = parseRootsFromEnv().map(r => r.name);
    if (envNames.includes(name)) return reply.code(400).send({ error: 'cannot remove env-configured root' });
    const idx = persistedRoots.findIndex(r => r.name === name);
    if (idx === -1) return reply.code(404).send({ error: 'root not found' });
    persistedRoots = persistedRoots.filter((_, i) => i !== idx);
    saveRootsFile(persistedRoots);
    roots = getRoots();
    return { ok: true, roots: roots.map(r => ({ ...r, accessible: isPathAccessible(r.path), exists: existsSync(r.path) })) };
  });

  // --- shared knowledge routes (tree, content, raw, file, info, move, create, etc.) ---
  registerKnowledgeRoutes(app, {
    rootPath: '/api/knowledge',
    splitRootPath: (p) => splitRootPath(p),
    getRoots: () => roots,
    assertRootAccess,
    mimeTypes: MIME_TYPES,
    buildTree,
  });

  // --- bookmarks (shared from src/libs/bookmarks.js) ---
  createBookmarkRoutes(app, {
    splitRootPath: (_req, p) => splitRootPath(p),
    prefix: '/api',
  });
};

const start = async () => {
  const app = Fastify({ logger: true });

  // Fake auth endpoints for shared Svelte frontend
  app.get('/api/auth/me', async () => ({ user: { id: 'wiki', name: 'Wiki', role: 'admin' } }));
  app.post('/api/auth/logout', async () => ({}));
  app.post('/api/auth/login', async () => ({ ok: true }));

  registerWikiKnowledgeRoutes(app);
  registerCollaboraRoutes(app);
  await app.register(wopiRoutes, {
    knowledgeBase: roots[0]?.path || resolvePath(process.env.KNOWLEDGE_BASE || 'knowledge'),
    wopiSrc: process.env.WOPI_SRC || `http://localhost:${PORT}`,
    splitRootPath: (request, path) => splitRootPath(path),
  });

  const publicDir = path.join(__dirname, 'public');
  const serveIndex = (reply) => {
    const indexFile = path.join(publicDir, 'wiki.html');
    if (existsSync(indexFile)) {
      return reply.type('text/html').send(readFileSync(indexFile, 'utf-8'));
    }
    // fallback to index.html (legacy or main SPA)
    const legacyFile = path.join(publicDir, 'index.html');
    if (existsSync(legacyFile)) {
      return reply.type('text/html').send(readFileSync(legacyFile, 'utf-8'));
    }
    return reply.code(404).send({ error: 'not found' });
  };

  if (existsSync(publicDir)) {
    await app.register(fastifyStatic, {
      root: publicDir,
      prefix: '/',
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not found' });
      }
      return serveIndex(reply);
    });
  }

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Wiki server running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`Knowledge roots (${roots.length}):`, roots.map(r => `${r.name}: ${r.path}`).join(', '));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
