import { randomBytes, createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';
import cookie from '@fastify/cookie';
import secureSession from '@fastify/secure-session';
import { t } from './i18n.js';

const WIKI_PASSWORD = process.env.WIKI_PASSWORD || '';
const SESSION_KEY_HEX = process.env.WIKI_SESSION_KEY || randomBytes(32).toString('hex');
const isAuthEnabled = !!WIKI_PASSWORD;

const sessionKey = Buffer.from(SESSION_KEY_HEX.padEnd(64, '0').slice(0, 64), 'hex');

function createWopiToken(filePath) {
  const payload = { path: filePath, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, sub: 'wiki' };
  const raw = JSON.stringify(payload);
  const payloadStr = Buffer.from(raw).toString('base64url');
  const sig = createHmac('sha256', sessionKey).update(payloadStr).digest('base64url');
  return payloadStr + '.' + sig;
}

function verifyWopiToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const [payloadStr, sig] = parts;
    const expected = createHmac('sha256', sessionKey).update(payloadStr).digest('base64url');
    if (sig !== expected) return null;
    const raw = Buffer.from(payloadStr, 'base64url').toString('utf-8');
    const payload = JSON.parse(raw);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

let passwordHash = '';
if (isAuthEnabled) {
  passwordHash = bcrypt.hashSync(WIKI_PASSWORD, 10);
  console.log('[auth] password hashing done, session key: ' + SESSION_KEY_HEX.slice(0, 16) + '...');
}

export { isAuthEnabled, createWopiToken, verifyWopiToken };

export async function setupAuth(app) {
  if (!isAuthEnabled) {
    app.get('/api/auth/me', async () => ({ user: { id: 'wiki', name: 'Wiki', role: 'admin' } }));
    app.post('/api/auth/logout', async () => ({}));
    app.post('/api/auth/login', async () => ({ ok: true }));
    return;
  }

  await app.register(cookie);
  await app.register(secureSession, {
    key: sessionKey,
    cookie: { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 86400 },
  });

  app.post('/api/auth/login', async (request, reply) => {
    const { password } = request.body || {};
    if (!password) return reply.code(400).send({ error: 'password required' });
    if (!await bcrypt.compare(password, passwordHash)) return reply.code(401).send({ error: 'invalid password' });
    request.session.set('user', { id: 'wiki', name: 'Wiki', role: 'admin' });
    return { ok: true, user: { id: 'wiki', name: 'Wiki', role: 'admin' } };
  });

  app.get('/api/auth/me', async (request, reply) => {
    const user = request.session?.get?.('user');
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    return { user };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    request.session?.delete?.();
    return {};
  });

  app.get('/api/auth/wopi-token', async (request, reply) => {
    const user = request.session?.get?.('user');
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const { path: filePath } = request.query;
    if (!filePath) return reply.code(400).send({ error: 'path required' });
    return { token: createWopiToken(filePath) };
  });
}

export function makeAuthGuard() {
  if (!isAuthEnabled) return null;
  return async (request, reply) => {
    const url = request.url;
    if (url === '/api/auth/login' || url.startsWith('/api/auth/')) return;
    if (url === '/hosting/discovery') return;
    if (!url.startsWith('/api/') && !url.startsWith('/wopi/')) return;
    const user = request.session?.get?.('user');
    if (!user) {
      const token = request.query.access_token;
      if (token && verifyWopiToken(token)) return;
      return reply.code(401).send({ error: 'unauthorized' });
    }
  };
}
