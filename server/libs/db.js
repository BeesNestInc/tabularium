import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');

const dbPath = process.env.DATABASE_URL || resolve(projectRoot, 'data/tabularium.json');
const dataDir = dirname(dbPath);
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let users = [];
let nextId = 1;

function save() {
  writeFileSync(dbPath, JSON.stringify({ nextId, users }, null, 2), 'utf-8');
}

function load() {
  if (!existsSync(dbPath)) return;
  try { const d = JSON.parse(readFileSync(dbPath, 'utf-8')); nextId = d.nextId || 1; users = d.users || []; } catch { users = []; }
}

load();

export default {
  findByLoginId(loginId) {
    return users.find(u => u.login_id === loginId && !u.deleted_at) || null;
  },
  findById(id) {
    return users.find(u => u.id === id && !u.deleted_at) || null;
  },
  findAll() {
    return users.filter(u => !u.deleted_at);
  },
  create(data) {
    const now = Math.floor(Date.now() / 1000);
    const user = { id: nextId++, ...data, roots: '[]', disabled_at: null, deleted_at: null, created_at: now, updated_at: now };
    users.push(user);
    save();
    return user;
  },
  update(id, data) {
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    Object.assign(users[idx], data, { updated_at: Math.floor(Date.now() / 1000) });
    save();
    return users[idx];
  },
  count() {
    return users.filter(u => !u.deleted_at).length;
  },
};
