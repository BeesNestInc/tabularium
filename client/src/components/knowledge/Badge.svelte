<script>
  // 独自コンポーネントの例: クエリ結果の先頭行の値を KPI カードとして表示する
  let { ctx, data = '', column = '', label = '', prefix = '', suffix = '', format = '' } = $props();

  const { results } = ctx;

  const result = $derived(data ? $results[data]?.data : null);
  const raw = $derived(result?.rows?.[0]?.[column]);
  const value = $derived(format === 'number' && typeof raw === 'number' ? raw.toLocaleString() : raw);
</script>

<div class="kpi-card">
  {#if label}<div class="kpi-label">{label}</div>{/if}
  <div class="kpi-value">{prefix}{value ?? ''}{suffix}</div>
  {#if result && result.rows.length === 0}
    <div class="kpi-empty">no data</div>
  {/if}
</div>

<style>
  .kpi-card {
    display: inline-block;
    margin: 8px 12px 8px 0;
    padding: 12px 20px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: linear-gradient(180deg, #fff, #f8fafc);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }
  .kpi-label {
    font-size: 0.75rem;
    color: #64748b;
    margin-bottom: 4px;
  }
  .kpi-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.2;
  }
  .kpi-empty { font-size: 0.75rem; color: #94a3b8; }
</style>
