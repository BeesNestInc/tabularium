import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'yaml';

export const ensureBookmarksDir = (dir) => {
  const bmDir = path.join(dir, '.bookmarks');
  mkdirSync(bmDir, { recursive: true });
  mkdirSync(path.join(bmDir, 'favicons'), { recursive: true });
  mkdirSync(path.join(bmDir, 'thumbs'), { recursive: true });
  return bmDir;
};

export const readBookmarks = (dir) => {
  const bmFile = path.join(dir, '.bookmarks', 'bookmarks.yaml');
  if (!existsSync(bmFile)) return [];
  try {
    const data = yaml.parse(readFileSync(bmFile, 'utf-8'));
    return data.bookmarks || [];
  } catch { return []; }
};

export const writeBookmarks = (dir, bookmarks) => {
  ensureBookmarksDir(dir);
  const bmFile = path.join(dir, '.bookmarks', 'bookmarks.yaml');
  writeFileSync(bmFile, yaml.stringify({ bookmarks }), 'utf-8');
};

export const bmDirFromPath = (root, relPath) => relPath ? path.resolve(root.path, relPath) : root.path;

export const fetchFavicon = async (url, dir) => {
  try {
    const domain = new URL(url).hostname;
    const fp = path.join(dir, '.bookmarks', 'favicons', domain + '.ico');
    if (existsSync(fp)) return;
    const res = await fetch(`https://${domain}/favicon.ico`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) writeFileSync(fp, Buffer.from(await res.arrayBuffer()));
  } catch {}
};

export const fetchOgImage = async (url, dir) => {
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

export const createBookmarkRoutes = (app, { splitRootPath, prefix = '' }) => {

  app.get(`${prefix}/knowledge/bookmarks`, async (request, reply) => {
    const p = request.query.path;
    if (!p) return reply.code(400).send({ error: 'path required' });
    const sr = splitRootPath(request, p);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const dir = bmDirFromPath(sr.root, sr.filePath);
    const bookmarks = readBookmarks(dir).map((bm) => {
      let domain = '';
      try { domain = new URL(bm.url).hostname; } catch {}
      return { ...bm, domain };
    });
    return { bookmarks };
  });

  app.post(`${prefix}/knowledge/bookmarks`, async (request, reply) => {
    const { path: p, title, url } = request.body ?? {};
    if (!p || !title || !url) return reply.code(400).send({ error: 'path, title, url required' });
    const sr = splitRootPath(request, p);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const dir = bmDirFromPath(sr.root, sr.filePath);
    const bookmarks = readBookmarks(dir);
    if (bookmarks.some((b) => b.url === url)) return reply.code(409).send({ error: 'already exists' });
    bookmarks.push({ title, url });
    writeBookmarks(dir, bookmarks);
    const indexMd = path.join(dir, 'index.md');
    if (!existsSync(indexMd)) writeFileSync(indexMd, '<%= bookmarks %>\n', 'utf-8');
    fetchFavicon(url, dir);
    fetchOgImage(url, dir).then((thumb) => {
      if (!thumb) return;
      const updated = readBookmarks(dir);
      const i = updated.findIndex((b) => b.url === url);
      if (i !== -1) { updated[i].thumb = thumb; writeBookmarks(dir, updated); }
    });
    return { ok: true };
  });

  app.patch(`${prefix}/knowledge/bookmarks`, async (request, reply) => {
    const { path: p, oldUrl, newTitle, newUrl } = request.body ?? {};
    if (!p || !oldUrl) return reply.code(400).send({ error: 'path and oldUrl required' });
    const sr = splitRootPath(request, p);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const dir = bmDirFromPath(sr.root, sr.filePath);
    const bookmarks = readBookmarks(dir);
    const idx = bookmarks.findIndex((b) => b.url === oldUrl);
    if (idx === -1) return reply.code(404).send({ error: 'not found' });
    if (newTitle) bookmarks[idx].title = newTitle;
    if (newUrl && newUrl !== oldUrl) {
      bookmarks[idx].url = newUrl;
      delete bookmarks[idx].thumb;
      fetchFavicon(newUrl, dir);
      fetchOgImage(newUrl, dir).then((thumb) => {
        if (!thumb) return;
        const updated = readBookmarks(dir);
        const i = updated.findIndex((b) => b.url === newUrl);
        if (i !== -1) { updated[i].thumb = thumb; writeBookmarks(dir, updated); }
      });
    }
    writeBookmarks(dir, bookmarks);
    return { ok: true };
  });

  app.delete(`${prefix}/knowledge/bookmarks`, async (request, reply) => {
    const { path: p, url } = request.body ?? {};
    if (!p || !url) return reply.code(400).send({ error: 'path and url required' });
    const sr = splitRootPath(request, p);
    if (!sr) return reply.code(404).send({ error: 'not found' });
    const dir = bmDirFromPath(sr.root, sr.filePath);
    writeBookmarks(dir, readBookmarks(dir).filter((b) => b.url !== url));
    return { ok: true };
  });

  app.get(`${prefix}/knowledge/page-title`, async (request, reply) => {
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
};

const esc = (s) => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

export const renderBookmarksHtml = (absolutePath, rootPath, rootName) => {
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
    html += `<a href="${esc(bm.url)}" target="_blank" rel="noopener noreferrer">`;
    if (favUrl) html += `<img class="bookmark-favicon-inline" src="${esc(favUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
    html += `<span class="bookmark-title-inline">${esc(bm.title)}</span>`;
    html += '</a>';
    html += `<span class="bookmark-domain-inline">${esc(domain)}</span>`;
    html += '</div>\n';
  }
  html += '</div>';
  return html;
};

export const replaceBookmarkDirective = (html, bookmarksHtml) => {
  if (!bookmarksHtml) return html;
  return html
    .replace('<%= bookmarks %>', bookmarksHtml)
    .replace('&lt;%= bookmarks %&gt;', bookmarksHtml);
};

export const patchRenderMarkdown = (renderFn) => {
  return (absolutePath, rootPath, rootName) => {
    const html = renderFn(absolutePath);
    const bmHtml = renderBookmarksHtml(absolutePath, rootPath, rootName);
    return replaceBookmarkDirective(html, bmHtml);
  };
};
