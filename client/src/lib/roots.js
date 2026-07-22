export const fetchRoots = async () => {
  const res = await fetch('/api/knowledge/roots', { credentials: 'include' });
  if (!res.ok) return [];
  const data = await res.json();
  return data.roots || [];
};

export const addRoot = async (name, path) => {
  const res = await fetch('/api/knowledge/roots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, path }),
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.roots;
};

export const deleteRoot = async (name) => {
  const res = await fetch(`/api/knowledge/roots/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.roots;
};
