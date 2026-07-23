import { readFileSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { t } from './libs/i18n.js';

const PREFIX = '';
const MIME_MAP = {
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:  'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt:  'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt:  'application/vnd.oasis.opendocument.text',
  ods:  'application/vnd.oasis.opendocument.spreadsheet',
  odp:  'application/vnd.oasis.opendocument.presentation',
  csv:  'text/csv',
  txt:  'text/plain',
  rtf:  'application/rtf',
};

const SUPPORTED_EXTS = Object.keys(MIME_MAP);

function discoveryXml(wopiSrc) {
  const apps = SUPPORTED_EXTS.map(ext => {
    const mime = MIME_MAP[ext];
    return `    <app name="${mime}">
      <action name="edit" ext="${ext}" urlsrc="${wopiSrc}${PREFIX}/wopi/files/{fileId}"/>
      <action name="view" ext="${ext}" urlsrc="${wopiSrc}${PREFIX}/wopi/files/{fileId}"/>
    </app>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<wopi-discovery>
  <net-zone name="internal">
${apps}
  </net-zone>
</wopi-discovery>`;
}

function checkPath(absolutePath, rootDir) {
  return absolutePath.startsWith(rootDir);
}

async function wopiRoutes(app, opts) {
  const knowledgeDir = path.resolve(opts.knowledgeBase || process.env.KNOWLEDGE_BASE || 'knowledge');
  const wopiSrc = opts.wopiSrc || process.env.WOPI_SRC || '';
  const fileResolver = opts.splitRootPath || ((_req, fileId) => { const fp = path.resolve(knowledgeDir, fileId); return fp.startsWith(knowledgeDir) ? fp : null; });
  const getFilePath = opts.splitRootPath
    ? (request, fileId) => {
        const sr = fileResolver(request, fileId);
        if (!sr) return null;
        const absPath = path.resolve(sr.root.path, sr.filePath);
        if (!absPath.startsWith(sr.root.path)) return null;
        return absPath;
      }
    : (_req, fileId) => {
        const absPath = path.resolve(knowledgeDir, fileId);
        return absPath.startsWith(knowledgeDir) ? absPath : null;
      };

  // CORS for WOPI (Collabora iframe calls back to us)
  const corsHeaders = (reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  };

  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.get(`${PREFIX}/hosting/discovery`, async (request, reply) => {
    corsHeaders(reply);
    reply.type('application/xml');
    return discoveryXml(wopiSrc);
  });

  app.get(`${PREFIX}/wopi/files/*`, async (request, reply) => {
    corsHeaders(reply);
    const wildcard = request.params['*'];
    const isContents = wildcard.endsWith('/contents');
    const fileId = isContents ? wildcard.slice(0, -'/contents'.length) : wildcard;
    const absolutePath = getFilePath(request, fileId);
    if (!absolutePath) return reply.code(404).send({ error: t('not found') });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: t('not found') });

    if (isContents) {
      const data = readFileSync(absolutePath);
      return reply.send(data);
    }

    const stats = statSync(absolutePath);
    const baseName = path.basename(fileId);

    return {
      BaseFileName: baseName,
      Size: stats.size,
      Version: stats.mtimeMs.toString(),
      OwnerId: 'legion',
      UserCanWrite: true,
      SupportsGetLock: false,
      SupportsLocks: false,
      SupportsUpdate: true,
      SupportsRename: false,
      SupportsDelete: false,
      UserFriendlyName: fileId,
      IsAnonymous: false,
      HidePrintOption: 1,
      HideSaveOption: 0,
      HideExportOption: 0,
      DisablePrint: false,
      DisableExport: false,
      DisableCopy: false,
      DisableInactiveMessages: false,
      FileUrl: `${wopiSrc}${PREFIX}/wopi/files/${fileId}/contents`,
    };
  });

  app.post(`${PREFIX}/wopi/files/*`, { bodyLimit: 200 * 1024 * 1024 }, async (request, reply) => {
    corsHeaders(reply);
    const wildcard = request.params['*'];
    if (!wildcard.endsWith('/contents')) return reply.code(400).send({ error: t('only /contents is writable') });

    const fileId = wildcard.slice(0, -'/contents'.length);
    const absolutePath = getFilePath(request, fileId);
    if (!absolutePath) return reply.code(404).send({ error: 'not found' });

    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, request.body);
    return {};
  });
}

export default wopiRoutes;
