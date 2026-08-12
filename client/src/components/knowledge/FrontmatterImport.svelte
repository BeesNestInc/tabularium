<script>
  export let path = '';
  export let as = '';
  export let _imported = null;

  const state = _imported || {};
  const unit = state.kind === 'csv' ? '行' : 'ページ';
</script>

<div class="fm-import">
  {#if state.ok}
    <span class="fm-import-status">✔ {state.rows} {unit} → テーブル {state.table}</span>
  {:else if state.error}
    <span class="fm-import-error">✘ {state.error}</span>
  {:else}
    <span class="fm-import-status">importing…</span>
  {/if}
</div>
