<script>
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import { _link, currentPage as currentPageStore } from '../lib/router.js';
  import Spreadsheet from '../components/editor/Spreadsheet.svelte';
  import * as bmUi from '../libs/bookmarks-ui.js';
  import * as api from '../libs/knowledge-api.js';
  import { createMd } from '../libs/markdown-render.js';
  import { t } from '../libs/i18n.js';
  import { parseCsvRow, parseCsv, csvToHtml } from '../lib/csv.js';
  import { isImageExt, isTextExt, isCsvExt, isDrawioExt, isOfficeExt, isCalendarExt, getEditorLang } from '../lib/file-utils.js';
  import { fileTemplates } from '../lib/file-templates.js';
  import { fetchRoots, addRoot as apiAddRoot, deleteRoot as apiDeleteRoot } from '../lib/roots.js';
import { renderAll } from '../lib/mermaid.js';
import { resolve as resolveContentType } from '../lib/content-types/index.js';
import EditMode from '../components/knowledge/EditMode.svelte';
import TreeSidebar from '../components/knowledge/TreeSidebar.svelte';
import FullCalendarViewer from '../components/knowledge/FullCalendarViewer.svelte';
import CollaboraSettings from '../components/knowledge/CollaboraSettings.svelte';
  import yaml from 'yaml';

  let treeData = [];
  let selectedPath = null;
  let contentHtml = '';
  let drawioXml = '';
  let isDrawioEditing = false;
  let drawioSaving = false;
  let drawioSaveError = false;
  let drawioSaveMessage = '';
  let appConfig = null;
  const drawioUrl = (edit) => {
    const base = (appConfig && appConfig.drawio) || 'https://embed.diagrams.net';
    const sep = base.includes('?') ? '&' : '?';
    return base.replace(/\/?$/, '/') + sep + 'embed=1&proto=json' + (edit ? '&ui=min' : '&stealth=1');
  };
  let contentLoading = false;
  let isEditMode = false;
  let editorContent = '';
  let saving = false;
  let saveMessage = '';
  let editModeComponent;
  let showNewDialog = false;
  let newFileName = '';
  let newFileType = '.md';
  let creating = false;
  let csvContent = '';
  let csvDirty = false;
  let csvLoadKey = 0;
  let fvViewMode = 'list';
  let calendarRawContent = '';
  let calendarDirty = false;
  let calendarError = false;
  let showRootDialog = false;
  let showCoolDialog = false;
  let newRootName = '';
  let newRootPath = '';
  let rootManaging = false;
  let rootError = '';
  let roots = [];
  let bookmarks = [];
  let dragCounter = 0;
  let bookmarkPollTimer = null;

  const toggleFvView = () => {
    var sizes = ['list', 'thumb-sm', 'thumb-md', 'thumb-lg'];
    var idx = sizes.indexOf(fvViewMode);
    fvViewMode = sizes[(idx + 1) % sizes.length];
    var cur = selectedPath;
    if (cur && cur.endsWith('/')) loadDirectory(cur.replace(/\/$/, ''));
  };

  let coolConfig = null;
  const getCoolIframeUrl = (filePath) => {
    if (!coolConfig) return '';
    const w = coolConfig.wopiHost + '/wopi/files/' + filePath;
    return coolConfig.coolHost + coolConfig.coolBrowserPath + '?WOPISrc=' + encodeURIComponent(w) + '&access_token=dev';
  };

  let treeReload = 0;
  let editorLang = 'text';

  const createFile = async () => {
    const base = newFileName.trim();
    if (!base) return;
    const name = base.includes('.') ? base : base + newFileType;
    creating = true;
    try {
      const res = await fetch(apiUrl(`/create/${name}`), {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      showNewDialog = false;
      newFileName = '';
      treeReload++;
      if (isCalendarExt(name)) {
        const ext = Object.keys(fileTemplates).find(e => name.endsWith(e));
        const tpl = ext ? fileTemplates[ext]() : '';
        await fetch(apiUrl(`/raw/${name}`), {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: tpl }), credentials: 'include',
        });
        _link(`/${name}`, { replace: true });
      } else {
        _link(`/${name}?mode=edit`, { replace: true });
      }
    } catch (e) {
      alert(t('createFailed', e.message));
    } finally {
      creating = false;
    }
  };

  

  const printContent = () => {
    window.print();
  };

  const loadRoots = async () => {
    roots = await fetchRoots();
  };

  const addRoot = async () => {
    if (!newRootName.trim() || !newRootPath.trim()) return;
    rootManaging = true;
    rootError = '';
    try {
      roots = await apiAddRoot(newRootName.trim(), newRootPath.trim());
      newRootName = '';
      newRootPath = '';
      showRootDialog = false;
      treeReload++;
    } catch (e) {
      rootError = e.message;
    } finally {
      rootManaging = false;
    }
  };

  const deleteRoot = async (name) => {
    if (!confirm(t('confirmDeleteRoot', name))) return;
    try {
      roots = await apiDeleteRoot(name);
      treeReload++;
    } catch (e) {
      alert(t('deleteFailed', e.message));
    }
  };
  const apiUrl = (path) => `/api/knowledge${path}`;

  // コンテンツタイプ拡張については Docs/content-type-architecture.md 参照
  const loadContent = async (filePath) => {
    selectedPath = filePath;
    contentLoading = true;
    contentHtml = '';
    if (filePath && filePath.endsWith('/')) { contentLoading = false; return; }
    if (isDrawioExt(filePath)) {
      try {
        const raw = await api.fetchRaw(filePath);
        drawioXml = raw.content || fileTemplates['.drawio']();
        contentHtml = '<div class="drawio-placeholder">Loading diagram...</div>';
      } catch {
        contentHtml = '<div class="alert alert-danger">' + t('fileNotFound') + '</div>';
        drawioXml = '';
      }
    } else if (isCsvExt(filePath)) {
      try {
        const raw = await api.fetchRaw(filePath);
        csvContent = raw.content || '';
        csvDirty = false;
        contentHtml = csvToHtml(csvContent);
      } catch {
        contentHtml = '<div class="alert alert-danger">' + t('fileNotFound') + '</div>';
        csvContent = '';
      }
    } else if (isImageExt(filePath)) {
      contentHtml = `<img src="${api.fetchFile(filePath)}" style="max-width:100%" alt="${filePath}" />`;
    } else if (isCalendarExt(filePath)) {
      try {
        const raw = await api.fetchRaw(filePath);
        calendarRawContent = raw.content || '';
        calendarError = false;
        contentHtml = '';
      } catch {
        calendarRawContent = '';
        calendarError = true;
        contentHtml = '<div class="alert alert-danger">' + t('fileNotFound') + '</div>';
      }
    } else if (isTextExt(filePath)) {
      try {
        const raw = await api.fetchRaw(filePath);
        const escaped = (raw.content || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        contentHtml = '<pre style="white-space:pre-wrap;word-break:break-all;background:#f4f4f4;padding:12px;border-radius:4px;font-size:0.85em">' + escaped + '</pre>';
      } catch {
        contentHtml = '<div class="alert alert-danger">' + t('fileNotFound') + '</div>';
      }
    } else if (isOfficeExt(filePath)) {
      contentLoading = false;
      return;
    } else {
      const handler = resolveContentType(filePath);
      if (handler) {
        let html = await handler.load(filePath);
        const result = processEvidenceTags(html);
        contentHtml = result.html;
        evidenceCharts = result.charts;
        autoRunDone = false;
        queryResults = {};
      } else {
        contentHtml = '<p class="text-muted">' + t('noPreview') + '<br><a href="' + api.fetchFile(filePath) + '?dl=1" class="btn btn-sm btn-outline-secondary mt-2">' + t('download') + '</a></p>';
        evidenceCharts = [];
      }
    }
    contentLoading = false;
  };

  const selectFile = (filePath) => {
    _link(`/${filePath}`, { replace: true });
  };

  let unsubscribe = null;
  let prevFilePath = null;

  const loadRawContent = async (filePath) => {
    try {
      const data = await api.fetchRaw(filePath);
      editorContent = data.content || '';
      if (!editorContent) {
        const ext = Object.keys(fileTemplates).find((e) => filePath.endsWith(e));
        if (ext) editorContent = fileTemplates[ext]();
      }
      if (isCsvExt(filePath)) {
        csvLoadKey++;
      }
    } catch (e) {
      editorContent = `/* failed to load: ${e.message} */`;
    }
  };

  const saveContent = async () => {
    if (!selectedPath) return false;
    saving = true;
    saveMessage = '';
    try {
      const res = await fetch(apiUrl(`/raw/${selectedPath}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editorContent }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      saveMessage = t('saved');
      setTimeout(() => { saveMessage = ''; }, 3000);
      return true;
    } catch (e) {
      saveMessage = t('saveFailed', e.message);
      return false;
    } finally {
      saving = false;
    }
  };

  const saveCsvContent = async () => {
    if (!selectedPath) return;
    saving = true;
    saveMessage = '';
    try {
      const res = await fetch(apiUrl(`/raw/${selectedPath}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: csvContent }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      saveMessage = t('saved');
      csvDirty = false;
      setTimeout(() => { saveMessage = ''; }, 3000);
    } catch (e) {
      saveMessage = t('saveFailed', e.message);
    } finally {
      saving = false;
    }
  };

  const saveCalendarContent = async () => {
    if (!selectedPath) return;
    saving = true;
    saveMessage = '';
    try {
      const res = await fetch(apiUrl(`/raw/${selectedPath}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: calendarRawContent }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      saveMessage = t('saved');
      calendarDirty = false;
      setTimeout(() => { saveMessage = ''; }, 3000);
    } catch (e) {
      saveMessage = t('saveFailed', e.message);
    } finally {
      saving = false;
    }
  };

  const handleUrlChange = (url) => {
    const params = new URLSearchParams((url || '').split('?')[1] || '');
    const mode = params.get('mode');
    const viewParam = params.get('view');
    const sizeParam = params.get('size');

    let filePath = (url || '').startsWith('/')
      ? decodeURIComponent((url || '').slice('/'.length).split('?')[0])
      : null;

    // Empty path (root /) → clear state, show empty page
    if (filePath === '') {
      selectedPath = null;
      contentHtml = '';
      contentLoading = false;
      prevFilePath = null;
      isEditMode = false;
      bookmarks = [];
      return;
    }

    const prevEditMode = isEditMode;
    const editMode = mode === 'edit';
    if (filePath && isDrawioExt(filePath) && editMode) {
      isDrawioEditing = true;
      isEditMode = false;
    } else if (editMode !== isEditMode) {
      isEditMode = editMode;
    }

    // Directory URL → unified via page API
    if (filePath !== null && filePath.endsWith('/')) {
      var dir = filePath.replace(/\/$/, '');
      prevFilePath = filePath;
      loadDirectory(dir);
      return;
    }

    const fileChanged = filePath && filePath !== prevFilePath;
    const exitingEdit = prevEditMode && !editMode;
    if (fileChanged || exitingEdit) {
      prevFilePath = filePath;
      editorLang = getEditorLang(filePath);
      loadContent(filePath);
    } else if (!filePath) {
      prevFilePath = null;
    }

    if (filePath && editMode) {
      loadRawContent(filePath);
    }
  };

  let treeLoadedOnce = false;
  const onTreeLoaded = (e) => {
    const firstLoad = !treeLoadedOnce;
    treeLoadedOnce = true;
    treeData = e.detail.tree;
    // 初回ロード時は handleUrlChange が既に content を読んでいるのでスキップ
    if (firstLoad) return;
    // 削除・移動後のツリー再読込に対応: 現在のパスが有効か再確認
    if (selectedPath) {
      if (selectedPath.endsWith('/')) {
        loadDirectory(selectedPath.replace(/\/$/, ''));
      } else {
        loadContent(selectedPath);
      }
    }
  };

  const handleNavClick = (e) => {
    if (e.defaultPrevented) return;
    const a = e.target.closest('a');
    if (!a) return;
    if (a.hasAttribute('download') || a.getAttribute('rel') === 'external') return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (!href.startsWith('/') || href.startsWith('/api/')) return;
    e.preventDefault();
    _link(href);
  };

  let activeCharts = [];
  let queryResults = {};
  let evidenceCharts = [];

  const EVIDENCE_TAGS = ['LineChart', 'BarChart', 'AreaChart', 'ScatterPlot', 'PieChart', 'DataTable'];

  const processEvidenceTags = (html) => {
    const charts = [];
    const processed = html.replace(/<(LineChart|BarChart|AreaChart|ScatterPlot|PieChart|DataTable)\s+([\s\S]*?)\/>/g, (match, tagName, attrs) => {
      const config = { type: tagName };
      attrs.replace(/(\w+)=(\{[^}]+\}|[^\s/>]+)/g, (m, key, val) => {
        if (val.startsWith('{') && val.endsWith('}')) {
          const inner = val.slice(1, -1);
          if (key === 'data') config.queryName = inner;
          else config[key] = inner;
        } else {
          config[key] = val.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        }
      });
      if (!config.queryName) return match; // skip if no data reference
      const id = 'ev-' + Math.random().toString(36).slice(2, 8);
      config.id = id;
      charts.push(config);
      return `<div class="ev-chart-placeholder" data-ev-id="${id}" style="min-height:40px;padding:8px;margin:8px 0;border:1px dashed #ccc;border-radius:6px;color:#999;text-align:center;font-size:0.85em">${tagName} (data={${config.queryName}}) — ${t('runQueryHint')}</div>`;
    });
    return { html: processed, charts };
  };

  const getPageMeta = () => {
    const wrapper = document.querySelector('[data-page-meta]');
    if (!wrapper) return null;
    try { return JSON.parse(wrapper.dataset.pageMeta); } catch { return null; }
  };

  const renderEvidenceChart = (chartConfig, queryData) => {
    const placeholder = document.querySelector(`.ev-chart-placeholder[data-ev-id="${chartConfig.id}"]`);
    if (!placeholder) return;
    if (chartConfig.type === 'DataTable') {
      placeholder.innerHTML = renderSqlTable(queryData);
      return;
    }
    const id = chartConfig.id + '-chart';
    placeholder.innerHTML = `<div id="${id}" class="ev-chart-render" style="height:300px;width:100%"></div>`;
    const container = document.getElementById(id);
    if (!container) return;
    const echartOpt = buildEvidenceOption(chartConfig, queryData);
    if (!echartOpt) {
      container.innerHTML = '<p class="text-muted">' + t('noColumnsForChart') + '</p>';
      return;
    }
    import('echarts').then(({ init }) => {
      const chart = init(container);
      chart.setOption(echartOpt);
      activeCharts.push(chart);
      new ResizeObserver(() => chart.resize()).observe(container);
    });
  };

  const renderSqlTable = (data) => {
    if (!data.columns || data.columns.length === 0) return '<p class="text-muted">' + t('empty') + '</p>';
    let html = '<table class="table table-sm table-striped"><thead><tr>';
    html += data.columns.map(c => `<th>${c.name}</th>`).join('');
    html += '</tr></thead><tbody>';
    for (const row of data.rows) {
      html += '<tr>' + data.columns.map(c => '<td>' + (row[c.name] ?? '') + '</td>').join('') + '</tr>';
    }
    html += '</tbody></table>';
    return html;
  };

  const buildEvidenceOption = (cfg, data) => {
    const xCol = cfg.x || (data.columns.find(c => c.type === 'string' || c.type === 'varchar' || c.type === 'text')?.name);
    const yCol = cfg.y || data.columns.find(c => c.type === 'number' || c.type === 'integer' || c.type === 'bigint')?.name;
    if (!yCol) return null;
    const rows = data.rows;
    const base = {
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 20, bottom: 80, top: 40 },
      xAxis: xCol
        ? { type: 'category', data: rows.map(r => r[xCol]), axisLabel: { rotate: rows.length > 10 ? 45 : 0 } }
        : { type: 'category', data: rows.map((_, i) => '#' + (i + 1)) },
      yAxis: { type: 'value' },
    };
    const category = cfg.type;
    if (category === 'PieChart') {
      return {
        tooltip: { trigger: 'item', formatter: '{b}: {c}' },
        series: [{
          type: 'pie', radius: ['40%', '60%'],
          data: rows.map(r => ({ name: xCol ? r[xCol] : '', value: r[yCol] })),
          label: { formatter: '{b}: {c}' },
        }],
      };
    }
    if (category === 'DataTable') {
      return null; // handled separately
    }
    const chartTypeMap = { LineChart: 'line', BarChart: 'bar', AreaChart: 'line', ScatterPlot: 'scatter', PieChart: 'pie' };
    const chartType = chartTypeMap[category] || 'line';
    const isArea = category === 'AreaChart' || (cfg.fill === 'true');
    const series = [{ type: chartType, data: rows.map(r => r[yCol]), name: yCol, ...(isArea ? { areaStyle: {} } : {}) }];
    if (cfg.y2) {
      series.push({ type: chartType, data: rows.map(r => r[cfg.y2]), name: cfg.y2 });
    }
    return { ...base, series, legend: series.length > 1 ? { data: series.map(s => s.name), bottom: 0 } : undefined };
  };

  const executeSql = async (sql, queryName, resultDiv, statusEl, btn) => {
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    if (statusEl) statusEl.textContent = t('running');
    if (resultDiv) resultDiv.style.display = 'none';
    try {
      const meta = getPageMeta();
      const body = { language: meta?.engine || 'sql', code: sql };
      if (meta?.databases) body.attach = meta.databases;
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      queryResults[queryName] = data;
      if (statusEl) statusEl.textContent = `✔ ${data.rowCount} rows (${data.duration}ms)`;
      if (resultDiv) {
        renderSqlResult(resultDiv, data);
        resultDiv.style.display = 'block';
      }
      evidenceCharts.filter(c => c.queryName === queryName).forEach(c => renderEvidenceChart(c, data));
    } catch (err) {
      if (statusEl) statusEl.textContent = '✘ ' + err.message;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '▶ Run'; }
    }
  };

  const handleSqlRunClick = async (e) => {
    const btn = e.target.closest('.sql-run-btn');
    if (!btn) return;
    const sqlId = btn.dataset.sqlId;
    if (!sqlId) return;
    const block = document.querySelector(`.sql-block[data-sql-id="${sqlId}"]`);
    if (!block) return;
    const pre = block.querySelector('pre.language-sql');
    if (!pre) return;
    const sql = pre.dataset.sql;
    const queryName = pre.dataset.queryName || '';
    const resultDiv = block.querySelector('.sql-result');
    const statusEl = block.querySelector('.sql-status');
    if (!resultDiv) return;
    await executeSql(sql, queryName, resultDiv, statusEl, btn);
  };

  const renderSqlResult = (container, data) => {
    if (!data.columns || data.columns.length === 0) {
      container.innerHTML = '<p class="text-muted">' + t('noResults') + '</p>';
      return;
    }
    const id = 'sql-result-' + Math.random().toString(36).slice(2, 8);
    let html = '<div class="sql-result-tabs"><button class="sql-tab-btn active" data-tab="' + id + '-table">' + t('table') + '</button>';
    html += '<button class="sql-tab-btn" data-tab="' + id + '-chart">' + t('chart') + '</button></div>';
    html += '<div id="' + id + '-table" class="sql-tab-content">' + renderSqlTable(data) + '</div>';
    html += '<div id="' + id + '-chart" class="sql-tab-content sql-chart-container" style="display:none"></div>';
    container.innerHTML = html;
    // tab switching
    container.querySelectorAll('.sql-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.sql-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        container.querySelectorAll('.sql-tab-content').forEach(c => c.style.display = 'none');
        const tab = document.getElementById(btn.dataset.tab);
        if (tab) tab.style.display = 'block';
        if (btn.dataset.tab.endsWith('-chart') && tab && !tab.dataset.chartInited) {
          tab.dataset.chartInited = '1';
          initChart(tab, data);
        }
      });
    });
  };

  const initChart = async (container, data) => {
    const numericCols = data.columns.filter(c => c.type === 'number' || c.type === 'bigint' || c.type === 'integer');
    const stringCols = data.columns.filter(c => c.type === 'string' || c.type === 'varchar');
    if (numericCols.length === 0 || data.rows.length === 0) {
      container.innerHTML = '<p class="text-muted">' + t('noNumericColumns') + '</p>';
      return;
    }
    const xCol = stringCols.length > 0 ? stringCols[0].name : null;
    const yCols = numericCols.slice(0, 3);
    const isBar = xCol !== null && data.rows.length <= 30;
    const option = {
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 20, bottom: 80, top: 40 },
      xAxis: xCol ? {
        type: 'category',
        data: data.rows.map(r => r[xCol]),
        axisLabel: { rotate: data.rows.length > 10 ? 45 : 0, fontSize: 11 },
      } : {
        type: 'category',
        data: data.rows.map((_, i) => '#' + (i + 1)),
      },
      yAxis: { type: 'value' },
      series: yCols.map((col, i) => ({
        name: col.name,
        type: isBar ? 'bar' : 'line',
        data: data.rows.map(r => r[col.name]),
      })),
      legend: yCols.length > 1 ? { data: yCols.map(c => c.name), bottom: 0 } : undefined,
    };
    try {
      const { init } = await import('echarts');
      const chart = init(container);
      chart.setOption(option);
      activeCharts.push(chart);
      const ro = new ResizeObserver(() => chart.resize());
      ro.observe(container);
    } catch {
      container.innerHTML = '<p class="text-muted">' + t('chartInitFailed') + '</p>';
    }
  };

  let mermaidReady = false;

  const sendDrawioXml = (iframe) => {
    if (!iframe || !drawioXml) return;
    iframe.contentWindow.postMessage(JSON.stringify({ action: 'load', xml: drawioXml }), '*');
  };

  const saveDrawio = async () => {
    const iframe = document.querySelector('.drawio-frame');
    if (!iframe || !selectedPath) return;
    drawioSaving = true;
    drawioSaveError = false; drawioSaveMessage = '';
    iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'xml' }), '*');
  };

  const handleDrawioMessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (!msg) return;
    console.log('drawio message:', msg);
    if (msg.event === 'init') {
      console.log('drawio init, sending xml (length=' + drawioXml.length + ')');
      const iframe = document.querySelector('.drawio-frame');
      sendDrawioXml(iframe);
    } else if (msg.event === 'exit') {
      if (msg.modified) {
        // 編集内容がある場合、自動保存するか確認
        if (confirm(t('confirmSaveDiagram'))) {
          saveDrawioXml(msg.xml);
        } else {
          isDrawioEditing = false;
        }
      } else {
        isDrawioEditing = false;
      }
    } else if (msg.event === 'save' && msg.xml) {
      saveDrawioXml(msg.xml, false);
    } else if (msg.event === 'export') {
      if (msg.xml) saveDrawioXml(msg.xml, true);
      if (msg.data) saveDrawioSvg(msg.data);
    }
  };

  const exportDrawioSvg = () => {
    const iframe = document.querySelector('.drawio-frame');
    if (!iframe) return;
    drawioSaving = true;
    drawioSaveError = false; drawioSaveMessage = '';
    iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'svg' }), '*');
  };

  const saveDrawioSvg = async (svgData) => {
    if (!selectedPath) return;
    const svgPath = selectedPath.replace(/\.drawio$/i, '.svg');
    let xml = svgData;
    const b64match = svgData.match(/^data:image\/svg\+xml;base64,(.+)$/);
    if (b64match) {
      try {
        // atob は Latin-1 扱いなので UTF-8 の日本語が壊れる。TextDecoder で正しくデコード
        const bin = atob(b64match[1]);
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        xml = new TextDecoder('utf-8').decode(bytes);
      } catch {
        drawioSaving = false;
        drawioSaveError = true; drawioSaveMessage = t('svgDecodeFailed');
        return;
      }
    }
    // 日本語フォントのフォールバックを追加
    xml = xml.replace(/(font-family=")([^"]*)(")/g, '$1$2, \'Hiragino Sans\', \'Noto Sans JP\', \'IPAex Gothic\', sans-serif$3');
    try {
      const res = await fetch(apiUrl(`/raw/${svgPath}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: xml }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      drawioSaving = false;
      drawioSaveError = false; drawioSaveMessage = t('svgSaved', svgPath);
      setTimeout(() => { drawioSaveMessage = ''; drawioSaveError = false; }, 5000);
      loadTree();
    } catch (err) {
      drawioSaving = false;
      drawioSaveError = true; drawioSaveMessage = t('svgSaveFailed', err.message);
    }
  };

  const saveDrawioXml = async (xml, exitAfterSave = false) => {
    if (!selectedPath) return;
    try {
      const res = await fetch(apiUrl(`/raw/${selectedPath}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: xml }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      drawioXml = xml;
      if (exitAfterSave) isDrawioEditing = false;
      drawioSaving = false;
      drawioSaveError = false; drawioSaveMessage = t('saved');
      setTimeout(() => { drawioSaveMessage = ''; drawioSaveError = false; }, 3000);
    } catch (err) {
      drawioSaving = false;
      drawioSaveError = true; drawioSaveMessage = t('saveFailed', err.message);
    }
  };

  const loadMermaid = () => {
    if (typeof mermaid !== 'undefined') { mermaidReady = true; return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.6.0/mermaid.min.js';
    s.onload = () => {
      mermaidReady = true;
      mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
      const target = document.querySelector('.markdown-body') || document.querySelector('.contents.markdown.document');
      if (target) renderAll(target);
    };
    document.head.appendChild(s);
  };

  // --- Bookmarks ---
  // Prevent browser navigation on URL drops anywhere in the page
  if (typeof document !== 'undefined') {
    document.addEventListener('dragover', function(e) { e.preventDefault(); });
    document.addEventListener('drop', function(e) { e.preventDefault(); });
  }

  // Global handlers for inline onclick in generated HTML
  const registerBmGlobals = () => {
    window.selectFolder = async (path) => {
      _link(path ? '/' + path + '/' : '/');
    };
    window.selectTreeFile = (path) => {
      _link(path ? '/' + path : '/');
    };
    window.showBookmarkAddDialog = (url) => {
      var fp = selectedPath ? selectedPath.replace(/\/$/, '') : '';
      if (!fp) return;
      var u = url || prompt('URL:');
      if (!u) return;
      api.fetchPageTitle(u).then(function(data) {
        var pTitle = prompt(t('titlePrompt'), data.title || u);
        if (!pTitle) return;
        api.bookmarkAdd(fp, pTitle, u).then(function() {
          loadDirectory(fp);
        }).catch(function(e) { alert(t('addFailed', e.message)); });
      }).catch(function() {
        var pTitle = prompt(t('titlePrompt'), u);
        if (!pTitle) return;
        api.bookmarkAdd(fp, pTitle, u).then(function() {
          loadDirectory(fp);
        }).catch(function(e) { alert(t('addFailed', e.message)); });
      });
    };
    window.deleteBookmark = (idx) => {
      var bm = bookmarks[idx];
      if (!bm) return;
      var fp = selectedPath ? selectedPath.replace(/\/$/, '') : '';
      if (!fp) return;
      api.bookmarkDelete(fp, bm.url).then(function() {
        loadDirectory(fp);
      }).catch(function(e) { alert(t('deleteFailed', e.message)); });
    };
    window.editBookmark = (idx) => {
      var bm = bookmarks[idx];
      if (!bm) return;
      var fp = selectedPath ? selectedPath.replace(/\/$/, '') : '';
      if (!fp) return;
      var newTitle = prompt(t('titlePrompt'), bm.title);
      if (!newTitle) return;
      var newUrl = prompt('URL:', bm.url);
      if (!newUrl) return;
      api.bookmarkEdit(fp, bm.url, newTitle, newUrl).then(function() {
        loadDirectory(fp);
      }).catch(function(e) { alert(t('updateFailed', e.message)); });
    };
    window.createFolderFromPath = async (dirPath) => {
      var fp = dirPath || (selectedPath ? selectedPath.replace(/\/$/, '') : '');
      if (!fp) return;
      var name = prompt(t('folderNamePrompt'));
      if (!name) return;
      if (name.includes('/') || name.includes('\\')) { alert(t('invalidFolderName')); return; }
      try {
        var res = await fetch(apiUrl('/mkdir/' + fp + '/' + name), { method: 'POST', credentials: 'include' });
        if (!res.ok) { var d = await res.json(); throw new Error(d.error || 'HTTP ' + res.status); }
        treeReload++;
        var cur = selectedPath ? selectedPath.replace(/\/$/, '') : '';
        if (cur && (cur === fp || cur.startsWith(fp + '/'))) loadDirectory(cur);
      } catch (e) { alert(t('createFailed', e.message)); }
    };
    window.createFolder = async () => window.createFolderFromPath(selectedPath ? selectedPath.replace(/\/$/, '') : '');
    window.deleteEntry = async (path) => {
      if (!confirm(t('confirmDeleteNamed', path.split('/').pop()))) return;
      try {
        var res = await fetch(apiUrl('/raw/' + path), { method: 'DELETE', credentials: 'include' });
        if (!res.ok) { var d = await res.json(); throw new Error(d.error || 'HTTP ' + res.status); }
        var fp = selectedPath ? selectedPath.replace(/\/$/, '') : '';
        if (fp) loadDirectory(fp);
      } catch (e) { alert(t('deleteFailed', e.message)); }
    };
    // File info tooltip for entry list
    var tooltipTimer = null;
    window.showFileInfo = function(e, path) {
      var tip = document.getElementById('bmTooltip');
      if (!tip) return;
      tip.style.left = e.clientX + 'px';
      tip.style.top = e.clientY + 'px';
      tip.innerHTML = t('loading');
      tip.classList.remove('hidden');
      clearTimeout(tooltipTimer);
      tooltipTimer = setTimeout(function() {
        api.fetchInfo(path)
          .then(function(info) {
            if (!info) return;
            var html = '';
            if (info.frontmatter && Object.keys(info.frontmatter).length > 0) {
              html += '<div class="bm-tt-section">';
              Object.entries(info.frontmatter).forEach(function(kv) {
                html += '<div class="bm-tt-row"><span class="bm-tt-key">' + escapeHtml(kv[0]) + '</span><span class="bm-tt-val">' + (typeof kv[1] === 'object' ? escapeHtml(JSON.stringify(kv[1])) : escapeHtml(String(kv[1]))) + '</span></div>';
              });
              html += '</div>';
            }
            var fn = path.split('/').pop();
            html += '<div class="bm-tt-section"><div class="bm-tt-row"><span class="bm-tt-key">name</span><span class="bm-tt-val">' + escapeHtml(fn) + '</span></div>';
            html += '<div class="bm-tt-row"><span class="bm-tt-key">size</span><span class="bm-tt-val">' + (info.size > 1048576 ? (info.size / 1048576).toFixed(1) + ' MB' : info.size > 1024 ? (info.size / 1024).toFixed(1) + ' KB' : info.size + ' B') + '</span></div>';
            if (info.mtime) html += '<div class="bm-tt-row"><span class="bm-tt-key">modified</span><span class="bm-tt-val">' + new Date(info.mtime).toLocaleString('ja-JP') + '</span></div>';
            if (info.birthtime) html += '<div class="bm-tt-row"><span class="bm-tt-key">created</span><span class="bm-tt-val">' + new Date(info.birthtime).toLocaleString('ja-JP') + '</span></div>';
            html += '</div>';
            tip.innerHTML = html;
            // Reposition in case tooltip goes off-screen
            var r = tip.getBoundingClientRect();
            if (r.right > window.innerWidth) tip.style.left = (e.clientX - r.width - 20) + 'px';
          }).catch(function() { tip.classList.add('hidden'); });
      }, 500);
    };
    window.hideFileInfo = function() {
      clearTimeout(tooltipTimer);
      var tip = document.getElementById('bmTooltip');
      if (tip) tip.classList.add('hidden');
    };
  };

  // Unified DnD handler — called from template, no inline spaghetti
  const handleDrop = (e) => {
    e.preventDefault();
    dragCounter = 0;
    e.currentTarget.classList.remove('bm-dragover');
    if (!selectedPath || !selectedPath.endsWith('/')) return;
    var dt = e.dataTransfer;
    // Try text/x-moz-url (URL + title), then text/uri-list, then text/plain
    var raw = dt.getData('text/x-moz-url') || dt.getData('text/uri-list') || dt.getData('text/plain') || '';
    var url = raw.split('\n')[0].split('\r')[0].trim();
    // fallback: extract href from html
    if (!url) {
      var html = dt.getData('text/html') || '';
      var m = html.match(/href="([^"]+)"/);
      if (m) url = m[1];
    }
    if (!url) return;
    // ensure protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    var clean = url;
    if (clean.startsWith('<') && clean.endsWith('>')) clean = clean.slice(1, -1);
    var dir = selectedPath.replace(/\/$/, '');
    var doAdd = function(title, u) {
      api.bookmarkAdd(dir, title, u).then(function() {
        loadDirectory(dir);
      }).catch(function(e) { alert(t('addFailed', e.message)); });
    };
    api.fetchPageTitle(clean)
      .then(function(data) {
        var pTitle = prompt(t('titlePrompt'), data.title || clean);
        if (!pTitle) return;
        doAdd(pTitle, clean);
      }).catch(function() {
        var pTitle = prompt(t('titlePrompt'), clean);
        if (!pTitle) return;
        doAdd(pTitle, clean);
      });
  };

  let _md;
  const getMd = () => {
    if (!_md) _md = createMd({ useAnchor: true });
    return _md;
  };

  const loadDirectory = async (folderPath) => {
    if (folderPath === null || folderPath === undefined) return;
    contentLoading = true;
    contentHtml = '';
    selectedPath = (folderPath || '') + '/';
    try {
      const [pageData, bmData] = await Promise.all([
        api.fetchPage(folderPath),
        api.fetchBookmarks(folderPath).catch(() => ({ bookmarks: [] })),
      ]);
      bookmarks = bmData.bookmarks || [];
      let html = '';
      if (pageData.index) {
        const raw = pageData.index.raw.replace(/^---[\s\S]*?\n---\n?/, '');
        html = getMd().render(raw);
        const result = processEvidenceTags(html);
        html = result.html;
        evidenceCharts = result.charts;
        autoRunDone = false;
        queryResults = {};
      } else {
        evidenceCharts = [];
      }
      const folderHtml = bmUi.folderViewHtml(folderPath, pageData.entries || [], bookmarks, fvViewMode, true);
      contentHtml = html + folderHtml;
      // poll for pending thumbnails
      if (bookmarks.some(b => b.url && !b.thumb)) {
        clearTimeout(bookmarkPollTimer);
        bookmarkPollTimer = setTimeout(() => loadDirectory(folderPath), 3000);
      }
    } catch (e) {
      console.error('loadDirectory error:', e);
      contentHtml = `<div class="alert alert-danger">${t('directoryNotFound', folderPath)}</div>`;
    }
    contentLoading = false;
  };

  onMount(() => {
    registerBmGlobals();
    loadMermaid();
    fetch('/api/collabora/config').then(r => r.json()).then(c => coolConfig = c).catch(() => {});
    fetch('/api/config').then(r => r.json()).then(c => appConfig = c).catch(() => {});
    loadRoots().then(() => {
      const urlPath = window.location.pathname + window.location.search;
      handleUrlChange(urlPath);
    });
    unsubscribe = currentPageStore.subscribe((url) => {
      handleUrlChange(url);
    });
    window.addEventListener('message', handleDrawioMessage);
    document.addEventListener('click', handleNavClick);
    document.addEventListener('click', handleSqlRunClick);
  });

  let autoRunDone = false;

  afterUpdate(() => {
    const target = document.querySelector('.markdown-body') || document.querySelector('.contents.markdown.document');
    if (!target) return;
    if (mermaidReady && target.querySelector('pre.language-mermaid')) renderAll(target);
    // auto-execute queries referenced by Evidence charts
    if (!autoRunDone && evidenceCharts.length > 0) {
      autoRunDone = true;
      evidenceCharts.forEach(cfg => {
        const pre = target.querySelector(`pre.language-sql[data-query-name="${cfg.queryName}"]`);
        if (pre) {
          const sql = pre.dataset.sql;
          const queryName = pre.dataset.queryName || '';
          const block = pre.closest('.sql-block');
          const resultDiv = block?.querySelector('.sql-result') || null;
          const statusEl = block?.querySelector('.sql-status') || null;
          executeSql(sql, queryName, resultDiv, statusEl, null);
        }
      });
    }
  });

  onDestroy(() => {
    window.removeEventListener('message', handleDrawioMessage);
    document.removeEventListener('click', handleNavClick);
    document.removeEventListener('click', handleSqlRunClick);
    if (unsubscribe) unsubscribe();
    activeCharts.forEach(chart => chart.dispose());
    activeCharts = [];
    if (typeof window.hideFileInfo === 'function') window.hideFileInfo();
  });
</script>

{#if isEditMode}
  <EditMode {selectedPath} {editorContent} {editorLang} {saving} {saveMessage} {csvLoadKey}
    on:save={saveContent}
    on:saveAndExit={async () => { const ok = await saveContent(); if (ok) _link('/' + selectedPath, { replace: true }); }}
    on:editorChange={(e) => { editorContent = e.detail.value; }}
    on:csvChange={(e) => { editorContent = e.detail.value; }} />
{:else}
  <div class="knowledge-layout">
    <TreeSidebar {selectedPath} reload={treeReload}
      on:treeLoaded={onTreeLoaded}
      on:select={(e) => selectFile(e.detail.path)}
      on:edit={(e) => _link('/' + e.detail.path + '?mode=edit', { replace: true })}
      on:newFile={(e) => { newFileName = e.detail.path ? e.detail.path + '/' : ''; showNewDialog = true; }}
      on:selectFolder={(e) => _link(e.detail.path ? '/' + e.detail.path + '/' : '/')}
      on:openNewDialog={() => { newFileName = ''; showNewDialog = true; }}
      on:openRootDialog={() => { showRootDialog = true; }} />

    <main class="knowledge-content-pane"
      ondragenter={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dragCounter++; if (selectedPath !== null && (selectedPath === '' || selectedPath.endsWith('/'))) e.currentTarget.classList.add('bm-dragover'); }}
      ondragleave={(e) => { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; e.currentTarget.classList.remove('bm-dragover'); } }}
      ondragover={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      ondrop={handleDrop}>
      <div class="pane-header">
        <span>/{selectedPath || ''}</span>
        {#if selectedPath !== null && (contentHtml || isOfficeExt(selectedPath))}
          <div class="header-buttons">
            {#if !window.location.pathname.endsWith('/')}
              <a class="btn btn-sm btn-outline-secondary" href="/api/knowledge/file/{selectedPath}?dl=1" download>{t('download')}</a>
              {#if isDrawioExt(selectedPath)}
                {#if isDrawioEditing}
                  <button class="btn btn-sm btn-primary" onclick={saveDrawio} disabled={drawioSaving}>{drawioSaving ? t('saving') : t('save')}</button>
                  <button class="btn btn-sm btn-outline-secondary" onclick={() => { isDrawioEditing = false; }}>{t('cancel')}</button>
                {:else}
                  <button class="btn btn-sm btn-outline-secondary" onclick={exportDrawioSvg} disabled={drawioSaving}>{drawioSaving ? t('exporting') : t('exportSvg')}</button>
                  <button class="btn btn-sm btn-outline-secondary" onclick={() => { isDrawioEditing = true; }}>{t('edit')}</button>
                {/if}
              {:else if !isCsvExt(selectedPath) && !isOfficeExt(selectedPath)}
                <button class="btn btn-sm btn-outline-secondary" onclick={() => _link('/' + selectedPath + '?mode=edit', { replace: true })}>{t('edit')}</button>
              {/if}
            {/if}
            <button class="btn btn-sm btn-outline-secondary" onclick={printContent}>{t('print')}</button>
            <button class="btn btn-sm btn-outline-secondary" onclick={toggleFvView}>{fvViewMode === 'thumb-lg' ? '☰' : '⊞'}</button>
            <button class="btn btn-sm btn-outline-secondary" onclick={() => showCoolDialog = true} title="Collabora">{t('設定')}</button>
          </div>
        {/if}
      </div>
      {#if isCsvExt(selectedPath) && selectedPath}
        <div class="csv-edit-bar">
          {#if saveMessage}
            <span class="csv-edit-message" class:error={saveMessage.includes('失敗')}>{saveMessage}</span>
          {/if}
          <div class="csv-edit-actions">
            <button class="btn btn-sm btn-primary" onclick={saveCsvContent} disabled={saving}>{saving ? t('saving') : t('save')}</button>
          </div>
        </div>
      {/if}
      {#if isCalendarExt(selectedPath) && selectedPath}
        <div class="csv-edit-bar">
          {#if saveMessage}
            <span class="csv-edit-message" class:error={saveMessage.includes('失敗')}>{saveMessage}</span>
          {/if}
          <div class="csv-edit-actions">
            <button class="btn btn-sm btn-primary" onclick={saveCalendarContent} disabled={saving}>{saving ? t('saving') : t('save')}</button>
          </div>
        </div>
      {/if}
      <div class="pane-body">
        {#if contentLoading}
          <div class="text-muted">{t('loading')}</div>
        {:else if selectedPath === null}
          <div class="text-muted">{t('selectFile')}</div>
        {:else if isCsvExt(selectedPath)}
          <Spreadsheet csvData={csvContent} on:change={(e) => { csvContent = e.detail.value; csvDirty = true; }} readonly={false} />
        {:else if isDrawioExt(selectedPath)}
          <div class="drawio-container">
            {#if drawioSaveMessage}
              <div class="drawio-save-msg" class:error={drawioSaveError}>{drawioSaveMessage}</div>
            {/if}
            <iframe src={isDrawioEditing ? drawioUrl(true) : drawioUrl(false)} class="drawio-frame" title="draw.io diagram" frameborder="0"></iframe>
          </div>
        {:else if isCalendarExt(selectedPath) && !calendarError}
          <FullCalendarViewer rawContent={calendarRawContent} filePath={selectedPath} on:change={(e) => { calendarRawContent = e.detail.value; calendarDirty = true; }} />
        {:else if isOfficeExt(selectedPath)}
          <div class="cool-doc-container">
            <iframe src={getCoolIframeUrl(selectedPath)} class="cool-iframe" allowfullscreen></iframe>
          </div>
        {:else}
          <div class="markdown-body markdown document">
            {@html contentHtml}
          </div>
        {/if}
      </div>
    </main>
  </div>
{/if}

{#if showNewDialog}
  <div class="modal-overlay" onclick={() => { showNewDialog = false; newFileName = ''; }}>
    <div class="modal-dialog-sm" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">{t('createNewFile')}</div>
      <div class="modal-body">
        <div class="modal-path">{newFileName || t('root')}</div>
        <input class="form-control" placeholder={t('filename')} bind:value={newFileName} onkeydown={(e) => e.key === 'Enter' && createFile()} disabled={creating} autofocus />
        <div class="file-type-select">
          {#each [
            { ext: '.md', label: 'Markdown' },
            { ext: '.ical', label: t('calendar') },
            { ext: '.mycal', label: t('calendarList') },
            { ext: '.drawio', label: t('diagramDrawio') },
            { ext: '.mmd', label: t('diagramMermaid') },
            { ext: '.csv', label: 'CSV' },
          ] as ft}
            <button class="ft-btn" class:selected={newFileType === ft.ext}
              onclick={() => newFileType = ft.ext}>{ft.label}</button>
          {/each}
        </div>
        <div class="text-muted small" style="margin-top:4px">
          {t('filenameAutoExt')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm btn-primary" onclick={createFile} disabled={creating || !newFileName.trim()}>{creating ? t('creating') : t('create')}</button>
        <button class="btn btn-sm btn-outline-secondary" onclick={() => { showNewDialog = false; newFileName = ''; }}>{t('cancel')}</button>
      </div>
    </div>
  </div>
{/if}

{#if showRootDialog}
  <div class="modal-overlay" onclick={() => { showRootDialog = false; newRootName = ''; newRootPath = ''; rootError = ''; }}>
    <div class="modal-dialog-sm" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">{t('rootSettings')}</div>
      <div class="modal-body">
        {#if roots.length > 0}
          <div class="mb-2">
            {#each roots as root}
              <div class="root-item">
                <span class="root-item-name">{root.name}</span>
                <span class="root-item-path">{root.path}</span>
                <span class="root-item-status" class:accessible={root.accessible} class:inaccessible={!root.accessible}>{root.accessible ? 'OK' : 'NG'}</span>
                <button class="btn btn-sm btn-outline-danger" onclick={() => deleteRoot(root.name)}>{t('delete')}</button>
              </div>
            {/each}
          </div>
          <hr>
        {/if}
        <input class="form-control mb-1" placeholder={t('rootNameHint')} bind:value={newRootName} disabled={rootManaging} />
        <input class="form-control mb-1" placeholder={t('rootPathHint')} bind:value={newRootPath} disabled={rootManaging} />
        {#if rootError}
          <div class="text-danger small">{rootError}</div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm btn-primary" onclick={addRoot} disabled={rootManaging || !newRootName.trim() || !newRootPath.trim()}>{rootManaging ? t('adding') : t('add')}</button>
        <button class="btn btn-sm btn-outline-secondary" onclick={() => { showRootDialog = false; newRootName = ''; newRootPath = ''; rootError = ''; }}>{t('close')}</button>
      </div>
    </div>
  </div>
{/if}

<CollaboraSettings bind:show={showCoolDialog} />

<div id="bmTooltip" class="bm-tooltip hidden"></div>

<style lang="scss">
  :global {
    @import '../styles/markdown-content.scss';
    @import '../styles/knowledge.scss';
  }
</style>
