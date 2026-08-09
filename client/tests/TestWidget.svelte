<script>
  export let ctx;
  export let title = '';
</script>

<div class="test-widget">{title}:{ctx.meta?.engine || ''}</div>
