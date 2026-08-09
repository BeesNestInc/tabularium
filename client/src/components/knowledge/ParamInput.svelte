<script>
  export let ctx;
  export let name = '';
  export let label = '';
  export let type = 'text';
  export let options = '';

  const { params } = ctx;

  let local = $params[name] ?? '';
  const update = () => ctx.setParam(name, local);
</script>

<label class="param-input">
  {#if label}<span class="param-label">{label}</span>{/if}
  {#if options}
    <select bind:value={local} onchange={update}>
      {#each options.split(',').map((o) => o.trim()) as o}
        <option value={o}>{o}</option>
      {/each}
    </select>
  {:else if type === 'date'}
    <input type="date" bind:value={local} onchange={update} />
  {:else}
    <input type="text" bind:value={local} oninput={update} />
  {/if}
</label>
