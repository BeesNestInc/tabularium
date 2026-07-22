<script>
  import { createEventDispatcher } from 'svelte';
  import Editor from '../editor/Editor.svelte';
  import Spreadsheet from '../editor/Spreadsheet.svelte';
  import { createMd } from '../../libs/markdown-render.js';
  import { renderPreview, queuePreview as qp } from '../../lib/preview.js';
  import { isCsvExt } from '../../lib/file-utils.js';
  import { isCalendarExt } from '../../lib/file-utils.js';
  import { t } from '../../libs/i18n.js';

  export let selectedPath = '';
  export let editorContent = '';
  export let editorLang = 'text';
  export let saving = false;
  export let saveMessage = '';
  export let csvLoadKey = 0;

  const dispatch = createEventDispatcher();

  let _md;
  const getMd = () => {
    if (!_md) _md = createMd({ useAnchor: true });
    return _md;
  };

  let previewContainer;
  let renderTimer;
  const onQueuePreview = (value) => {
    if (!previewContainer) return;
    renderTimer = qp(previewContainer, value, getMd(), renderTimer);
  };

  let prevContent = editorContent;
  $: if (prevContent !== editorContent) {
    prevContent = editorContent;
    onQueuePreview(editorContent);
  }

  const handleEditorChange = (e) => {
    const value = e.detail.value;
    dispatch('editorChange', { value });
  };
</script>

<div class="edit-mode">
  <div class="edit-bar">
    <span class="edit-path">{selectedPath}</span>
    <div class="edit-actions">
      <button class="btn btn-sm btn-primary" onclick={() => dispatch('save')} disabled={saving}>
        {saving ? t('保存中...') : t('保存')}
      </button>
      <button class="btn btn-sm btn-success" onclick={() => dispatch('saveAndExit')} disabled={saving}>
        {saving ? t('保存中...') : t('保存して終了')}
      </button>
      <a href="/{selectedPath}" class="btn btn-sm btn-outline-secondary">{t('取消')}</a>
    </div>
  </div>
  {#if saveMessage}
    <div class="edit-message" class:error={saveMessage.includes('失敗')}>{saveMessage}</div>
  {/if}
  {#if isCsvExt(selectedPath)}
    <div class="edit-body" style="grid-template-columns:1fr;">
      <div class="edit-pane" style="border-right:none;">
        {#key csvLoadKey}
          <Spreadsheet csvData={editorContent} on:change={(e) => dispatch('csvChange', { value: e.detail.value })} readonly={false} />
        {/key}
      </div>
    </div>
  {:else if isCalendarExt(selectedPath)}
    <div class="edit-body" style="grid-template-columns:1fr;">
      <div class="edit-pane editor-pane" style="border-right:none;">
        <Editor value={editorContent} on:change={handleEditorChange} language={editorLang} />
      </div>
    </div>
  {:else}
    <div class="edit-body">
      <div class="edit-pane editor-pane">
        <Editor value={editorContent} on:change={handleEditorChange} language={editorLang} />
      </div>
      <div class="edit-pane preview-pane">
        <div class="preview-content markdown document" bind:this={previewContainer}></div>
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  .edit-mode {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 48px);
    overflow: hidden;
  }
  .edit-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid #ddd;
    background: #f8f9fa;
  }
  .edit-path {
    flex: 1;
    font-size: 0.85rem;
    color: #666;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .edit-actions { display: flex; gap: 4px; }
  .edit-message {
    padding: 8px 16px;
    background: #d4edda;
    color: #155724;
    font-size: 0.85rem;
  }
  .edit-message.error { background: #f8d7da; color: #721c24; }
  .edit-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: row;
  }
  .edit-pane {
    width: 50%;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .editor-pane {
    border-right: 1px solid #ddd;
    padding: 16px 16px 24px;
  }
  .editor-pane :global(.editor-root) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .editor-pane :global(.editor-container) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: none;
    border-radius: 0;
  }
  .editor-pane :global(.cm-editor) {
    flex: 1;
    min-height: 0;
  }
  .editor-pane :global(.cm-scroller) { overflow: auto; }
  .edit-pane.preview-pane {
    background: #fff;
    border-left: 1px solid #d0d8e0;
    position: relative;
  }
  .preview-pane .preview-content {
    position: absolute;
    top: 16px;
    left: 20px;
    right: 20px;
    bottom: 24px;
    overflow-y: auto;
  }
</style>
