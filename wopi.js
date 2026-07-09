import { readFileSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const PREFIX = '/knowledge';
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

  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.get(`${PREFIX}/hosting/discovery`, async (request, reply) => {
    reply.type('application/xml');
    return discoveryXml(wopiSrc);
  });

  app.get(`${PREFIX}/wopi/files/*`, async (request, reply) => {
    const wildcard = request.params['*'];
    const isContents = wildcard.endsWith('/contents');
    const fileId = isContents ? wildcard.slice(0, -'/contents'.length) : wildcard;
    const absolutePath = path.resolve(knowledgeDir, fileId);

    if (!checkPath(absolutePath, knowledgeDir)) return reply.code(403).send({ error: 'forbidden' });
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return reply.code(404).send({ error: 'not found' });

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
      UserFriendlyName: 'Legion User',
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

  app.post(`${PREFIX}/wopi/files/*`, async (request, reply) => {
    const wildcard = request.params['*'];
    if (!wildcard.endsWith('/contents')) return reply.code(400).send({ error: 'only /contents is writable' });

    const fileId = wildcard.slice(0, -'/contents'.length);
    const absolutePath = path.resolve(knowledgeDir, fileId);

    if (!checkPath(absolutePath, knowledgeDir)) return reply.code(403).send({ error: 'forbidden' });

    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, request.body);
    return {};
  });
}

export default wopiRoutes;
