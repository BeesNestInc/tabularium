import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, rmSync, accessSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import MarkdownIt from 'markdown-it';
import { full as Emoji } from 'markdown-it-emoji';
import Prism from 'markdown-it-prism';
import Attrs from 'markdown-it-attrs';
import Anchor from 'markdown-it-anchor';
import dotenv from 'dotenv';
import yaml from 'yaml';
import crypto from 'node:crypto';

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

// --- markdown ---

const matter = (content) => {
  const frontmatterRegex = /(?:^|\n)---\n([\s\S]*?)\n---\n?/;
  const match = content.match(frontmatterRegex);
  if (match) {
    const data = yaml.parse(match[1]);
    return {
      data: data,
      content: content.slice(match[0].length)
    };
  } else {
    return { data: {}, content };
  }
};

// --- bookmarks ---

const ensureBookmarksDir = (dir) => {
  const bmDir = path.join(dir, '.bookmarks');
  mkdirSync(bmDir, { recursive: true });
  mkdirSync(path.join(bmDir, 'favicons'), { recursive: true });
  mkdirSync(path.join(bmDir, 'thumbs'), { recursive: true });
  return bmDir;
};

const readBookmarks = (dir) => {
  const bmFile = path.join(dir, '.bookmarks', 'bookmarks.yaml');
  if (!existsSync(bmFile)) return [];
  try {
    const data = yaml.parse(readFileSync(bmFile, 'utf-8'));
    return data.bookmarks || [];
  } catch { return []; }
};

const writeBookmarks = (dir, bookmarks) => {
  ensureBookmarksDir(dir);
  const bmFile = path.join(dir, '.bookmarks', 'bookmarks.yaml');
  writeFileSync(bmFile, yaml.stringify({ bookmarks }), 'utf-8');
};

const fetchFavicon = async (url, dir) => {
  try {
    const domain = new URL(url).hostname;
    const fp = path.join(dir, '.bookmarks', 'favicons', domain + '.ico');
    if (existsSync(fp)) return;
    const res = await fetch(`https://${domain}/favicon.ico`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) writeFileSync(fp, Buffer.from(await res.arrayBuffer()));
  } catch {}
};

const fetchOgImage = async (url, dir) => {
  try {
    const thumbDir = path.join(dir, '.bookmarks', 'thumbs');
    mkdirSync(thumbDir, { recursive: true });
    let imageUrl;
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (yt) {
      imageUrl = `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`;
    } else {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const html = await res.text();
      const m = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      if (!m) return;
      imageUrl = m[1];
    }
    const img = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!img.ok) return;
    const buf = Buffer.from(await img.arrayBuffer());
    const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
    const ext = (imageUrl.match(/\.(\w{3,4})(?:\?|$)/)?.[1] || 'jpg').toLowerCase();
    writeFileSync(path.join(thumbDir, `${hash}.${ext}`), buf);
    return `${hash}.${ext}`;
  } catch {}
};

const renderBookmarksHtml = (absolutePath, rootPath, rootName) => {
  const dir = path.dirname(absolutePath);
  const bookmarks = readBookmarks(dir);
  if (!bookmarks.length) return '';
  const folderRel = rootPath ? path.relative(rootPath, dir) : '';
  let html = '<div class="bookmark-list-inline">\n';
  for (const bm of bookmarks) {
    let domain = '';
    try { domain = new URL(bm.url).hostname; } catch {}
    const favUrl = rootName && folderRel ? `/api/knowledge/file/${rootName}/${folderRel}/.bookmarks/favicons/${domain}.ico` : '';
    html += '<div class="bookmark-item-inline">';
    html += `<a href="${bm.url.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}" target="_blank" rel="noopener noreferrer">`;
    if (favUrl) html += `<img class="bookmark-favicon-inline" src="${favUrl.replace(/&/g,'&amp;')}" alt="" loading="lazy" onerror="this.style.display='none'">`;
    html += `<span class="bookmark-title-inline">${bm.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
    html += '</a>';
    html += `<span class="bookmark-domain-inline">${domain.replace(/&/g,'&amp;')}</span>`;
    html += '</div>\n';
  }
  html += '</div>';
  return html;
};

// --- markdown ---

let _md = null;
const getMd = () => {
  if (!_md) {
    _md = new MarkdownIt({
      html: true, xhtmlOut: false, breaks: false, linkify: true, typographer: true,
    })
      .use(Emoji)
      .use(Attrs)
      .use(Anchor)
      .use(Prism, { plugins: ['line-numbers'], defaultLanguage: 'clike' });
    const origFence = _md.renderer.rules.fence;
    _md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const info = token.info ? token.info.trim() : '';
      if (info === 'mermaid') {
        const sanitized = token.content.replace(/(\d\/\d)"/g, '$1in');
        const code = _md.utils.escapeHtml(sanitized);
        return `<pre class="language-mermaid"><code class="language-mermaid">${code}</code></pre>\n`;
      }
      return origFence(tokens, idx, options, env, self);
    };
    _md.renderer.rules.table_open = () => '<table class="table table-striped">\n';
  }
  return _md;
};

const renderMarkdown = (absolutePath, rootPath = '', rootName = '') => {
  try {
    const source = readFileSync(absolutePath, 'utf-8');
    const { content } = matter(source);
    let html = getMd().render(content);
    const bmHtml = renderBookmarksHtml(absolutePath, rootPath, rootName);
    if (bmHtml) {
      html = html
        .replace('<%= bookmarks %>', bmHtml)
        .replace('&lt;%= bookmarks %&gt;', bmHtml);
    }
    return html;
  } catch (err) {
    console.error('markdown render error', err);
    return '';
  }
};

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

    if (stat.isDirectory()) {
      children.push({
        name: entry, type: 'directory', path: relativePath,
        children: buildTree(fullPath, relativePath, showHidden, depth + 1, ctx),
      });
    } else {
      children.push({ name: entry, type: 'file', path: relativePath });
    }
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

const registerKnowledgeRoutes = (app) => {

  // --- root management ---

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
    const newRoot = { name, path: resolvedPath };
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

  // --- GET /api/knowledge returns roots only (children loaded on demand) ---

  app.get('/api/knowledge', async () => {
    const tree = [];
    for (const r of roots) {
      const err = assertRootAccess(r.path);
      if (err) continue;
      tree.push({ name: r.name, type: 'directory', path: r.name, children: [] });
    }
    return { tree };
  });

  // --- GET /api/knowledge/tree?path=rootName/rest returns children of a directory ---

  app.get('/api/knowledge/tree', async (request, reply) => {
    const filePath = request.query.path || '';
    const sr = splitRootPath(filePath);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath: relPath } = sr;
    const dirPath = relPath ? path.resolve(root.path, relPath) : root.path;
    const err = assertRootAccess(dirPath);
    if (err) return reply.code(err.code).send({ error: err.error });
    const showHidden = request.query.showHidden === 'true';
    const children = [];
    let entries;
    try { entries = readdirSync(dirPath); } catch { return { children: [] }; }
    for (const entry of entries) {
      if (!showHidden && entry.startsWith('.')) continue;
      const fullPath = path.join(dirPath, entry);
      const relativePath = filePath ? `${filePath}/${entry}` : entry;
      let stat;
      try { stat = statSync(fullPath); } catch { continue; }
      children.push({
        name: entry,
        type: stat.isDirectory() ? 'directory' : 'file',
        path: relativePath,
        size: stat.isFile() ? stat.size : undefined,
        mtime: stat.mtime.toISOString(),
        ...(stat.isDirectory() ? { children: [] } : {}),
      });
    }
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { children };
  });

  // --- backward compat routes (root name is first path segment) ---

  const splitRootPath = (pathStr) => {
    if (!pathStr) return null;
    // try root name match first
    const slashIdx = pathStr.indexOf('/');
    const firstSeg = slashIdx === -1 ? pathStr : pathStr.slice(0, slashIdx);
    const restPath = slashIdx === -1 ? '' : pathStr.slice(slashIdx + 1);
    const byName = resolveRoot(firstSeg);
    if (byName) {
      const err = assertRootAccess(byName.path);
      if (!err) return { root: byName, filePath: restPath };
    }
    // absolute / project-relative fallback
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
    return null;
  };

  app.get('/api/knowledge/content/*', async (request, reply) => {
    const sr = splitRootPath(request.params['*']);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    if (!/\.md$/i.test(filePath)) return reply.code(400).send({ error: 'only markdown files are supported' });
    const html = renderMarkdown(absolutePath, root.path, root.name);
    return { html, path: request.params['*'] };
  });

  app.get('/api/knowledge/raw/*', async (request, reply) => {
    const sr = splitRootPath(request.params['*']);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    const content = readFileSync(absolutePath, 'utf-8');
    return { content, path: request.params['*'] };
  });

  app.put('/api/knowledge/raw/*', async (request, reply) => {
    const sr = splitRootPath(request.params['*']);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    const { content } = request.body ?? {};
    if (typeof content !== 'string') return reply.code(400).send({ error: 'content is required' });
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf-8');
    return { ok: true, path: request.params['*'] };
  });

  app.post('/api/knowledge/create/*', async (request, reply) => {
    const sr = splitRootPath(request.params['*']);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (existsSync(absolutePath)) return reply.code(409).send({ error: 'file already exists' });
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, '', 'utf-8');
    return { ok: true, path: request.params['*'] };
  });

  app.get('/api/knowledge/file/*', async (request, reply) => {
    const sr = splitRootPath(request.params['*']);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = readFileSync(absolutePath);
    if (request.query.dl === '1') {
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`);
      reply.header('Content-Type', 'application/octet-stream');
      return reply.send(data);
    }
    reply.header('Content-Type', contentType);
    return reply.send(data);
  });

  app.get('/api/knowledge/info', async (request, reply) => {
    const sr = splitRootPath(request.query.path);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    const stats = statSync(absolutePath);
    const info = { size: stats.size, mtime: stats.mtime.toISOString(), birthtime: stats.birthtime.toISOString() };
    if (/\.md$/i.test(filePath)) {
      const content = readFileSync(absolutePath, 'utf-8');
      const parsed = matter(content);
      info.frontmatter = parsed.data;
    }
    return info;
  });

  app.delete('/api/knowledge/raw/*', async (request, reply) => {
    const sr = splitRootPath(request.params['*']);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    const trashDir = path.join(path.dirname(absolutePath), '.trash');
    const trashPath = path.resolve(trashDir, path.basename(absolutePath));
    mkdirSync(trashDir, { recursive: true });
    const content = readFileSync(absolutePath);
    writeFileSync(trashPath, content);
    rmSync(absolutePath);
    return { ok: true, path: request.params['*'], trash: path.relative(root.path, trashPath) };
  });

  app.post('/api/knowledge/move', async (request, reply) => {
    const { from, to } = request.body ?? {};
    if (!from || !to) return reply.code(400).send({ error: 'from and to are required' });
    const srFrom = splitRootPath(from);
    const srTo = splitRootPath(to);
    if (!srFrom || !srTo || srFrom.root.name !== srTo.root.name) return reply.code(400).send({ error: 'move requires same root' });
    const { root, filePath: fromFile } = srFrom;
    const { filePath: toFile } = srTo;
    const fromPath = path.resolve(root.path, fromFile);
    const toPath = path.resolve(root.path, toFile);
    if (!checkPath(fromPath, root.path) || !checkPath(toPath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(fromPath)) return reply.code(404).send({ error: 'source not found' });
    if (existsSync(toPath)) return reply.code(409).send({ error: 'destination already exists' });
    mkdirSync(path.dirname(toPath), { recursive: true });
    const content = readFileSync(fromPath);
    writeFileSync(toPath, content);
    rmSync(fromPath);
    return { ok: true, from, to };
  });

  // --- bookmarks ---

  const bmDir = (sr) => sr.filePath ? path.resolve(sr.root.path, sr.filePath) : sr.root.path;

  app.get('/api/knowledge/bookmarks', async (request, reply) => {
    const p = request.query.path;
    if (!p) return reply.code(400).send({ error: 'path required' });
    const sr = splitRootPath(p);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const dir = bmDir(sr);
    const bookmarks = readBookmarks(dir).map(bm => {
      let domain = '';
      try { domain = new URL(bm.url).hostname; } catch {}
      return { ...bm, domain };
    });
    return { bookmarks };
  });

  app.post('/api/knowledge/bookmarks', async (request, reply) => {
    const { path: p, title, url } = request.body ?? {};
    if (!p || !title || !url) return reply.code(400).send({ error: 'path, title, url required' });
    const sr = splitRootPath(p);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const dir = bmDir(sr);
    const bookmarks = readBookmarks(dir);
    if (bookmarks.some(b => b.url === url)) return reply.code(409).send({ error: 'already exists' });
    bookmarks.push({ title, url });
    writeBookmarks(dir, bookmarks);
    const indexMd = path.join(dir, 'index.md');
    if (!existsSync(indexMd)) writeFileSync(indexMd, '<%= bookmarks %>\n', 'utf-8');
    fetchFavicon(url, dir);
    fetchOgImage(url, dir).then(thumb => {
      if (!thumb) return;
      const updated = readBookmarks(dir);
      const i = updated.findIndex(b => b.url === url);
      if (i !== -1) { updated[i].thumb = thumb; writeBookmarks(dir, updated); }
    });
    return { ok: true };
  });

  app.patch('/api/knowledge/bookmarks', async (request, reply) => {
    const { path: p, oldUrl, newTitle, newUrl } = request.body ?? {};
    if (!p || !oldUrl) return reply.code(400).send({ error: 'path and oldUrl required' });
    const sr = splitRootPath(p);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const dir = bmDir(sr);
    const bookmarks = readBookmarks(dir);
    const idx = bookmarks.findIndex(b => b.url === oldUrl);
    if (idx === -1) return reply.code(404).send({ error: 'not found' });
    const changedUrl = newUrl && newUrl !== oldUrl;
    if (newTitle) bookmarks[idx].title = newTitle;
    if (changedUrl) {
      bookmarks[idx].url = newUrl;
      delete bookmarks[idx].thumb;
      fetchFavicon(newUrl, dir);
      fetchOgImage(newUrl, dir).then(thumb => {
        if (!thumb) return;
        const updated = readBookmarks(dir);
        const i = updated.findIndex(b => b.url === newUrl);
        if (i !== -1) { updated[i].thumb = thumb; writeBookmarks(dir, updated); }
      });
    }
    writeBookmarks(dir, bookmarks);
    return { ok: true };
  });

  app.delete('/api/knowledge/bookmarks', async (request, reply) => {
    const { path: p, url } = request.body ?? {};
    if (!p || !url) return reply.code(400).send({ error: 'path and url required' });
    const sr = splitRootPath(p);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const dir = bmDir(sr);
    writeBookmarks(dir, readBookmarks(dir).filter(b => b.url !== url));
    return { ok: true };
  });

  app.get('/api/knowledge/page-title', async (request, reply) => {
    const url = request.query.url;
    if (!url) return reply.code(400).send({ error: 'url required' });
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return { title: '' };
      const html = await res.text();
      const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return { title: m ? m[1].trim() : '' };
    } catch { return { title: '' }; }
  });

  // --- multi-root file operations (legacy, kept for compat) ---

  const rootPrefix = '/api/knowledge/:root';

  app.get(`${rootPrefix}`, async (request, reply) => {
    const root = resolveRoot(request.params.root);
    if (!root) return reply.code(404).send({ error: 'root not found' });
    if (!existsSync(root.path)) return { tree: [] };
    const err = assertRootAccess(root.path);
    if (err) return reply.code(err.code).send({ error: err.error });
    const showHidden = request.query.showHidden === 'true';
    const tree = buildTree(root.path, '', showHidden);
    return { tree, root: root.name };
  });

  app.get(`${rootPrefix}/content/*`, async (request, reply) => {
    const root = resolveRoot(request.params.root);
    if (!root) return reply.code(404).send({ error: 'root not found' });
    const err = assertRootAccess(root.path);
    if (err) return reply.code(err.code).send({ error: err.error });
    const filePath = request.params['*'];
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    if (!/\.md$/i.test(filePath)) return reply.code(400).send({ error: 'only markdown files are supported' });
    const html = renderMarkdown(absolutePath, root.path, root.name);
    return { html, path: filePath, root: root.name };
  });

  app.get(`${rootPrefix}/raw/*`, async (request, reply) => {
    const root = resolveRoot(request.params.root);
    if (!root) return reply.code(404).send({ error: 'root not found' });
    const err = assertRootAccess(root.path);
    if (err) return reply.code(err.code).send({ error: err.error });
    const filePath = request.params['*'];
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    const content = readFileSync(absolutePath, 'utf-8');
    return { content, path: filePath, root: root.name };
  });

  app.put(`${rootPrefix}/raw/*`, async (request, reply) => {
    const root = resolveRoot(request.params.root);
    if (!root) return reply.code(404).send({ error: 'root not found' });
    const err = assertRootAccess(root.path);
    if (err) return reply.code(err.code).send({ error: err.error });
    const filePath = request.params['*'];
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    const { content } = request.body ?? {};
    if (typeof content !== 'string') return reply.code(400).send({ error: 'content is required' });
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf-8');
    return { ok: true, path: filePath, root: root.name };
  });

  app.post(`${rootPrefix}/create/*`, async (request, reply) => {
    const root = resolveRoot(request.params.root);
    if (!root) return reply.code(404).send({ error: 'root not found' });
    const err = assertRootAccess(root.path);
    if (err) return reply.code(err.code).send({ error: err.error });
    const filePath = request.params['*'];
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (existsSync(absolutePath)) return reply.code(409).send({ error: 'file already exists' });
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, '', 'utf-8');
    return { ok: true, path: filePath, root: root.name };
  });

  app.get(`${rootPrefix}/file/*`, async (request, reply) => {
    const root = resolveRoot(request.params.root);
    if (!root) return reply.code(404).send({ error: 'root not found' });
    const err = assertRootAccess(root.path);
    if (err) return reply.code(err.code).send({ error: err.error });
    const filePath = request.params['*'];
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = readFileSync(absolutePath);
    if (request.query.dl === '1') {
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`);
      reply.header('Content-Type', 'application/octet-stream');
      return reply.send(data);
    }
    reply.header('Content-Type', contentType);
    return reply.send(data);
  });

  app.get(`${rootPrefix}/info`, async (request, reply) => {
    const root = resolveRoot(request.params.root);
    if (!root) return reply.code(404).send({ error: 'root not found' });
    const err = assertRootAccess(root.path);
    if (err) return reply.code(err.code).send({ error: err.error });
    const filePath = request.query.path;
    if (!filePath) return reply.code(400).send({ error: 'path query parameter is required' });
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    const stats = statSync(absolutePath);
    const info = { size: stats.size, mtime: stats.mtime.toISOString(), birthtime: stats.birthtime.toISOString() };
    if (/\.md$/i.test(filePath)) {
      const content = readFileSync(absolutePath, 'utf-8');
      const parsed = matter(content);
      info.frontmatter = parsed.data;
    }
    return info;
  });

  app.delete(`${rootPrefix}/raw/*`, async (request, reply) => {
    const root = resolveRoot(request.params.root);
    if (!root) return reply.code(404).send({ error: 'root not found' });
    const err = assertRootAccess(root.path);
    if (err) return reply.code(err.code).send({ error: err.error });
    const filePath = request.params['*'];
    const absolutePath = path.resolve(root.path, filePath);
    if (!checkPath(absolutePath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    const trashDir = path.join(path.dirname(absolutePath), '.trash');
    const trashPath = path.resolve(trashDir, path.basename(absolutePath));
    mkdirSync(trashDir, { recursive: true });
    const content = readFileSync(absolutePath);
    writeFileSync(trashPath, content);
    rmSync(absolutePath);
    return { ok: true, path: filePath, root: root.name, trash: path.relative(root.path, trashPath) };
  });

  app.post(`${rootPrefix}/move`, async (request, reply) => {
    const root = resolveRoot(request.params.root);
    if (!root) return reply.code(404).send({ error: 'root not found' });
    const err = assertRootAccess(root.path);
    if (err) return reply.code(err.code).send({ error: err.error });
    const { from, to } = request.body ?? {};
    if (!from || !to) return reply.code(400).send({ error: 'from and to are required' });
    const fromPath = path.resolve(root.path, from);
    const toPath = path.resolve(root.path, to);
    if (!checkPath(fromPath, root.path) || !checkPath(toPath, root.path)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(fromPath)) return reply.code(404).send({ error: 'source not found' });
    if (existsSync(toPath)) return reply.code(409).send({ error: 'destination already exists' });
    mkdirSync(path.dirname(toPath), { recursive: true });
    const content = readFileSync(fromPath);
    writeFileSync(toPath, content);
    rmSync(fromPath);
    return { ok: true, from, to, root: root.name };
  });
};

const start = async () => {
  const app = Fastify({ logger: true });

  registerKnowledgeRoutes(app);
  registerCollaboraRoutes(app);
  await app.register(wopiRoutes, {
    knowledgeBase: roots[0]?.path || resolvePath(process.env.KNOWLEDGE_BASE || 'knowledge'),
    wopiSrc: process.env.WOPI_SRC || `http://localhost:${PORT}`,
  });

  const publicDir = path.join(__dirname, 'public');
  const serveIndex = (reply) => {
    const indexFile = path.join(publicDir, 'index.html');
    if (existsSync(indexFile)) {
      return reply.type('text/html').send(readFileSync(indexFile, 'utf-8'));
    }
    return reply.code(404).send({ error: 'not found' });
  };

  if (existsSync(publicDir)) {
    await app.register(fastifyStatic, {
      root: publicDir,
      prefix: '/',
      wildcard: false,
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
