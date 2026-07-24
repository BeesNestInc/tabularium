import { BuiltinAuthProvider } from './builtin.js';

const providers = [new BuiltinAuthProvider()];

export const authenticate = (loginId, password) => {
  for (const p of providers) {
    const user = p.authenticate(loginId, password);
    if (user) return user;
  }
  return null;
};

export const getUser = (id) => {
  for (const p of providers) {
    const user = p.getUser(id);
    if (user) return user;
  }
  return null;
};

export const getUsers = () => {
  return providers[0].getUsers();
};

export const findByLoginId = (loginId) => providers[0].findByLoginId(loginId);
export const createUser = (data) => providers[0].createUser(data);
export const countUsers = () => providers[0].countUsers();
export const changePassword = (id, newPassword) => providers[0].changePassword(id, newPassword);
