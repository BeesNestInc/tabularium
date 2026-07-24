import bcrypt from 'bcryptjs';
import db from '../db.js';

export class BuiltinAuthProvider {
  authenticate(loginId, password) {
    const row = db.findByLoginId(loginId);
    if (!row || row.disabled_at) return null;
    if (!bcrypt.compareSync(password, row.password_hash)) return null;
    return { id: row.id, loginId: row.login_id, name: row.name, role: row.role, roots: this.#parseRoots(row.roots) };
  }

  getUser(id) {
    const row = db.findById(id);
    if (!row) return null;
    return { id: row.id, loginId: row.login_id, name: row.name, role: row.role, roots: this.#parseRoots(row.roots) };
  }

  getUsers() {
    return db.findAll().map(r => ({ id: r.id, loginId: r.login_id, name: r.name, role: r.role, disabled: !!r.disabled_at, createdAt: r.created_at }));
  }

  findByLoginId(loginId) {
    const r = db.findByLoginId(loginId);
    return r ? { id: r.id } : null;
  }

  countUsers() { return db.count(); }

  createUser({ loginId, name, password, email = null, role = null }) {
    if (db.count() === 0) role = role || 'admin';
    else role = role || 'user';
    const hash = bcrypt.hashSync(password, 10);
    const user = db.create({ login_id: loginId, name, password_hash: hash, email, role });
    return { id: user.id, loginId: user.login_id, name: user.name, role: user.role };
  }

  changePassword(id, newPassword) {
    const hash = bcrypt.hashSync(newPassword, 10);
    db.update(id, { password_hash: hash });
  }

  #parseRoots(raw) {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }
}
