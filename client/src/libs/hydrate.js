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

  const mounted = [];
  for (const el of els) {
    const loader = getHydratable(el.dataset.hydrate);
    if (!loader) continue;
    const props = parseProps(el);
    if (el.dataset.hydrate === 'Query') props.auto = referenced.has(props.name);
    const { default: Component } = await loader();
    el.innerHTML = '';
    mounted.push(mount(Component, { target: el, props: { ...props, ctx } }));
  }
  return mounted;
};

export const unmountAll = (instances) => {
  for (const inst of instances || []) {
    try { unmount(inst); } catch {}
  }
};
