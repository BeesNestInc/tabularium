<script>
  import { onMount, onDestroy } from 'svelte';

  export let option;

  let el;
  let chart = null;
  let ro = null;

  onMount(async () => {
    const { init } = await import('echarts');
    chart = init(el);
    chart.setOption(option);
    ro = new ResizeObserver(() => chart && chart.resize());
    ro.observe(el);
  });

  onDestroy(() => {
    if (ro) ro.disconnect();
    if (chart) chart.dispose();
  });

  $: if (chart && option) chart.setOption(option, true);
</script>

<div class="mdx-chart-render" bind:this={el}></div>
