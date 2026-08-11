<script>
  import { onMount } from 'svelte';

  let { ctx, name = '', label = '', type = 'text', options = '', default: def = '', min = '', max = '', step = '', rows = '', apply = false, inForm = false } = $props();

  const { params, setParam } = ctx;

  const isCheckbox = type === 'checkbox';
  const deferred = inForm || apply;

  const initial = $params[name];
  let local = $state(isCheckbox ? (initial === 'true' || def === 'true') : (initial ?? def));
  let pending = $state(false);

  const commit = () => {
    setParam(name, isCheckbox ? (local ? 'true' : 'false') : String(local ?? ''));
    pending = false;
  };
  const onChange = () => {
    if (deferred) pending = true;
    else commit();
  };

  onMount(() => {
    if (def) ctx.setParam(name, isCheckbox ? (String(def) === 'true' ? 'true' : 'false') : def);
  });
</script>

<label class="param-input" class:param-pending={pending}>
  {#if label}<span class="param-label">{label}</span>{/if}
  {#if options}
    <select bind:value={local} onchange={onChange}>
      {#each options.split(',').map((o) => o.trim()) as o}
        <option value={o}>{o}</option>
      {/each}
    </select>
  {:else if isCheckbox}
    <input type="checkbox" bind:checked={local} onchange={onChange} />
  {:else if type === 'textarea'}
    <textarea rows={rows || 3} bind:value={local} oninput={onChange}></textarea>
  {:else if type === 'number'}
    <input type="number" min={min || undefined} max={max || undefined} step={step || undefined} bind:value={local} oninput={onChange} />
  {:else if type === 'date'}
    <input type="date" bind:value={local} onchange={onChange} />
  {:else}
    <input type="text" bind:value={local} oninput={onChange} />
  {/if}
  {#if apply && pending}
    <button type="button" class="btn btn-sm btn-outline-primary param-apply-btn" onclick={() => commit()}>適用</button>
  {/if}
</label>
