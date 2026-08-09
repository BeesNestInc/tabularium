<script>
  import { t } from '../../libs/i18n.js';

  export let data;
  export let pageSize = 100;

  const PAGE_SIZE = pageSize;
  let sortKey = null;
  let sortDir = 1;
  let page = 0;

  $: columns = data?.columns || [];
  $: rows = data?.rows || [];
  $: sorted = (() => {
    const r = rows.slice();
    if (sortKey) {
      r.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir;
      });
    }
    return r;
  })();
  $: totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  $: if (page > totalPages - 1) page = totalPages - 1;
  $: pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const setSort = (key) => {
    if (sortKey === key) sortDir *= -1;
    else { sortKey = key; sortDir = 1; }
  };

  const exportCsv = () => {
    if (!columns.length) return;
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [columns.map((c) => q(c.name)).join(',')];
    for (const row of sorted) {
      lines.push(columns.map((c) => q(row[c.name])).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'query-result.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
</script>

<div class="mdx-table-wrap">
  <div class="mdx-table-toolbar">
    <span class="sql-status">{sorted.length} rows</span>
    <button class="btn btn-sm btn-outline-secondary" onclick={exportCsv} disabled={!rows.length}>CSV</button>
  </div>
  {#if columns.length === 0}
    <p class="text-muted">{t('empty')}</p>
  {:else}
    <table class="table table-sm table-striped">
      <thead>
        <tr>
          {#each columns as col (col.name)}
            <th onclick={() => setSort(col.name)} role="button" class="mdx-sortable">
              {col.name}{sortKey === col.name ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each pageRows as row (row)}
          <tr>
            {#each columns as col}
              <td>{row[col.name] ?? ''}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if totalPages > 1}
      <div class="mdx-table-pager">
        <button class="btn btn-sm btn-outline-secondary" onclick={() => page--} disabled={page <= 0}>‹</button>
        <span class="sql-status">{page + 1} / {totalPages}</span>
        <button class="btn btn-sm btn-outline-secondary" onclick={() => page++} disabled={page >= totalPages - 1}>›</button>
      </div>
    {/if}
  {/if}
</div>
