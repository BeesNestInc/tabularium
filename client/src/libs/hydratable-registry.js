const registry = new Map();

const register = (name, loader, opts = {}) => {
  if (!name || typeof loader !== 'function') {
    throw new Error('registerHydratable(name, loader): loader は () => import(...) を返す関数を指定してください');
  }
  registry.set(name, { loader, container: !!opts.container });
};
const get = (name) => registry.get(name);
const has = (name) => registry.has(name);

// --- 組み込みコンポーネント ---
register('Query', () => import('../components/knowledge/Query.svelte'));
register('Chart', () => import('../components/knowledge/Chart.svelte'));
register('DataTable', () => import('../components/knowledge/DataTable.svelte'));
register('ParamInput', () => import('../components/knowledge/ParamInput.svelte'));
register('DynamicValue', () => import('../components/knowledge/DynamicValue.svelte'));
register('Script', () => import('../components/knowledge/Script.svelte'));
register('Form', () => import('../components/knowledge/Form.svelte'), { container: true });
register('FrontmatterImport', () => import('../components/knowledge/FrontmatterImport.svelte'));
register('DataGrid', () => import('../components/knowledge/DataGrid.svelte'));

export const registerHydratable = register;
export const getHydratable = get;
export const isHydratable = has;
