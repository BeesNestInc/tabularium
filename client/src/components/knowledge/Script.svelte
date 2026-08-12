<script>
  import { onMount } from 'svelte';
  import { getScriptHelpers } from '../../libs/script-helpers.js';

  export let ctx;
  export let name = '';
  export let code = '';

  const { runScript, results, params, setParam, meta, setScriptResult, getScriptResult } = ctx;

  let isRunning = false;
  let error = '';
  let outputEl;

  const getResult = (qname) => {
    const r = $results[qname];
    return r?.status === 'done' ? r.data : undefined;
  };
  const output = (html) => { if (outputEl) outputEl.innerHTML = html ?? ''; };
  const append = (html) => { if (outputEl) outputEl.innerHTML += html ?? ''; };
  const clearOutput = () => { if (outputEl) outputEl.innerHTML = ''; };

  const run = async () => {
    isRunning = true;
    error = '';
    clearOutput();
    try {
      const value = await runScript(code, {
        ctx, runQuery: ctx.runQuery, getResult, setParam, getParam: (k) => $params[k], getScript: getScriptResult, getGrid: ctx.getGrid,
        output, append, clearOutput, container: outputEl, meta,
        ...getScriptHelpers(),
      });
      if (value !== undefined) {
        if (name) setScriptResult(name, value);
        append(String(value));
      }
    } catch (e) {
      error = e.message;
      append(`<pre class="script-error">${e.stack || e.message}</pre>`);
    } finally {
      isRunning = false;
    }
  };
</script>

<div class="script-block">
  <pre class="language-javascript"><code>{code}</code></pre>
  <div class="sql-toolbar">
    <button class="sql-run-btn btn btn-sm btn-outline-primary" onclick={run} disabled={isRunning}>
      {isRunning ? '⏳' : '▶ Run'}
    </button>
    {#if name}<span class="sql-status">Script “{name}”</span>{/if}
    {#if error}<span class="sql-status">✘ {error}</span>{/if}
  </div>
  <div class="script-output sql-result" bind:this={outputEl}></div>
</div>

<style>
  .script-block { margin: 12px 0; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; }
  .script-block pre { margin: 0; border-radius: 0; }
  .script-output { min-height: 8px; }
  .script-output :global(.script-error) {
    background: #fef2f2; color: #dc2626; padding: 8px; border-radius: 4px;
    font-size: 0.85em; white-space: pre-wrap;
  }
</style>
