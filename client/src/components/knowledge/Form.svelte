<script>
  let { ctx, name = '', button = '適用', target = null } = $props();

  let status = $state('');

  const apply = async () => {
    const values = {};
    if (target) {
      target.querySelectorAll('[data-hydrate="ParamInput"]').forEach((ph) => {
        let props = {};
        try { props = JSON.parse(ph.dataset.props || '{}'); } catch {}
        if (!props.name) return;
        const input = ph.querySelector('input, select, textarea');
        if (!input) return;
        values[props.name] = input.type === 'checkbox' ? (input.checked ? 'true' : 'false') : input.value;
      });
    }
    const affected = ctx.applyParams(values);
    const n = Object.keys(values).length;
    status = n ? `✔ ${n} 項目を適用${affected.length ? `（${affected.length} クエリ更新）` : ''}` : '';
  };
</script>

<div class="form-toolbar">
  {#if name}<span class="form-name">{name}</span>{/if}
  <button type="button" class="btn btn-sm btn-primary form-apply-btn" onclick={apply}>{button}</button>
  {#if status}<span class="form-status">{status}</span>{/if}
</div>
