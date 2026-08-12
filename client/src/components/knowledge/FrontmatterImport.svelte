<script>
  export let path = '';
  export let as = '';
  export let _imported = null;

  const state = _imported || {};
</script>

<div class="fm-import">
  {#if state.ok}
    <span class="fm-import-status">✔ {state.rows} ページ → テーブル {state.table}</span>
  {:else if state.error}
    <span class="fm-import-error">✘ {state.error}</span>
  {:else}
    <span class="fm-import-status">importing…</span>
  {/if}
</div>
