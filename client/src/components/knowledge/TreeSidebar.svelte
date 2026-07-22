<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import TreeNode from '../panes/TreeNode.svelte';
  import { t } from '../../libs/i18n.js';

  export let selectedPath = null;
  export let reload = 0;

  const dispatch = createEventDispatcher();

  let tree = {};
  let loading = false;
  let error = '';
  let showHidden = false;
  let cutPath = null;

  const apiUrl = (path) => `/api/knowledge${path}`;

  const fetchChildren = async (dirPath) => {
    try {
      const res = await fetch(`/api/knowledge?path=${encodeURIComponent(dirPath)}&showHidden=${showHidden}`, { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.children || [];
    } catch { return []; }
  };

  const loadChildren = async (dirPath) => {
    const children = await fetchChildren(dirPath);
    updateTree(t => ({ ...t, [dirPath]: children }));
    return children;
  };

  const loadTree = async () => {
    loading = true;
    error = '';
    prevExpandPath = null;
    try {
      const res = await fetch(`/api/knowledge?path=&showHidden=${showHidden}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const root = data.children || [];
      dispatch('treeLoaded', { tree: root });
      updateTree(t => ({ ...t, '': root }));
    } catch (e) {
      error = e.message;
      tree = {};
      treeVersion++;
    } finally {
      loading = false;
    }
  };

  // 指定されたファイル/フォルダの全親 + 自身の子を一括ロードする。
  // dirsに自身を含めないと、開いたフォルダの子が空のまま「開いたように見えて開かない」状態になる。
  const expandAllParents = async (filePath) => {
    const parts = filePath.replace(/\/$/, '').split('/');
    const dirs = [];
    for (let i = 1; i < parts.length; i++) {
      dirs.push(parts.slice(0, i).join('/'));
    }
    dirs.push(filePath.replace(/\/$/, ''));
    if (!dirs.length) return;
    const all = await Promise.all(dirs.map(fetchChildren));
    const updates = Object.fromEntries(dirs.map((d, i) => [d, all[i]]));
    updateTree(t => ({ ...t, ...updates }));
  };

  const doCut = (path) => { cutPath = path; };
  const doPaste = async (dirPath) => {
    if (!cutPath) return;
    const fileName = cutPath.split('/').pop();
    const to = dirPath ? dirPath + '/' + fileName : fileName;
    try {
      const res = await fetch(apiUrl('/move'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: cutPath, to }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      cutPath = null;
      loadTree();
    } catch (e) {
      alert(t('移動失敗: {0}', e.message));
    }
  };
  const doMove = async (fromPath, toDir) => {
    const fileName = fromPath.split('/').pop();
    const to = toDir ? toDir + '/' + fileName : fileName;
    try {
      const res = await fetch(apiUrl('/move'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromPath, to }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      loadTree();
    } catch (e) {
      alert(t('移動失敗: {0}', e.message));
    }
  };
  const doRestore = async (trashFilePath) => {
    const parts = trashFilePath.split('/');
    const fileName = parts.pop();
    parts.pop();
    const to = parts.join('/') + '/' + fileName;
    try {
      const res = await fetch(apiUrl('/move'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: trashFilePath, to }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      loadTree();
    } catch (e) {
      alert(t('復元失敗: {0}', e.message));
    }
  };

  let prevExpandPath = null;

  let treeVersion = 0;
  // treeを更新する唯一の関数。必ずこれを通すこと。
  // t[''] = [...t['']] は重要: {#each tree[''] as node} は参照が変わらないと
  // 子コンポーネントに新しい props を渡さない。スプレッドで常に新しい配列にする。
  const updateTree = (fn) => {
    const t = fn(tree);
    if (t['']) t[''] = [...t['']];
    tree = t;
    treeVersion++;
  };

  $: if (reload) {
    loadTree();
  }

  // URL直接入力/popstate 時に selectedPath の経路を展開する。
  // ツリークリック時の展開はハンドラ側で行い、ここではスキップさせる。
  // ハンドラが先に prevExpandPath を設定しておくことで二重実行を防ぐ。
  $: if (tree[''] && selectedPath && selectedPath.replace(/\/$/, '') !== prevExpandPath) {
    prevExpandPath = selectedPath.replace(/\/$/, '');
    expandAllParents(selectedPath);
  }

  onMount(async () => {
    await loadTree();
  });
</script>

<aside class="knowledge-tree-pane">
  <div class="pane-header">
    <span>{t('ナレッジ')}</span>
    <div class="header-buttons">
      <button class="btn btn-sm btn-outline-secondary" onclick={() => dispatch('openRootDialog')} title={t('ルート設定')}>⚙</button>
      <button class="btn btn-sm btn-outline-secondary" onclick={() => { showHidden = !showHidden; loadTree(); }} title={t('隠しファイルを表示')}>{showHidden ? '📂' : '📁'}</button>
      <button class="btn btn-sm btn-outline-secondary" onclick={() => dispatch('openNewDialog')}>{t('新規')}</button>
    </div>
  </div>
  <div class="pane-body">
    {#if loading}
      <div class="text-muted">{t('読み込み中...')}</div>
    {:else if error}
      <div class="alert alert-danger small">{error}</div>
    {:else if !tree[''] || tree[''].length === 0}
      <div class="text-muted">{t('ナレッジがありません。')}</div>
    {:else}
      <div class="tree-view">
        {#each tree[''] as node}
          <TreeNode {node} {selectedPath} tree={tree} {treeVersion}
            children={tree[node.path] || []}
            {cutPath}
            onLoadChildren={loadChildren}
            // dispatch より先に prevExpandPath を設定すると $: が二重実行する。
            // dispatch → selectedPath 変更（$:はまだ未実行）→ prevExpandPath 設定 → $: 実行（合致→スキップ）の順。
            onSelect={(path) => {
                dispatch('select', { path });
                prevExpandPath = path.replace(/\/$/, '');
                expandAllParents(path);
            }}
            onNewFile={(path) => dispatch('newFile', { path })}
            onDelete={() => loadTree()}
            onEdit={(path) => dispatch('edit', { path })}
            onCut={doCut}
            onPaste={doPaste}
            onRestore={doRestore}
            onMove={doMove}
            // dispatch → prevExpandPath → expandAllParents の順。（onSelectの注釈参照）
            onSelectFolder={(path) => {
                dispatch('selectFolder', { path });
                prevExpandPath = path.replace(/\/$/, '');
                expandAllParents(path);
            }} />
        {/each}
      </div>
    {/if}
  </div>
</aside>

<style lang="scss">
  .knowledge-tree-pane {
    display: flex;
    flex-direction: column;
    background: white;
    border: 1px solid var(--bs-card-border-color);
    border-radius: 0.3rem;
    overflow: hidden;
    align-self: start;
    max-height: 100%;
  }
  .knowledge-tree-pane .pane-body { overflow-y: auto; }
  .tree-view { display: flex; flex-direction: column; }
</style>
