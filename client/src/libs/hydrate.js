import { mount, unmount } from 'svelte';

const registry = {
  Query: () => import('../components/knowledge/Query.svelte'),
  Chart: () => import('../components/knowledge/Chart.svelte'),
  DataTable: () => import('../components/knowledge/DataTable.svelte'),
  ParamInput: () => import('../components/knowledge/ParamInput.svelte'),
  DynamicValue: () => import('../components/knowledge/DynamicValue.svelte'),
};

const parseProps = (el) => {
  try { return JSON.parse(el.dataset.props || '{}'); } catch { return {}; }
};

export const hydrate = async (root, ctx) => {
  if (!root) return [];
  const els = [...root.querySelectorAll('[data-hydrate]')];
  if (!els.length) return [];

  const referenced = new Set();
  for (const el of els) {
    if (['Chart', 'DataTable', 'DynamicValue'].includes(el.dataset.hydrate)) {
      const p = parseProps(el);
      if (p.data) referenced.add(p.data);
    }
  }

  const mounted = [];
  for (const el of els) {
    const loader = registry[el.dataset.hydrate];
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
