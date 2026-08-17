<script>
  import { onMount } from 'svelte';
  import { t } from '../../libs/i18n.js';
  import ResultTable from './ResultTable.svelte';
  import EChart from './EChart.svelte';

  export let ctx;
  export let name = '';
  export let sql = '';
  export let auto = false;

  const { results, running } = ctx;

  $: result = $results[name];
  $: isRunning = $running[name];
  let tab = 'table';

  const run = async () => {
    try { await ctx.runQuery(name, sql); } catch {}
  };

  onMount(() => {
    ctx.registerQuery(name, sql, auto);
    if (auto) run();
  });

  const buildAutoOption = (d) => {
    const numericCols = d.columns.filter((c) => ['number', 'bigint', 'integer'].includes(c.type));
    const stringCols = d.columns.filter((c) => ['string', 'varchar'].includes(c.type));
    if (numericCols.length === 0 || d.rows.length === 0) return null;
    const xCol = stringCols.length > 0 ? stringCols[0].name : null;
    const yCols = numericCols.slice(0, 3);
    const isBar = xCol !== null && d.rows.length <= 30;
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 20, bottom: 80, top: 40 },
      xAxis: xCol
        ? { type: 'category', data: d.rows.map((r) => r[xCol]), axisLabel: { rotate: d.rows.length > 10 ? 45 : 0, fontSize: 11 } }
        : { type: 'category', data: d.rows.map((_, i) => '#' + (i + 1)) },
      yAxis: { type: 'value' },
      series: yCols.map((col, i) => ({
        name: col.name,
        type: isBar ? 'bar' : 'line',
        data: d.rows.map((r) => r[col.name]),
      })),
      legend: yCols.length > 1 ? { data: yCols.map((c) => c.name), bottom: 0 } : undefined,
    };
  };

  $: autoOption = result?.data && result.data.columns.length ? buildAutoOption(result.data) : null;
</script>

<div class="sql-block">
  <pre class="language-sql"><code>{sql}</code></pre>
  <div class="sql-toolbar">
    <button class="sql-run-btn btn btn-sm btn-outline-primary" onclick={run} disabled={isRunning}>
      {isRunning ? '⏳' : '▶ Run'}
    </button>
    <span class="sql-status">
      {#if isRunning}{t('running')}
      {:else if result?.status === 'done'}✔ {result.data.rowCount} rows ({result.data.duration}ms)
      {:else if result?.status === 'error'}✘ {result.error}
      {/if}
    </span>
  </div>
  {#if result?.status === 'done' && result.data.columns.length}
    <div class="sql-result">
      <div class="sql-result-tabs">
        <button class="sql-tab-btn" class:active={tab === 'table'} onclick={() => tab = 'table'}>{t('table')}</button>
        <button class="sql-tab-btn" class:active={tab === 'chart'} onclick={() => tab = 'chart'}>{t('chart')}</button>
      </div>
      {#if tab === 'table'}
        <ResultTable data={result.data} executedAt={result.executedAt} />
      {:else if autoOption}
        <div class="sql-chart-container"><EChart option={autoOption} /></div>
      {:else}
        <div class="sql-chart-container"><p class="text-muted">{t('noNumericColumns')}</p></div>
      {/if}
    </div>
  {:else if result?.status === 'done'}
    <div class="sql-result"><p class="text-muted">{t('noResults')}</p></div>
  {:else if result?.status === 'error'}
    <div class="sql-result"><p class="text-danger">✘ {result.error}</p></div>
  {/if}
</div>
