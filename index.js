import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envLocal = path.join(__dirname, '.env');
const envParent = path.join(__dirname, '..', '.env');
if (existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (existsSync(envParent)) {
  dotenv.config({ path: envParent });
}

const PORT = parseInt(process.env.PORT || '8888', 10);
const HOST = process.env.HOST || '0.0.0.0';
const KNOWLEDGE_BASE = path.resolve(
  process.env.KNOWLEDGE_BASE || path.join(__dirname, '..', 'knowledge')
);

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
    // mermaid コードブロックはPrismの強調処理をスキップする
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

const renderMarkdown = (absolutePath) => {
  try {
    const source = readFileSync(absolutePath, 'utf-8');
    const { content } = matter(source);
    return getMd().render(content);
  } catch (err) {
    console.error('markdown render error', err);
    return '';
  }
};

const buildTree = (dirPath, relativeRoot, showHidden = false) => {
  const entries = readdirSync(dirPath);
  const children = [];

  for (const entry of entries) {
    if (!showHidden && entry.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry);
    const relativePath = path.join(relativeRoot, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      children.push({
        name: entry, type: 'directory', path: relativePath,
        children: buildTree(fullPath, relativePath, showHidden),
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

const checkPath = (absolutePath, knowledgeDir) => {
  return absolutePath.startsWith(knowledgeDir);
};

import { status as coolStatus, start as coolStart, stop as coolStop, logs as coolLogs } from './collabora.js';
import wopiRoutes from './wopi.js';

const registerCollaboraRoutes = (app) => {
  app.get('/api/collabora/status', async () => {
    return coolStatus();
  });

  app.post('/api/collabora/start', async (request, reply) => {
    try {
      return await coolStart();
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });

  app.post('/api/collabora/stop', async (request, reply) => {
    try {
      return await coolStop();
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message });
    }
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
  const knowledgeDir = KNOWLEDGE_BASE;

  app.get('/api/knowledge', async (request) => {
    if (!existsSync(knowledgeDir)) return { tree: [] };
    const showHidden = request.query.showHidden === 'true';
    const tree = buildTree(knowledgeDir, '', showHidden);
    return { tree };
  });

  app.get('/api/knowledge/content/*', async (request, reply) => {
    const filePath = request.params['*'];
    const absolutePath = path.resolve(knowledgeDir, filePath);
    if (!checkPath(absolutePath, knowledgeDir)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    if (!/\.md$/i.test(filePath)) return reply.code(400).send({ error: 'only markdown files are supported' });
    const html = renderMarkdown(absolutePath);
    return { html, path: filePath };
  });

  app.get('/api/knowledge/raw/*', async (request, reply) => {
    const filePath = request.params['*'];
    const absolutePath = path.resolve(knowledgeDir, filePath);
    if (!checkPath(absolutePath, knowledgeDir)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    const content = readFileSync(absolutePath, 'utf-8');
    return { content, path: filePath };
  });

  app.put('/api/knowledge/raw/*', async (request, reply) => {
    const filePath = request.params['*'];
    const absolutePath = path.resolve(knowledgeDir, filePath);
    if (!checkPath(absolutePath, knowledgeDir)) return reply.code(403).send({ error: 'forbidden' });
    const { content } = request.body ?? {};
    if (typeof content !== 'string') return reply.code(400).send({ error: 'content is required' });
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf-8');
    return { ok: true, path: filePath };
  });

  app.post('/api/knowledge/create/*', async (request, reply) => {
    const filePath = request.params['*'];
    const absolutePath = path.resolve(knowledgeDir, filePath);
    if (!checkPath(absolutePath, knowledgeDir)) return reply.code(403).send({ error: 'forbidden' });
    if (existsSync(absolutePath)) return reply.code(409).send({ error: 'file already exists' });
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, '', 'utf-8');
    return { ok: true, path: filePath };
  });

  app.get('/api/knowledge/file/*', async (request, reply) => {
    const filePath = request.params['*'];
    const absolutePath = path.resolve(knowledgeDir, filePath);
    if (!checkPath(absolutePath, knowledgeDir)) return reply.code(403).send({ error: 'forbidden' });
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
    const filePath = request.query.path;
    if (!filePath) return reply.code(400).send({ error: 'path query parameter is required' });
    const absolutePath = path.resolve(knowledgeDir, filePath);
    if (!checkPath(absolutePath, knowledgeDir)) return reply.code(403).send({ error: 'forbidden' });
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
    const filePath = request.params['*'];
    const absolutePath = path.resolve(knowledgeDir, filePath);
    if (!checkPath(absolutePath, knowledgeDir)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });
    const trashDir = path.join(path.dirname(absolutePath), '.trash');
    const trashPath = path.resolve(trashDir, path.basename(absolutePath));
    mkdirSync(trashDir, { recursive: true });
    const content = readFileSync(absolutePath);
    writeFileSync(trashPath, content);
    rmSync(absolutePath);
    return { ok: true, path: filePath, trash: path.relative(knowledgeDir, trashPath) };
  });

  app.post('/api/knowledge/move', async (request, reply) => {
    const { from, to } = request.body ?? {};
    if (!from || !to) return reply.code(400).send({ error: 'from and to are required' });
    const fromPath = path.resolve(knowledgeDir, from);
    const toPath = path.resolve(knowledgeDir, to);
    if (!checkPath(fromPath, knowledgeDir) || !checkPath(toPath, knowledgeDir)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(fromPath)) return reply.code(404).send({ error: 'source not found' });
    if (existsSync(toPath)) return reply.code(409).send({ error: 'destination already exists' });
    mkdirSync(path.dirname(toPath), { recursive: true });
    const content = readFileSync(fromPath);
    writeFileSync(toPath, content);
    rmSync(fromPath);
    return { ok: true, from, to };
  });
};

const start = async () => {
  const app = Fastify({ logger: true });

  registerKnowledgeRoutes(app);
  registerCollaboraRoutes(app);
  await app.register(wopiRoutes, {
    knowledgeBase: KNOWLEDGE_BASE,
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
    console.log(`Knowledge base: ${KNOWLEDGE_BASE}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
