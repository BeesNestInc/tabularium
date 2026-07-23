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
    try {
      const res = await fetch(COOL_API + '/status');
      status = await res.json();
    } catch {}
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(COOL_API + '/config');
      config = await res.json();
    } catch {}
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(COOL_API + '/logs?lines=20');
      const data = await res.json();
      logs = data.logs || data.error || '';
    } catch {}
  };

  const doStart = async () => {
    loading = true; error = '';
    try {
      const res = await fetch(COOL_API + '/start', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) { error = data.error; }
      else { await fetchStatus(); await fetchLogs(); }
    } catch (e) { error = e.message; }
    loading = false;
  };

  const doStop = async () => {
    loading = true; error = '';
    try {
      const res = await fetch(COOL_API + '/stop', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) { error = data.error; }
      else { await fetchStatus(); await fetchLogs(); }
    } catch (e) { error = e.message; }
    loading = false;
  };

  onMount(() => {
    fetchStatus();
    fetchConfig();
    fetchLogs();
  });
</script>

{#if show}
  <div class="modal-overlay" onclick={() => show = false}>
    <div class="modal-dialog" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">Collabora Online {t('ルート設定')}</div>
      <div class="modal-body" style="max-height:60vh;overflow-y:auto">
        {#if status}
          <div style="margin-bottom:12px">
            <strong>{t('状態')}:</strong>
            <span class="root-item-status" class:accessible={status.running} class:inaccessible={!status.running}>
              {status.running ? t('実行中') : t('停止中')}
            </span>
          </div>
          <div style="margin-bottom:8px;font-size:0.85rem">
            <div>{t('コンテナ')}: {status.containerName || '-'}</div>
            <div>{t('エンジン')}: {status.engine || '-'}</div>
            <div>{t('イメージ')}: {status.image || '-'}</div>
            <div>{t('ホストポート')}: {status.hostPort || '-'}</div>
          </div>
        {:else}
          <div class="text-muted">{t('読み込み中...')}</div>
        {/if}

        {#if config}
          <hr>
          <div style="font-size:0.85rem;margin-bottom:8px">
            <div>WOPI: {config.wopiHost}</div>
            <div>Collabora: {config.coolHost}</div>
          </div>
        {/if}

        <div style="display:flex;gap:6px;margin:12px 0">
          <button class="btn btn-sm btn-primary" onclick={doStart} disabled={loading || status?.running}>
            {loading ? t('実行中...') : t('起動')}
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick={doStop} disabled={loading || !status?.running}>
            {loading ? t('実行中...') : t('停止')}
          </button>
          <button class="btn btn-sm btn-outline-secondary" onclick={fetchLogs}>{t('ログ更新')}</button>
        </div>

        {#if error}
          <div class="alert alert-danger small">{error}</div>
        {/if}

        {#if logs}
          <hr>
          <pre style="font-size:0.75rem;background:#f4f4f4;padding:8px;border-radius:4px;max-height:200px;overflow-y:auto;white-space:pre-wrap">{logs}</pre>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm btn-outline-secondary" onclick={() => show = false}>{t('閉じる')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-dialog { width: 520px; max-width: 90vw; }
</style>
