<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import jspreadsheet from 'jspreadsheet-ce';

  const dispatch = createEventDispatcher();

  export let csvData = '';
  export let readonly = false;

  let container;
  let workbook = null;
  let lastSerialized = '';
  let errorMsg = '';

  function parseRow(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { result.push(current); current = ''; }
        else { current += ch; }
      }
    }
    result.push(current.trim());
    return result;
  }

  function escapeCell(value) {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function parseCSV(csv) {
    const lines = csv.split('\n');
    const cleanLines = lines.map(l => l.replace(/\r$/, ''));
    if (cleanLines.length === 0 || (cleanLines.length === 1 && cleanLines[0] === '')) {
      return { headers: [], data: [] };
    }
    const headers = parseRow(cleanLines[0]);
    const data = cleanLines.slice(1).filter(l => l.trim() !== '').map(parseRow);
    return { headers, data };
  }

  function serializeCSV(headers, data) {
    const rows = [headers, ...data];
    return rows.map(row => row.map(escapeCell).join(',')).join('\n');
  }

  function getWorksheet() {
    return workbook && workbook.worksheets && workbook.worksheets[0];
  }

  function capHeight() {
    if (!container) return;
    const h = window.innerHeight - container.getBoundingClientRect().top - 8;
    if (h > 100) {
      container.style.maxHeight = Math.floor(h) + 'px';
    }
  }

  async function initSpreadsheet() {
    errorMsg = '';
    if (!container) {
      errorMsg = 'Container element not found';
      return;
    }
    if (workbook) {
      try { jspreadsheet.destroy(container); } catch (e) { /* ignore */ }
      workbook = null;
    }
    if (typeof jspreadsheet !== 'function') {
      errorMsg = 'Jspreadsheet is not available';
      return;
    }

    try {
      const { headers, data } = parseCSV(csvData);
      const columns = headers.map(h => ({ title: h, type: 'text', width: 120 }));

      const sheetOptions = {
        data,
        columns: columns.length > 0 ? columns : null,
        minDimensions: columns.length > 0
          ? [Math.max(columns.length, 2), Math.max(data.length + 2, 5)]
          : [5, 5],
        editable: !readonly,
      };

      if (!readonly) {
        sheetOptions.onchange = () => {
          try {
            const ws = getWorksheet();
            if (!ws) return;
            const cols = ws.getColumns().map(c => c.title || '');
            const dt = ws.getData();
            const csv = serializeCSV(cols, dt);
            if (csv !== lastSerialized) {
              lastSerialized = csv;
              dispatch('change', { value: csv });
            }
          } catch (e) {
            // ignore serialization errors during editing
          }
        };
      }

      workbook = await jspreadsheet(container, {
        worksheets: [sheetOptions],
      });
      lastSerialized = csvData;
      requestAnimationFrame(() => capHeight());
    } catch (e) {
      errorMsg = String(e.message || e);
    }
  }

  onMount(() => {
    initSpreadsheet();
  });

  onDestroy(() => {
    if (workbook) {
      try { jspreadsheet.destroy(container); } catch (e) { /* ignore */ }
      workbook = null;
    }
  });
</script>

<div class="spreadsheet-root">
  {#if errorMsg}
    <div class="spreadsheet-error">{errorMsg}</div>
  {/if}
  <div bind:this={container} class="spreadsheet-container"></div>
</div>

<style lang="scss">
  .spreadsheet-root {
    height: 100%;
    min-height: 300px;
  }
  .spreadsheet-container {
    width: 100%;
    height: 100%;
    overflow: auto;
  }
  .spreadsheet-container :global(.jss_container) {
    overflow: visible !important;
  }
  .spreadsheet-error {
    padding: 12px;
    color: #721c24;
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
    margin-bottom: 8px;
    font-size: 0.85rem;
    white-space: pre-wrap;
  }
</style>
