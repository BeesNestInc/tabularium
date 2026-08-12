// Tabularium / Legion の標準ライブラリ。
// フレームワーク非依存のプレーン ESM。wiki の js:run スクリプトや
// プラグイン・アプリから import して API を呼べる。
import * as knowledgeApi from './knowledge-api.js';

const state = {
  tablariumBase: '',
  legionBase: '',
  credentials: 'include',
};

export const configure = (opts = {}) => {
  if (opts.tablariumBase !== undefined) state.tablariumBase = opts.tablariumBase;
  if (opts.legionBase !== undefined) state.legionBase = opts.legionBase;
  if (opts.credentials !== undefined) state.credentials = opts.credentials;
  return { ...state };
};

const toQuery = (params) => {
  if (!params) return '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.append(k, v);
  }
  const s = qs.toString();
  return s ? '?' + s : '';
};

const makeClient = (getBase) => {
  const doFetch = async (method, path, json) => {
    const res = await fetch(getBase() + path, {
      method,
      credentials: state.credentials,
      headers: json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    return res.json();
  };
  return {
    get: (path) => doFetch('GET', path),
    post: (path, json) => doFetch('POST', path, json),
    put: (path, json) => doFetch('PUT', path, json),
    patch: (path, json) => doFetch('PATCH', path, json),
    del: (path) => doFetch('DELETE', path),
  };
};

const tablarium = () => makeClient(() => state.tablariumBase + '/api');
const legion = () => makeClient(() => state.legionBase + '/api');

// --- Tabularium（wiki / ナレッジベース） ---

export const Tablarium = {
  // ナレッジ API（既存の知識クライアントを再利用 + list コンビニエンス）
  knowledge: {
    ...knowledgeApi,
    // ディレクトリ配下のエントリ一覧（{ name, type, path, ... }）
    list: (dir) => knowledgeApi.fetchPage(dir || '').then((r) => r.entries || r.children || []),
  },
  // クエリ実行・front matter import
  query: {
    run: (code, { language = 'sql', attach } = {}) =>
      tablarium().post('/execute', { language, code, ...(attach ? { attach } : {}) }),
    importFrontmatter: (path, as) =>
      tablarium().post('/frontmatter/import', { path, ...(as ? { as } : {}) }),
  },
  collab: {
    config: () => tablarium().get('/collabora/config'),
  },
  auth: {
    me: () => tablarium().get('/auth/me'),
  },
};

// --- Legion（エージェントオーケストレーション） ---

export const Legion = {
  auth: {
    me: () => legion().get('/auth/me'),
  },
  personas: {
    list: () => legion().get('/personas'),
  },
  roles: {
    list: () => legion().get('/roles'),
  },
  supervisor: {
    status: () => legion().get('/supervisor/status'),
    config: () => legion().get('/supervisor/config'),
    start: (persona, mode) => legion().post(`/supervisor/start/${persona}/${mode}`),
    startCoding: (persona, role) => legion().post(`/supervisor/start/${persona}/coding/${role}`),
    stop: (persona, mode) => legion().post(`/supervisor/stop/${persona}/${mode}`),
    restart: (persona, mode) => legion().post(`/supervisor/restart/${persona}/${mode}`),
    logs: (persona, mode) => legion().get(`/supervisor/logs/${persona}/${mode}`),
  },
  tasks: {
    list: (query) => legion().get('/tasks' + toQuery(query)),
    get: (messageId) => legion().get(`/tasks/${messageId}`),
  },
  mailbox: {
    graph: () => legion().get('/mailbox/graph'),
    messages: () => legion().get('/mailbox/messages'),
  },
  logs: {
    list: () => legion().get('/logs'),
    get: (filename) => legion().get(`/logs/${encodeURIComponent(filename)}`),
  },
  chat: {
    send: (message) => legion().post('/chat', { message }),
    history: () => legion().get('/chat/history'),
  },
  instruction: {
    send: (message) => legion().post('/instruction', { message }),
    history: () => legion().get('/instruction/history'),
  },
};
