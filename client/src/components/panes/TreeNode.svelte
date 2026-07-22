<script>
  import { t } from '../../libs/i18n.js';
  export let node;
  export let selectedPath = null;
  export let children = [];
  export let tree = {};
  export let treeVersion = 0;
  export let onSelect = null;
  export let onNewFile = null;
  export let onDelete = null;
  export let onEdit = null;
  export let onCut = null;
  export let onPaste = null;
  export let onRestore = null;
  export let onMove = null;
  export let cutPath = null;
  export let onLoadChildren = null;
  export let onSelectFolder = null;
  let isTrash = false;
  let loadingChildren = false;
  let isOpen = false;
  let userToggled = false;

  const apiUrl = (path) => `/api/knowledge${path}`;

  let info = null;
  let hoverTimer;
  let showTooltip = false;
  let tooltipX = 0;
  let tooltipY = 0;
  let deleting = false;
  let ctxShow = false;
  let ctxX = 0;
  let ctxY = 0;

  $: isMd = /\.md$/i.test(node.path);
  $: isTrash = node.path.includes('/.trash/') || node.path.startsWith('.trash/');
  $: isCutPending = !!cutPath;
  $: if (!userToggled && selectedPath && node.type === 'directory' && (selectedPath.startsWith(node.path + '/') || selectedPath === node.path || selectedPath === node.path + '/')) {
    isOpen = true;
  }



  const doToggle = () => {
    if (node.type !== 'directory') return;
    userToggled = true;
    isOpen = !isOpen;
    if (isOpen && children.length === 0 && onLoadChildren) {
      loadingChildren = true;
      onLoadChildren(node.path).then(() => { loadingChildren = false; });
    }
  };

  const loadInfo = async () => {
    if (info) return;
    try {
      const res = await fetch(apiUrl(`/info?path=${encodeURIComponent(node.path)}`), { credentials: 'include' });
      if (!res.ok) return;
      info = await res.json();
    } catch {}
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString(navigator.language);
  };

  const doDelete = async () => {
    if (!confirm(t('confirmDeleteTrash', node.name))) return;
    deleting = true;
    try {
      const res = await fetch(apiUrl(`/raw/${node.path}`), {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDelete?.();
    } catch (e) {
      alert(t('deleteFailed', e.message));
    } finally {
      deleting = false;
    }
  };

  const onMouseEnter = (e) => {
    if (node.type !== 'file') return;
    clearTimeout(hoverTimer);
    tooltipX = e.clientX;
    tooltipY = e.clientY;
    hoverTimer = setTimeout(async () => {
      showTooltip = true;
      await loadInfo();
    }, 500);
  };

  const onMouseLeave = () => {
    clearTimeout(hoverTimer);
    showTooltip = false;
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctxX = e.clientX;
    ctxY = e.clientY;
    ctxShow = true;
  };

  const onDragStart = (e) => {
    if (node.type !== 'file') return;
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e) => {
    if (node.type !== 'directory') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDragEnter = (e) => {
    if (node.type !== 'directory') return;
    e.preventDefault();
  };

  const onDrop = (e) => {
    if (node.type !== 'directory') return;
    e.preventDefault();
    const fromPath = e.dataTransfer.getData('text/plain');
    if (!fromPath) return;
    onMove?.(fromPath, node.path);
  };

  const ctxMenuItems = () => {
    if (node.type === 'directory') {
      const items = [
        { label: t('open'), action: () => onSelectFolder?.(node.path) },
        { label: t('newFile'), action: () => onNewFile?.(node.path) },
        { label: t('newFolder'), action: () => { window.createFolderFromPath?.(node.path); } },
      ];
      if (isCutPending) {
        items.push({ label: t('paste'), action: () => onPaste?.(node.path) });
      }
      items.push({ label: t('delete'), action: doDelete, disabled: deleting });
      return items;
    }
    if (isTrash) {
      return [
        { label: t('undo'), action: () => onRestore?.(node.path) },
        { label: t('delete'), action: doDelete, disabled: deleting },
      ];
    }
    const items = [
      { label: t('edit'), action: () => onEdit?.(node.path) },
      { label: t('print'), action: () => { window.open('/' + node.path + '?mode=print', '_blank'); } },
      { label: t('download'), action: () => { window.open(apiUrl('/file/' + node.path + '?dl=1'), '_blank'); } },
      { label: t('cut'), action: () => onCut?.(node.path) },
      { label: t('delete'), action: doDelete, disabled: deleting },
    ];
    return items;
  };
</script>

<div class="tree-node"
  onmouseenter={onMouseEnter} onmouseleave={onMouseLeave} oncontextmenu={onContextMenu}>
  {#if node.type === 'directory'}
    <div class="tree-dir-row" class:drag-over={node.type === 'directory'}
      ondragover={onDragOver} ondragenter={onDragEnter} ondrop={onDrop}>
      <button class="tree-toggle-arrow" onclick={doToggle} disabled={loadingChildren} title={t('toggle')}>
        <span class="tree-arrow">{isOpen && children.length > 0 ? '▾' : '▸'}</span>
      </button>
      <a class="tree-toggle-folder" href="/{node.path}/" onclick={(e) => { e.preventDefault(); onSelectFolder?.(node.path); }}>
        <span class="tree-icon">📁</span>
        <span class="tree-label">{node.name}</span>
      </a>
    </div>
    {#if loadingChildren}
      <span class="tree-loading">...</span>
    {/if}
    {#if isOpen && children.length > 0}
      <div class="tree-children">
        {#each children as child}
          <svelte:self node={child} {selectedPath} children={tree[child.path] || []} {tree} {treeVersion}
            {onSelect} {onNewFile} {onDelete} {onEdit} {onCut} {onPaste} {onRestore} {onMove}
            {cutPath} {onLoadChildren} {onSelectFolder} />
        {/each}
      </div>
    {/if}
  {:else}
    <a
      class="tree-file"
      class:selected={node.path === selectedPath}
      href="/{node.path}"
      ondragstart={onDragStart}
      onclick={(e) => { e.preventDefault(); onSelect?.(node.path); }}
    >
      <span class="tree-icon">{isMd ? '📝' : '📄'}</span>
      <span class="tree-label">{node.name}</span>
    </a>
    {#if showTooltip && info}
      <div class="tree-tooltip" style="left: {tooltipX}px; top: {tooltipY}px;">
        {#if isMd && info.frontmatter && Object.keys(info.frontmatter).length > 0}
          <div class="tt-section">
            {#each Object.entries(info.frontmatter) as [key, val]}
              <div class="tt-row">
                <span class="tt-key">{key}</span>
                <span class="tt-val">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
              </div>
            {/each}
          </div>
        {/if}
        <div class="tt-section">
          <div class="tt-row"><span class="tt-key">name</span><span class="tt-val">{node.name}</span></div>
          <div class="tt-row"><span class="tt-key">size</span><span class="tt-val">{formatSize(info.size)}</span></div>
          <div class="tt-row"><span class="tt-key">modified</span><span class="tt-val">{formatTime(info.mtime)}</span></div>
          <div class="tt-row"><span class="tt-key">created</span><span class="tt-val">{formatTime(info.birthtime)}</span></div>
        </div>
      </div>
    {/if}
  {/if}
</div>

{#if ctxShow}
  <div class="ctx-backdrop" onclick={() => ctxShow = false} oncontextmenu={(e) => { e.preventDefault(); ctxShow = false; }}>
    <div class="ctx-menu" style="left: {ctxX}px; top: {ctxY}px;" onclick={(e) => e.stopPropagation()}>
      {#each ctxMenuItems() as item}
        <button class="ctx-item" onclick={() => { item.action(); ctxShow = false; }} disabled={item.disabled}>{item.label}</button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .tree-node {
    display: flex;
    flex-direction: column;
    padding-left: 0.8em;
  }
  .tree-dir-row {
    display: flex;
    align-items: center;
    gap: 0;
  }
  .tree-toggle-arrow {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 2px 2px;
    border: none;
    outline: none;
    background: transparent;
    cursor: pointer;
    border-radius: 3px 0 0 3px;
    font-size: inherit;
    color: inherit;
  }
  .tree-toggle-arrow:hover { background: #e0e0e0; }
  .tree-toggle-arrow:focus-visible { outline: 2px solid var(--bs-primary); outline-offset: -1px; }
  .tree-toggle-folder {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    text-align: left;
    padding: 2px 4px;
    border: none;
    outline: none;
    background: transparent;
    cursor: pointer;
    border-radius: 0 3px 3px 0;
    font-size: inherit;
    color: inherit;
    white-space: nowrap;
    overflow: hidden;
  }
  .tree-toggle-folder:hover { background: #f0f0f0; }
  .tree-file {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    text-align: left;
    padding: 2px 4px;
    border: none;
    outline: none;
    background: transparent;
    cursor: pointer;
    border-radius: 3px;
    font-size: inherit;
    color: inherit;
    white-space: nowrap;
    overflow: hidden;
  }
  .tree-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tree-file:hover { background: #f0f0f0; }
  .tree-file.selected { background: #cfe2ff; color: #0a58ca; font-weight: 600; }
  .tree-tooltip {
    position: fixed;
    z-index: 99999;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    padding: 8px 12px;
    font-size: 0.75rem;
    line-height: 1.5;
    min-width: 200px;
    max-width: 360px;
    pointer-events: none;
    transform: translate(12px, -50%);
  }
  .tt-section { margin-bottom: 4px; }
  .tt-section:last-child { margin-bottom: 0; }
  .tt-section + .tt-section { border-top: 1px solid #eee; padding-top: 4px; margin-top: 4px; }
  .tt-row { display: flex; gap: 8px; }
  .tt-key { font-weight: 600; color: #666; flex-shrink: 0; }
  .tt-val { color: #333; word-break: break-all; overflow: hidden; }
  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99998;
    background: transparent;
  }
  .ctx-menu {
    position: fixed;
    z-index: 99999;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    padding: 4px 0;
    min-width: 140px;
    font-size: 0.85rem;
  }
  .ctx-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 16px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: inherit;
    color: #333;
  }
  .ctx-item:hover { background: #f0f0f0; }
  .ctx-item:disabled { color: #ccc; cursor: default; }
  .drag-over { background: #e8f4fd; border-radius: 3px; }
</style>
