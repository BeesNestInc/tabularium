<script>
  import { onMount } from 'svelte';
  import { t } from '../../libs/i18n.js';

  export let show = false;

  let status = null;
  let logs = '';
  let config = null;
  let loading = false;
  let error = '';

  const COOL_API = '/api/collabora';

  const fetchStatus = async () => {
    try { const r = await fetch(COOL_API + '/status'); status = await r.json(); } catch {}
  };
  const fetchConfig = async () => {
    try { const r = await fetch(COOL_API + '/config'); config = await r.json(); } catch {}
  };
  const fetchLogs = async () => {
    try { const r = await fetch(COOL_API + '/logs?lines=20'); const d = await r.json(); logs = d.logs || d.error || ''; } catch {}
  };

  const act = async (fn) => {
    loading = true; error = '';
    try { const r = await fn(); if (!r.ok) error = r.error; else { await fetchStatus(); await fetchLogs(); } }
    catch (e) { error = e.message; }
    loading = false;
  };

  const doStart = () => act(fetch(COOL_API + '/start', { method: 'POST' }).then(r => r.json()));
  const doStop = () => act(fetch(COOL_API + '/stop', { method: 'POST' }).then(r => r.json()));

  onMount(() => { fetchStatus(); fetchConfig(); fetchLogs(); });
</script>

{#if show}
  <div class="modal-overlay" onclick={() => show = false}>
    <div class="modal-dialog-sm" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">Collabora Online</div>
      <div class="modal-body">
        {#if status}
          <div class="cool-status-row">
            <span class="cool-label">{t('status')}:</span>
            <span class="cool-status" class:running={status.running}>{status.running ? t('running') : t('stopped')}</span>
          </div>
          <div class="cool-info">
            <div><span class="cool-label">{t('container')}:</span> {status.containerName || '-'}</div>
            <div><span class="cool-label">{t('engine')}:</span> {status.engine || '-'}</div>
            <div><span class="cool-label">{t('image')}:</span> {status.image || '-'}</div>
            <div><span class="cool-label">{t('hostPort')}:</span> {status.hostPort || '-'}</div>
          </div>
        {:else}
          <div class="text-muted">{t('loading')}</div>
        {/if}

        {#if config}
          <hr class="cool-hr">
          <div class="cool-info">
            <div><span class="cool-label">WOPI:</span> {config.wopiHost}</div>
            <div><span class="cool-label">Collabora:</span> {config.coolHost}</div>
          </div>
        {/if}

        <div class="cool-actions">
          <button class="btn btn-sm btn-primary" onclick={doStart} disabled={loading || status?.running}>
            {loading ? t('saving') : t('start')}
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick={doStop} disabled={loading || !status?.running}>
            {loading ? t('saving') : t('stop')}
          </button>
          <button class="btn btn-sm btn-outline-secondary" onclick={fetchLogs}>{t('refresh')}</button>
        </div>

        {#if error}
          <div class="cool-error">{error}</div>
        {/if}

        {#if logs}
          <hr class="cool-hr">
          <pre class="cool-log">{logs}</pre>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm btn-outline-secondary" onclick={() => show = false}>{t('close')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .cool-status-row { margin-bottom: 12px; }
  .cool-label { font-weight: 600; color: #555; margin-right: 6px; }
  .cool-status { font-size: 0.85rem; padding: 2px 10px; border-radius: 3px; }
  .cool-status.running { background: #d4edda; color: #155724; }
  .cool-status:not(.running) { background: #f8d7da; color: #721c24; }
  .cool-info { font-size: 0.85rem; line-height: 1.7; color: #333; }
  .cool-hr { border: none; border-top: 1px solid #ddd; margin: 12px 0; }
  .cool-actions { display: flex; gap: 6px; margin: 12px 0; }
  .cool-error { font-size: 0.85rem; padding: 6px 10px; background: #f8d7da; color: #721c24; border-radius: 4px; margin-bottom: 8px; }
  .cool-log { font-size: 0.75rem; background: #f5f5f5; padding: 8px; border-radius: 4px; max-height: 200px; overflow-y: auto; white-space: pre-wrap; color: #333; border: 1px solid #e0e0e0; }
</style>
