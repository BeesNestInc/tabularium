// クエリ実行エンジン（DuckDB / PostgreSQL 直）と front matter インポート。
// wiki-server と web-ui の両方から import される共有モジュール。
// サーバー起動の副作用は持たない（start() を含まない）。
import duckdb from 'duckdb';
import pg from 'pg';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { matter } from './utils.js';

let _db;
const getDb = () => {
  if (!_db) _db = new duckdb.Database(':memory:');
  return _db;
};

const exec = (sql) => new Promise((resolve, reject) => {
  getDb().exec(sql, (err) => (err ? reject(err) : resolve()));
});
const prepare = (sql) => new Promise((resolve, reject) => {
  getDb().prepare(sql, (err, stmt) => (err ? reject(err) : resolve(stmt)));
});
const runPrepared = (stmt, params) => new Promise((resolve, reject) => {
  stmt.run(...params, (err) => (err ? reject(err) : resolve()));
});

const execQuery = (sql) => new Promise((resolve, reject) => {
  const db = getDb();
  db.all(sql, (err, rows) => {
    if (err) return reject(err);
    if (!rows || rows.length === 0) {
      return resolve({ columns: [], rows: [], rowCount: 0 });
    }
    const columns = Object.keys(rows[0]).map(name => {
      const val = rows[0][name];
      let type = typeof val;
      if (val === null) type = 'null';
      else if (val instanceof Date) type = 'date';
      else if (typeof val === 'bigint') type = 'bigint';
      return { name, type };
    });
    const processed = rows.map(row => {
      const newRow = {};
      for (const key in row) {
        const val = row[key];
        if (typeof val === 'bigint') newRow[key] = Number(val);
        else if (val instanceof Date) newRow[key] = val.toISOString();
        else newRow[key] = val;
      }
      return newRow;
    });
    resolve({ columns, rows: processed, rowCount: processed.length });
  });
});

const PG_TYPE_MAP = {
  16: 'boolean', 17: 'bytea', 19: 'name', 20: 'bigint', 21: 'smallint', 23: 'integer',
  25: 'text', 26: 'oid', 114: 'json', 142: 'xml', 199: 'json[]',
  700: 'real', 701: 'double', 1042: 'bpchar', 1043: 'varchar',
  1082: 'date', 1083: 'time', 1114: 'timestamp', 1184: 'timestamptz',
  1700: 'numeric', 2950: 'uuid', 3802: 'jsonb', 3807: 'jsonb[]',
};
const numericTypes = new Set([20, 21, 23, 700, 701, 1700]);

const toLibpqConnStr = (url) => {
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) return url;
  try {
    const u = new URL(url);
    const params = [];
    if (u.hostname) params.push(`host=${u.hostname}`);
    if (u.port) params.push(`port=${u.port}`);
    if (u.pathname && u.pathname.length > 1) params.push(`dbname=${u.pathname.slice(1)}`);
    if (u.username) params.push(`user=${u.username}`);
    if (u.password) params.push(`password=${u.password}`);
    return params.join(' ');
  } catch { return url; }
};

const parseConnStr = (s) => {
  if (s.startsWith('postgres://') || s.startsWith('postgresql://')) {
    try {
      const u = new URL(s);
      return {
        host: u.hostname || undefined, port: u.port ? parseInt(u.port) : undefined,
        database: u.pathname ? u.pathname.slice(1) : undefined,
        user: u.username || undefined, password: u.password || undefined,
      };
    } catch { return s; }
  }
  const parts = s.match(/(\w+)=('[^']*'|[^\s]+)/g);
  if (parts) {
    const cfg = {};
    for (const p of parts) {
      const [k, ...v] = p.split('=');
      const val = v.join('=').replace(/^'(.*)'$/, '$1');
      if (k === 'host') cfg.host = val;
      else if (k === 'port') cfg.port = parseInt(val);
      else if (k === 'dbname') cfg.database = val;
      else if (k === 'user') cfg.user = val;
      else if (k === 'password') cfg.password = val;
    }
    return cfg;
  }
  return s;
};

const execPgQuery = async (connStr, sql) => {
  const config = typeof connStr === 'string' ? parseConnStr(connStr) : connStr;
  const client = new pg.Client(config);
  try {
    await client.connect();
    const res = await client.query(sql);
    if (!res || !res.fields || res.fields.length === 0) {
      return { columns: [], rows: [], rowCount: 0 };
    }
    const columns = res.fields.map(f => ({ name: f.name, type: PG_TYPE_MAP[f.dataTypeID] || f.dataTypeID.toString() }));
    const pgColTypes = res.fields.reduce((acc, f) => { acc[f.name] = f.dataTypeID; return acc; }, {});
    const rows = (res.rows || []).map(row => {
      const newRow = {};
      for (const key in row) {
        const val = row[key];
        if (val instanceof Date) newRow[key] = val.toISOString();
        else if (typeof val === 'bigint') newRow[key] = Number(val);
        else if (typeof val === 'string' && numericTypes.has(pgColTypes[key])) newRow[key] = parseFloat(val);
        else newRow[key] = val;
      }
      return newRow;
    });
    return { columns, rows, rowCount: rows.length };
  } finally {
    await client.end().catch(() => {});
  }
};

export const initDuckDbExtras = async () => {
  const pgConnStr = process.env.PG_CONNECT_STRING || process.env.DATABASE_URL;
  if (!pgConnStr) return;
  const libpq = toLibpqConnStr(pgConnStr);
  try {
    await new Promise((resolve, reject) => {
      getDb().exec('INSTALL postgres; LOAD postgres;', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    await new Promise((resolve, reject) => {
      getDb().exec(`ATTACH '${libpq}' AS onprem_pg (TYPE POSTGRES);`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    console.log('DuckDB attached to PostgreSQL.');
  } catch (err) {
    console.error('Failed to attach PostgreSQL:', err.message);
  }
};

// --- front matter インポート ---

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'public', '.trash', '.svn']);

const collectMarkdownFiles = (absPath, rootPath) => {
  const files = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const full = path.join(dir, entry);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(full);
      } else if (/\.(md|mmd)$/i.test(entry)) {
        if (full.startsWith(rootPath)) files.push(full);
      }
    }
  };
  walk(absPath);
  return files;
};

const normalizeValue = (v) => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return Number(v);
  return v;
};

/**
 * 指定した wiki パス（ディレクトリ or .md ファイル）の front matter を
 * DuckDB のテーブルとして登録する。
 * @param {{path:string, as?:string}} req
 * @param {{splitRootPath:Function, getRoots:Function}} opts
 * @returns {Promise<{table:string, rows:number}>}
 */
export const importFrontmatter = async (req, opts = {}) => {
  const resolvePath = req.resolvePath || ((p) => null);
  const target = req.path || '';
  if (!target) throw new Error('path is required');
  const sr = resolvePath(target);
  if (!sr || !sr.root || !sr.root.path) throw new Error(`path not found: ${target}`);
  const absPath = path.resolve(sr.root.path, sr.filePath || '');
  if (!absPath.startsWith(sr.root.path)) throw new Error('forbidden');

  let stat;
  try { stat = statSync(absPath); } catch { throw new Error(`path not found: ${target}`); }

  const files = stat.isDirectory()
    ? collectMarkdownFiles(absPath, sr.root.path)
    : (/\.(md|mmd)$/i.test(absPath) ? [absPath] : []);

  const rows = files.map((full) => {
    let content = '';
    try { content = readFileSync(full, 'utf-8'); } catch { content = ''; }
    let fm = {};
    try { ({ data: fm } = matter(content)); } catch { fm = {}; }
    const name = path.basename(full);
    const rel = full.slice(sr.root.path.length).replace(/^[\\/]/, '');
    const wikiPath = `${sr.root.name}/${rel}`;
    const st = statSync(full);
    const data = JSON.stringify(Object.fromEntries(Object.entries(fm).map(([k, v]) => [k, normalizeValue(v)])));
    return [
      wikiPath, sr.root.name, name,
      typeof fm.title === 'string' ? fm.title : name,
      st.mtime.toISOString(),
      st.size,
      data,
    ];
  });

  const table = req.as
    ? String(req.as).replace(/[^A-Za-z0-9_]/g, '_')
    : 'fm_' + target.replace(/[^A-Za-z0-9_]/g, '_');

  await exec(`CREATE OR REPLACE TABLE ${table} (path VARCHAR, root VARCHAR, name VARCHAR, title VARCHAR, mtime VARCHAR, size BIGINT, data VARCHAR)`);
  if (rows.length) {
    const stmt = await prepare(`INSERT INTO ${table} VALUES (?,?,?,?,?,?,?)`);
    for (const row of rows) await runPrepared(stmt, row);
  }
  return { table, rows: rows.length };
};

// --- ルート登録 ---

export const registerQueryRoutes = (app, opts = {}) => {
  const t = opts.t || ((k) => k);

  app.post('/api/execute', async (request, reply) => {
    const { language, code, attach } = request.body || {};
    if (!language || !code) {
      return reply.code(400).send({ error: t('`language` and `code` are required.') });
    }
    const start = Date.now();
    if (language === 'postgresql' || language === 'pg') {
      const connStr = attach && typeof attach === 'object'
        ? Object.values(attach)[0]
        : process.env.PG_CONNECT_STRING || process.env.DATABASE_URL;
      if (!connStr) {
        return reply.code(400).send({ error: t('No database connection string. Set `databases:` in front matter or PG_CONNECT_STRING env.') });
      }
      try {
        const result = await execPgQuery(connStr, code);
        result.duration = Date.now() - start;
        return result;
      } catch (err) {
        return reply.code(500).send({ error: err.message });
      }
    }
    if (language === 'sql' || language === 'duckdb') {
      if (attach && typeof attach === 'object') {
        for (const [alias, connStr] of Object.entries(attach)) {
          const libpq = toLibpqConnStr(connStr);
          try {
            await new Promise((resolve, reject) => {
              getDb().exec('LOAD postgres;', (err) => {
                if (err) {
                  getDb().exec('INSTALL postgres; LOAD postgres;', (e) => e ? reject(e) : resolve());
                } else { resolve(); }
              });
            });
            await new Promise((resolve, reject) => {
              getDb().exec(`ATTACH '${libpq}' AS ${alias} (TYPE POSTGRES);`, (err) => {
                if (err && err.message.includes('already exists')) return resolve();
                if (err) return reject(err);
                resolve();
              });
            });
          } catch (err) {
            return reply.code(500).send({ error: t('Failed to attach database \'{0}\': {1}', alias, err.message) });
          }
        }
      }
      try {
        const result = await execQuery(code);
        result.duration = Date.now() - start;
        return result;
      } catch (err) {
        return reply.code(500).send({ error: err.message });
      }
    }
    return reply.code(400).send({ error: t('Unsupported language: {0}. Supported: sql, duckdb, postgresql', language) });
  });

  app.post('/api/frontmatter/import', async (request, reply) => {
    const { path: p, as } = request.body || {};
    try {
      const resolvePath = opts.splitRootPath ? (pp) => opts.splitRootPath(request, pp) : null;
      const result = await importFrontmatter({ path: p, as, resolvePath }, opts);
      return result;
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });
};
