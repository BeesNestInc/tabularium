const BASE = '/api/knowledge';

const cred = { credentials: 'include' };

const apiFetch = async (path, opts = {}) => {
  const res = await fetch(BASE + path, { ...cred, ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
  return res.json();
};

export const fetchPage = (filePath, showHidden) =>
  apiFetch('/page?path=' + encodeURIComponent(filePath || '') + (showHidden ? '&showHidden=true' : ''));
export const fetchContent = (filePath) => apiFetch('/content/' + filePath);
export const fetchRaw = (filePath) => apiFetch('/raw/' + filePath);
export const fetchFile = (filePath) => BASE + '/file/' + filePath;

export const saveRaw = (filePath, content) => apiFetch('/raw/' + filePath, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
});

export const createFile = (name) => apiFetch('/create/' + name, { method: 'POST' });
export const createDirectory = (name) => apiFetch('/mkdir/' + name, { method: 'POST' });

export const moveFile = (from, to) => apiFetch('/move', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }),
});

export const fetchTree = (dirPath, showHidden) =>
  apiFetch('?path=' + encodeURIComponent(dirPath || '') + (showHidden ? '&showHidden=true' : ''));

export const fetchInfo = (path) => apiFetch('/info?path=' + encodeURIComponent(path));

export const fetchRoots = () => apiFetch('/roots');
export const addRoot = (name, path) => apiFetch('/roots', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, path }),
});
export const deleteRoot = (name) => apiFetch('/roots/' + encodeURIComponent(name), { method: 'DELETE' });

// --- Bookmarks ---
export const fetchBookmarks = (folderPath) =>
  apiFetch('/bookmarks?path=' + encodeURIComponent(folderPath));

export const bookmarkAdd = (folderPath, title, url) => apiFetch('/bookmarks', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: folderPath, title, url }),
});

export const bookmarkDelete = (folderPath, url) => apiFetch('/bookmarks', {
  method: 'DELETE', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: folderPath, url }),
});

export const bookmarkEdit = (folderPath, oldUrl, newTitle, newUrl) => apiFetch('/bookmarks', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: folderPath, oldUrl, newTitle, newUrl }),
});

export const fetchPageTitle = (url) =>
  apiFetch('/page-title?url=' + encodeURIComponent(url));
