import { mount, unmount } from 'svelte';
import { getHydratable } from './hydratable-registry.js';

export { registerHydratable } from './hydratable-registry.js';

const parseProps = (el) => {
  try { return JSON.parse(el.dataset.props || '{}'); } catch { return {}; }
};

export const hydrate = async (root, ctx) => {
  if (!root) return [];
  const els = [...root.querySelectorAll('[data-hydrate]')];
  if (!els.length) return [];

  // data プロパティを持つコンポーネントは、それがクエリ名への参照だとみなして自動実行対象にする
  const referenced = new Set();
  for (const el of els) {
    const p = parseProps(el);
    if (p.data) referenced.add(p.data);
  }

  // FrontmatterImport は先に import を完了させてから全コンポーネントを mount する
  // （import を待たずに自動実行クエリが走るとテーブルが無くて失敗するため）
  for (const el of els) {
    if (el.dataset.hydrate !== 'FrontmatterImport') continue;
    const props = parseProps(el);
    if (!props.path) continue;
    try {
      const res = await fetch('/api/frontmatter/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: props.path, as: props.as || '' }),
      });
      const data = await res.json();
      props._imported = res.ok
        ? { ok: true, rows: data.rows, table: data.table, kind: data.kind }
        : { ok: false, error: data.error || 'import failed' };
    } catch (e) {
      props._imported = { ok: false, error: e.message };
    }
    el._mdxProps = props;
  }

  const mounted = [];
  for (const el of els) {
    const meta = getHydratable(el.dataset.hydrate);
    if (!meta) continue;
    const { loader, container } = meta;
    const props = el._mdxProps || parseProps(el);
    if (el.dataset.hydrate === 'Query') props.auto = referenced.has(props.name);
    if (el.dataset.hydrate === 'ParamInput') props.inForm = !!el.closest('[data-hydrate="Form"]');
    // container コンポーネントは子プレースホルダを残すため innerHTML を消さない
    if (!container) el.innerHTML = '';
    const { default: Component } = await loader();
    mounted.push(mount(Component, { target: el, props: { ...props, ctx, target: el } }));
  }
  return mounted;
};

export const unmountAll = (instances) => {
  for (const inst of instances || []) {
    try { unmount(inst); } catch {}
  }
};
