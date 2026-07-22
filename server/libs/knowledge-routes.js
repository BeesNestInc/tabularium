import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { t } from './i18n.js';
import { matter } from './utils.js';

export function registerKnowledgeRoutes(app, opts) {
  const rootPath = opts.rootPath || '/knowledge';
  const resolvePath = (request, p) => opts.resolvePath
    ? opts.resolvePath(request, p)
    : opts.splitRootPath(p);
  const getRoots = (request) => opts.getRoots ? opts.getRoots(request) : [];
  const mkGetRoots = (request) => opts.getRoots ? opts.getRoots(request) : [];

  // --- GET (unified tree) ---
  app.get(rootPath, async (request, reply) => {
    const qPath = request.query.path ?? '';
    if (qPath !== '') {
      const sr = resolvePath(request, qPath) || (getRoots(request).length > 0 ? { root: getRoots(request)[0], filePath: qPath } : null);
      if (!sr) return reply.code(404).send({ error: t('not found') });
      const { root, filePath: relPath } = sr;
      const dirPath = relPath ? path.resolve(root.path, relPath) : root.path;
      const err = opts.assertRootAccess ? opts.assertRootAccess(dirPath) : null;
      if (err) return reply.code(err.code).send({ error: err.error });
      const showHidden = request.query.showHidden === 'true';
      const st = statSync(dirPath);
      const children = [];
      let entries;
      try { entries = readdirSync(dirPath); } catch { return { type: 'directory', stat: st, children: [] }; }
      for (const entry of entries) {
        if (!showHidden && entry.startsWith('.')) continue;
        const fullPath = path.join(dirPath, entry);
        const relBase = sr.root.name + (sr.filePath ? '/' + sr.filePath : '');
        const relativePath = `${relBase}/${entry}`;
        let st2;
        try { st2 = statSync(fullPath); } catch { continue; }
        children.push({
          name: entry, type: st2.isDirectory() ? 'directory' : 'file', path: relativePath,
          size: st2.size, mtime: st2.mtime.toISOString(), birthtime: st2.birthtime.toISOString(),
          mode: st2.mode, uid: st2.uid, gid: st2.gid,
          ...(st2.isDirectory() ? { children: [] } : {}),
        });
      }
      children.sort((a, b) => { if (a.type !== b.type) return a.type === 'directory' ? -1 : 1; return a.name.localeCompare(b.name); });
      return { type: 'directory', stat: st, children };
    }
    const tree = [];
    const allRoots = getRoots(request);
    for (const r of allRoots) {
      const err = opts.assertRootAccess ? opts.assertRootAccess(r.path) : null;
      if (err) continue;
      tree.push({ name: r.name, type: 'directory', path: r.name, children: [] });
    }
    return { type: 'directory', stat: null, children: tree };
  });

  // --- GET /tree (backward compat) ---
  app.get(rootPath + '/tree', async (request, reply) => {
    const filePath = request.query.path || '';
    const allRoots = getRoots(request);
    const sr = resolvePath(request, filePath) || (allRoots.length > 0 && !filePath ? { root: allRoots[0], filePath: '' } : null);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath: relPath } = sr;
    const dirPath = relPath ? path.resolve(root.path, relPath) : root.path;
    const err = opts.assertRootAccess ? opts.assertRootAccess(dirPath) : null;
    if (err) return reply.code(err.code).send({ error: err.error });
    const showHidden = request.query.showHidden === 'true';
    const children = [];
    let entries;
    try { entries = readdirSync(dirPath); } catch { return { children: [] }; }
    for (const entry of entries) {
      if (!showHidden && entry.startsWith('.')) continue;
      const fullPath = path.join(dirPath, entry);
      const relBase = sr.root.name + (sr.filePath ? '/' + sr.filePath : '');
      const relativePath = `${relBase}/${entry}`;
      let st;
      try { st = statSync(fullPath); } catch { continue; }
      children.push({
        name: entry, type: st.isDirectory() ? 'directory' : 'file', path: relativePath,
        size: st.size, mtime: st.mtime.toISOString(), birthtime: st.birthtime.toISOString(),
        mode: st.mode, uid: st.uid, gid: st.gid,
        ...(st.isDirectory() ? { children: [] } : {}),
      });
    }
    children.sort((a, b) => { if (a.type !== b.type) return a.type === 'directory' ? -1 : 1; return a.name.localeCompare(b.name); });
    return { children };
  });

  // --- GET /page ---
  app.get(rootPath + '/page', async (request, reply) => {
    const qPath = request.query.path || '';
    if (!qPath) return reply.code(400).send({ error: t('path required') });
    const sr = resolvePath(request, qPath) || (getRoots(request).length > 0 ? { root: getRoots(request)[0], filePath: qPath } : null);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath: relPath } = sr;
    const absPath = relPath ? path.resolve(root.path, relPath) : root.path;
    if (!absPath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    const err = opts.assertRootAccess ? opts.assertRootAccess(absPath) : null;
    if (err) return reply.code(err.code).send({ error: err.error });
    if (!existsSync(absPath)) return reply.code(404).send({ error: 'not found' });
    const st = statSync(absPath);
    if (st.isDirectory()) {
      const showHidden = request.query.showHidden === 'true';
      const entries = [];
      let dirEntries;
      try { dirEntries = readdirSync(absPath); } catch { return reply.code(500).send({ error: t('cannot read directory') }); }
      for (const entry of dirEntries) {
        if (!showHidden && entry.startsWith('.')) continue;
        const full = path.join(absPath, entry);
        const relBase = sr.root.name + (sr.filePath ? '/' + sr.filePath : '');
        const relEntry = `${relBase}/${entry}`;
        let st2;
        try { st2 = statSync(full); } catch { continue; }
        entries.push({ name: entry, type: st2.isDirectory() ? 'directory' : 'file', path: relEntry, size: st2.size, mtime: st2.mtime.toISOString() });
      }
      entries.sort((a, b) => { if (a.type !== b.type) return a.type === 'directory' ? -1 : 1; return a.name.localeCompare(b.name); });
      const indexEntry = entries.find(e => e.type === 'file' && /^index\.(md|mmd)$/i.test(e.name));
      let index = null;
      if (indexEntry) {
        const indexPath = path.join(absPath, indexEntry.name);
        const raw = readFileSync(indexPath, 'utf-8');
        index = { raw, size: indexEntry.size, mtime: indexEntry.mtime };
      }
      return { type: 'directory', path: qPath, index, entries };
    }
    const name = path.basename(absPath);
    const fileUrl = `${rootPath}/file/${qPath}`;
    return { type: 'file', path: qPath, name, size: st.size, mtime: st.mtime.toISOString(), fileUrl };
  });



  // --- GET /raw/* ---
  app.get(rootPath + '/raw/*', async (request, reply) => {
    const sr = resolvePath(request, request.params['*']);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (!existsSync(absolutePath)) return reply.code(404).send({ error: 'not found' });
    const st = statSync(absolutePath);
    const content = readFileSync(absolutePath, 'utf-8');
    return { content, path: request.params['*'], size: st.size, mtime: st.mtime.toISOString() };
  });

  // --- PUT /raw/* ---
  app.put(rootPath + '/raw/*', async (request, reply) => {
    const sr = resolvePath(request, request.params['*']);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, request.body.content || '');
    return { ok: true };
  });

  // --- DELETE /raw/* ---
  app.delete(rootPath + '/raw/*', async (request, reply) => {
    const sr = resolvePath(request, request.params['*']);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (!existsSync(absolutePath)) return reply.code(404).send({ error: 'not found' });
    rmSync(absolutePath, { recursive: true, force: true });
    return { ok: true };
  });

  // --- POST /mkdir/* ---
  app.post(rootPath + '/mkdir/*', async (request, reply) => {
    const sr = resolvePath(request, request.params['*']);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (existsSync(absolutePath)) return reply.code(409).send({ error: t('already exists') });
    mkdirSync(absolutePath, { recursive: true });
    return { ok: true, path: request.params['*'] };
  });

  // --- POST /create/* ---
  app.post(rootPath + '/create/*', async (request, reply) => {
    const sr = resolvePath(request, request.params['*']);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (existsSync(absolutePath)) return reply.code(409).send({ error: t('already exists') });
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    const ext = path.extname(filePath).toLowerCase();
    const template = opts.fileTemplates?.[ext] || '';
    writeFileSync(absolutePath, template, 'utf-8');
    return { ok: true, path: request.params['*'] };
  });

  // --- GET /file/* ---
  app.get(rootPath + '/file/*', async (request, reply) => {
    const sr = resolvePath(request, request.params['*']);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath } = sr;
    const absolutePath = path.resolve(root.path, filePath);
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (!existsSync(absolutePath)) return reply.code(404).send({ error: 'not found' });
    const st = statSync(absolutePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = (opts.mimeTypes || {})[ext] || 'application/octet-stream';
    const data = readFileSync(absolutePath);
    if (request.query.dl === '1') {
      reply.header('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    }
    reply.type(mime);
    if (/^image\//.test(mime) || /^text\//.test(mime) || mime === 'application/pdf') {
      return reply.send(data);
    }
    // other binary → auto-detect disposition
    const isText = /\.(md|mmd|txt|json|yaml|yml|js|ts|css|scss|html|htm|xml|svg)$/i.test(filePath);
    if (isText) reply.type('text/plain; charset=utf-8');
    return reply.send(data);
  });

  // --- GET /info ---
  app.get(rootPath + '/info', async (request, reply) => {
    const filePath = request.query.path || '';
    const sr = resolvePath(request, filePath);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const { root, filePath: relPath } = sr;
    const absolutePath = relPath ? path.resolve(root.path, relPath) : root.path;
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (!existsSync(absolutePath)) return reply.code(404).send({ error: 'not found' });
    const st = statSync(absolutePath);
    const result = { type: st.isDirectory() ? 'directory' : 'file', path: request.query.path, size: st.size, mtime: st.mtime.toISOString(), birthtime: st.birthtime.toISOString() };
    if (st.isFile()) {
      try {
        const content = readFileSync(absolutePath, 'utf-8');
        const { data } = matter(content);
        result.frontmatter = data;
      } catch {}
    }
    return result;
  });

  // --- POST /move ---
  app.post(rootPath + '/move', async (request, reply) => {
    const { from, to } = request.body || {};
    if (!from || !to) return reply.code(400).send({ error: t('from and to are required') });
    const srFrom = resolvePath(request, from);
    const srTo = resolvePath(request, to);
    if (!srFrom || !srTo) return reply.code(404).send({ error: t('path not found') });
    const fromPath = path.resolve(srFrom.root.path, srFrom.filePath);
    const toPath = path.resolve(srTo.root.path, srTo.filePath);
    if (!fromPath.startsWith(srFrom.root.path) || !toPath.startsWith(srTo.root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (!existsSync(fromPath)) return reply.code(404).send({ error: t('source not found') });
    if (existsSync(toPath)) return reply.code(409).send({ error: t('destination already exists') });
    mkdirSync(path.dirname(toPath), { recursive: true });
    const content = readFileSync(fromPath, 'utf-8');
    writeFileSync(toPath, content);
    rmSync(fromPath);
    return { ok: true, from, to };
  });

  // --- multi-root compat routes (legacy, kept for backward compat) ---

  const rootPrefix = rootPath + '/:root';

  app.get(rootPrefix, async (request, reply) => {
    const roots = getRoots(request);
    const root = roots.find(r => r.name === request.params.root);
    if (!root) return reply.code(404).send({ error: t('root not found') });
    if (!existsSync(root.path)) return { tree: [] };
    const err = opts.assertRootAccess ? opts.assertRootAccess(root.path) : null;
    if (err) return reply.code(err.code).send({ error: err.error });
    const showHidden = request.query.showHidden === 'true';
    const treeData = opts.buildTree ? opts.buildTree(root.path, root.name, showHidden, 0) : [];
    return { tree: treeData };
  });



  app.get(rootPrefix + '/raw/*', async (request, reply) => {
    const roots = getRoots(request);
    const root = roots.find(r => r.name === request.params.root);
    if (!root) return reply.code(404).send({ error: t('root not found') });
    const filePath = request.params['*'];
    const absolutePath = path.resolve(root.path, filePath);
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (!existsSync(absolutePath)) return reply.code(404).send({ error: 'not found' });
    const content = readFileSync(absolutePath, 'utf-8');
    return { content, path: filePath };
  });

  app.put(rootPrefix + '/raw/*', async (request, reply) => {
    const roots = getRoots(request);
    const root = roots.find(r => r.name === request.params.root);
    if (!root) return reply.code(404).send({ error: t('root not found') });
    const filePath = request.params['*'];
    const absolutePath = path.resolve(root.path, filePath);
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, request.body.content || '');
    return { ok: true };
  });

  app.post(rootPrefix + '/create/*', async (request, reply) => {
    const roots = getRoots(request);
    const root = roots.find(r => r.name === request.params.root);
    if (!root) return reply.code(404).send({ error: t('root not found') });
    const filePath = request.params['*'];
    const absolutePath = path.resolve(root.path, filePath);
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (existsSync(absolutePath)) return reply.code(409).send({ error: t('already exists') });
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, '', 'utf-8');
    return { ok: true, path: filePath };
  });

  app.get(rootPrefix + '/file/*', async (request, reply) => {
    const roots = getRoots(request);
    const root = roots.find(r => r.name === request.params.root);
    if (!root) return reply.code(404).send({ error: t('root not found') });
    const filePath = request.params['*'];
    const absolutePath = path.resolve(root.path, filePath);
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (!existsSync(absolutePath)) return reply.code(404).send({ error: 'not found' });
    const data = readFileSync(absolutePath);
    if (request.query.dl === '1') {
      reply.header('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = (opts.mimeTypes || {})[ext] || 'application/octet-stream';
    reply.type(mime);
    if (/^image\//.test(mime) || /^text\//.test(mime) || mime === 'application/pdf') {
      return reply.send(data);
    }
    const isText = /\.(md|mmd|txt|json|yaml|yml|js|ts|css|scss|html|htm|xml|svg)$/i.test(filePath);
    if (isText) reply.type('text/plain; charset=utf-8');
    return reply.send(data);
  });

  app.get(rootPrefix + '/info', async (request, reply) => {
    const roots = getRoots(request);
    const root = roots.find(r => r.name === request.params.root);
    if (!root) return reply.code(404).send({ error: t('root not found') });
    const filePath = request.query.path || '';
    const absolutePath = filePath ? path.resolve(root.path, filePath) : root.path;
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (!existsSync(absolutePath)) return reply.code(404).send({ error: 'not found' });
    const st = statSync(absolutePath);
    const result = { type: st.isDirectory() ? 'directory' : 'file', path: filePath || '', size: st.size, mtime: st.mtime.toISOString(), birthtime: st.birthtime.toISOString() };
    if (st.isFile()) {
      try {
        const content = readFileSync(absolutePath, 'utf-8');
        const { data } = matter(content);
        result.frontmatter = data;
      } catch {}
    }
    return result;
  });

  app.delete(rootPrefix + '/raw/*', async (request, reply) => {
    const roots = getRoots(request);
    const root = roots.find(r => r.name === request.params.root);
    if (!root) return reply.code(404).send({ error: t('root not found') });
    const filePath = request.params['*'];
    const absolutePath = path.resolve(root.path, filePath);
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (!existsSync(absolutePath)) return reply.code(404).send({ error: 'not found' });
    rmSync(absolutePath, { recursive: true, force: true });
    return { ok: true };
  });

  app.post(rootPrefix + '/mkdir/*', async (request, reply) => {
    const roots = getRoots(request);
    const root = roots.find(r => r.name === request.params.root);
    if (!root) return reply.code(404).send({ error: t('root not found') });
    const filePath = request.params['*'];
    const absolutePath = path.resolve(root.path, filePath);
    if (!absolutePath.startsWith(root.path)) return reply.code(403).send({ error: t('forbidden') });
    if (existsSync(absolutePath)) return reply.code(409).send({ error: t('already exists') });
    mkdirSync(absolutePath, { recursive: true });
    return { ok: true, path: request.params['*'] };
  });

  app.post(rootPrefix + '/move', async (request, reply) => {
    const roots = getRoots(request);
    const { from, to } = request.body || {};
    if (!from || !to) return reply.code(400).send({ error: t('from and to are required') });
    const fromRoot = roots.find(r => from.startsWith(r.name + '/') || from === r.name);
    const toRoot = roots.find(r => to.startsWith(r.name + '/') || to === r.name);
    if (!fromRoot || !toRoot) return reply.code(404).send({ error: t('root not found') });
    const fromPath = path.resolve(fromRoot.path, from.slice(fromRoot.name.length).replace(/^\//, ''));
    const toPath = path.resolve(toRoot.path, to.slice(toRoot.name.length).replace(/^\//, ''));
    if (!fromPath.startsWith(fromRoot.path) || !toPath.startsWith(toRoot.path)) return reply.code(403).send({ error: t('forbidden') });
    if (!existsSync(fromPath)) return reply.code(404).send({ error: t('source not found') });
    if (existsSync(toPath)) return reply.code(409).send({ error: t('destination already exists') });
    mkdirSync(path.dirname(toPath), { recursive: true });
    const content = readFileSync(fromPath, 'utf-8');
    writeFileSync(toPath, content);
    rmSync(fromPath);
    return { ok: true, from, to };
  });
}
