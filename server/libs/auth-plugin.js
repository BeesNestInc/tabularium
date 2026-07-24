import { randomBytes, createHmac } from 'node:crypto';
import cookie from '@fastify/cookie';
import secureSession from '@fastify/secure-session';
import fp from 'fastify-plugin';
import { authenticate, getUser, getUsers, findByLoginId, createUser, countUsers } from './auth/index.js';

const SESSION_KEY_HEX = process.env.WIKI_SESSION_KEY || randomBytes(32).toString('hex');
const sessionKey = Buffer.from(SESSION_KEY_HEX.padEnd(64, '0').slice(0, 64), 'hex');

function createWopiToken(loginId) {
  const payload = { sub: loginId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 };
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
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export { createWopiToken, verifyWopiToken };

export default fp(async function authPlugin(app) {
  await app.register(cookie);
  await app.register(secureSession, {
    key: sessionKey,
    cookie: { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 86400 * 7 },
  });

  app.decorateRequest('user', null);

  app.post('/api/auth/signup', async (request, reply) => {
    const { loginId, name, password } = request.body || {};
    if (!loginId || !name || !password) {
      return reply.code(400).send({ ok: false, error: 'loginId, name, password required' });
    }
    if (findByLoginId(loginId)) {
      return reply.code(409).send({ ok: false, error: 'loginId already exists' });
    }
    const user = createUser({ loginId, name, password });
    request.session.set('user', user);
    request.user = user;
    return { ok: true, user };
  });

  app.post('/api/auth/login', async (request, reply) => {
    const { loginId, password } = request.body || {};
    if (!loginId || !password) {
      return reply.code(400).send({ ok: false, error: 'loginId and password required' });
    }
    const user = authenticate(loginId, password);
    if (!user) return reply.code(401).send({ ok: false, error: 'invalid credentials' });
    request.session.set('user', user);
    request.user = user;
    return { ok: true, user };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    request.session.delete();
    request.user = null;
    return { ok: true };
  });

  app.get('/api/auth/me', async (request, reply) => {
    const sessionUser = request.session?.get?.('user');
    if (!sessionUser) return reply.code(401).send({ error: 'unauthorized' });
    const user = getUser(sessionUser.id);
    if (!user) {
      request.session.delete();
      return reply.code(401).send({ error: 'user not found' });
    }
    return { user };
  });

  app.get('/api/auth/users', async (request, reply) => {
    const sessionUser = request.session?.get?.('user');
    if (!sessionUser) return reply.code(401).send({ error: 'unauthorized' });
    if (sessionUser.role !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    return { users: getUsers() };
  });

  app.get('/api/auth/wopi-token', async (request, reply) => {
    const sessionUser = request.session?.get?.('user');
    if (!sessionUser) return reply.code(401).send({ error: 'unauthorized' });
    return { token: createWopiToken(sessionUser.loginId) };
  });

  // Auth guard: protects /api/* and /wopi/* (except /api/auth/*, /hosting/discovery)
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url;
    if (url.startsWith('/api/auth/')) return;
    if (url === '/hosting/discovery') return;
    if (!url.startsWith('/api/') && !url.startsWith('/wopi/')) return;
    const user = request.session?.get?.('user');
    if (!user) {
      const token = request.query.access_token;
      if (token && verifyWopiToken(token)) return;
      return reply.code(401).send({ error: 'unauthorized' });
    }
    request.user = user;
  });
});
