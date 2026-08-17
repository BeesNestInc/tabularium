<script>
  import EChart from './EChart.svelte';
  import { t } from '../../libs/i18n.js';

  export let ctx;
  export let data = '';   // query name
  export let type = 'LineChart';
  export let x = '';
  export let y = '';
  export let y2 = '';
  export let fill = '';

  const { results } = ctx;

  $: result = $results[data];
  $: resultData = result?.data;
  $: option = resultData ? buildOption({ type, x, y, y2, fill }, resultData) : null;

  const fmtTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const buildOption = (cfg, d) => {
    const xCol = cfg.x || d.columns.find((c) => ['string', 'varchar', 'text'].includes(c.type))?.name;
    const yCol = cfg.y || d.columns.find((c) => ['number', 'integer', 'bigint'].includes(c.type))?.name;
    if (!yCol) return null;
    const rows = d.rows;
    const base = {
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 20, bottom: 80, top: 40 },
      xAxis: xCol
        ? { type: 'category', data: rows.map((r) => r[xCol]), axisLabel: { rotate: rows.length > 10 ? 45 : 0 } }
        : { type: 'category', data: rows.map((_, i) => '#' + (i + 1)) },
      yAxis: { type: 'value' },
    };
    if (cfg.type === 'PieChart') {
      return {
        tooltip: { trigger: 'item', formatter: '{b}: {c}' },
        series: [{
          type: 'pie', radius: ['40%', '60%'],
          data: rows.map((r) => ({ name: xCol ? r[xCol] : '', value: r[yCol] })),
          label: { formatter: '{b}: {c}' },
        }],
      };
    }
    const chartTypeMap = { LineChart: 'line', BarChart: 'bar', AreaChart: 'line', ScatterPlot: 'scatter' };
    const chartType = chartTypeMap[cfg.type] || 'line';
    const isArea = cfg.type === 'AreaChart' || String(cfg.fill) === 'true';
    const series = [{ type: chartType, data: rows.map((r) => r[yCol]), name: yCol, ...(isArea ? { areaStyle: {} } : {}) }];
    if (cfg.y2) series.push({ type: chartType, data: rows.map((r) => r[cfg.y2]), name: cfg.y2 });
    return { ...base, series, legend: series.length > 1 ? { data: series.map((s) => s.name), bottom: 0 } : undefined };
  };
</script>

{#if option}
  <EChart {option} />
  {#if result?.executedAt}
    <p class="mdx-refresh-time">集計時刻: {fmtTime(result.executedAt)}</p>
  {/if}
{:else if result?.status === 'error'}
  <p class="text-danger">✘ {result.error}</p>
{:else if resultData}
  <p class="text-muted">{t('noColumnsForChart')}</p>
{:else}
  <div class="mdx-hydrate-box">{t('runQueryHint')}</div>
{/if}
