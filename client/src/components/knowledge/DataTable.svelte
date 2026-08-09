<script>
  import ResultTable from './ResultTable.svelte';
  import { t } from '../../libs/i18n.js';

  export let ctx;
  export let data = '';   // query name

  const { results } = ctx;

  $: result = $results[data];
</script>

{#if result?.data}
  <ResultTable data={result.data} />
{:else if result?.status === 'error'}
  <p class="text-danger">✘ {result.error}</p>
{:else}
  <div class="mdx-hydrate-box">{t('runQueryHint')}</div>
{/if}
