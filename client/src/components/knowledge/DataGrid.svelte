<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import jspreadsheet from 'jspreadsheet-ce';
  import { t } from '../../libs/i18n.js';

  export let ctx;
  export let data = '';    // クエリ名 or テーブルオブジェクト
  export let name = '';    // 指定すると編集結果を getGrid('名前') で読める
  export let types = '';   // 列型（カンマ区切り）: text/numeric/date/checkbox/...
  export let widths = '';  // 列幅 px（カンマ区切り）
  export let height = 300;
  export let readonly = false;
  export let value = null; // bind:value 用（編集後 { headers, rows }）
  export let onchange = null; // Svelte5 流儀のコールバック（{ value } を受ける）

  const dispatch = createEventDispatcher();
  const { results, setGrid } = ctx;

  let container;
  let workbook = null;
  let lastRef = null;
  let errorMsg = '';

  const normalize = (input) => {
    if (!input) return { headers: [], rows: [], colTypes: [] };
    if (Array.isArray(input)) {
      if (input.length && Array.isArray(input[0])) {
        const w = Math.max(...input.map((r) => r.length));
        const headers = Array.from({ length: w }, (_, i) => 'col' + (i + 1));
        return { headers, rows: input, colTypes: [] };
      }
      if (input.length && typeof input[0] === 'object') {
        const headers = Object.keys(input[0]);
        return { headers, rows: input.map((o) => headers.map((k) => o[k])), colTypes: [] };
      }
      return { headers: [], rows: [input], colTypes: [] };
    }
    if (input.columns && input.rows) {
      const headers = input.columns.map((c) => c.name);
      return {
        headers,
        rows: input.rows.map((r) => headers.map((h) => r[h])),
        colTypes: input.columns,
      };
    }
    if (input.headers && input.rows) {
      return { headers: input.headers, rows: input.rows, colTypes: input.colTypes || [] };
    }
    return { headers: [], rows: [], colTypes: [] };
  };

  const inferType = (colType, values) => {
    if (['number', 'integer', 'bigint', 'numeric'].includes(colType)) return 'numeric';
    if (['date', 'timestamp', 'timestamptz'].includes(colType)) return 'date';
    if (colType === 'boolean') return 'checkbox';
    const v = (values || []).find((x) => x !== null && x !== undefined && x !== '');
    if (typeof v === 'number') return 'numeric';
    if (v instanceof Date) return 'date';
    if (typeof v === 'boolean') return 'checkbox';
    return 'text';
  };

  const estimateWidth = (header) =>
    Math.max(80, Math.min(220, (String(header ?? '').length || 8) * 10 + 24));

  const buildColumns = (headers, colTypes, rows2d) => {
    const typeList = types ? types.split(',').map((s) => s.trim()) : [];
    const widthList = widths ? widths.split(',').map((s) => parseInt(s.trim(), 10)) : [];
    return headers.map((h, i) => ({
      title: h,
      type: typeList[i] || inferType(colTypes[i]?.type, rows2d.map((r) => r[i])),
      width: widthList[i] || estimateWidth(h),
    }));
  };

  const initGrid = async (input) => {
    if (!container) return;
    errorMsg = '';
    if (workbook) {
      try { jspreadsheet.destroy(container); } catch { /* ignore */ }
      workbook = null;
    }
    const { headers, rows, colTypes } = normalize(input);
    if (!headers.length && !rows.length) return;
    const columns = buildColumns(headers, colTypes, rows);
    const sheetOptions = {
      data: rows,
      columns,
      minDimensions: readonly ? undefined : [Math.max(columns.length, 2), Math.max(rows.length + 1, 5)],
      editable: !readonly,
      onchange: () => {
        try {
          const ws = workbook && workbook.worksheets && workbook.worksheets[0];
          if (!ws) return;
          const headers2 = ws.getColumns().map((c) => c.title || '');
          const rows2 = ws.getData();
          const v = { headers: headers2, rows: rows2 };
          if (name) setGrid(name, v);
          value = v;
          dispatch('change', { value: v });
          if (onchange) onchange(v);
        } catch { /* ignore serialization errors */ }
      },
    };
    try {
      workbook = await jspreadsheet(container, { worksheets: [sheetOptions] });
      // 初期値も getGrid で読めるようにしておく（編集後は onchange で更新）
      if (name) setGrid(name, { headers, rows });
    } catch (e) {
      errorMsg = String(e.message || e);
    }
  };

  $: source = typeof data === 'string' ? $results[data]?.data : (data ?? value);
  $: if (container && source && source !== lastRef) {
    lastRef = source;
    // 編集可能グリッドは一度初期化したらユーザー編集を保つ（再実行で上書きしない）
    if (!workbook || readonly) initGrid(source);
  }

  onDestroy(() => {
    if (workbook) {
      try { jspreadsheet.destroy(container); } catch { /* ignore */ }
      workbook = null;
    }
  });
</script>

{#if errorMsg}
  <div class="spreadsheet-error">{errorMsg}</div>
{:else if source}
  <div class="mdx-datagrid" style="height:{height}px">
    <div bind:this={container} class="mdx-datagrid-container"></div>
  </div>
{:else}
  <div class="mdx-hydrate-box">{t('runQueryHint')}</div>
{/if}

<style>
  .mdx-datagrid {
    width: 100%;
    margin: 12px 0;
    overflow: auto;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }
  .mdx-datagrid-container {
    height: 100%;
    overflow: auto;
  }
  .mdx-datagrid-container :global(.jss_container) {
    overflow: visible !important;
  }
  .spreadsheet-error {
    padding: 12px;
    color: #721c24;
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
    margin: 8px 0;
    font-size: 0.85rem;
    white-space: pre-wrap;
  }
</style>
