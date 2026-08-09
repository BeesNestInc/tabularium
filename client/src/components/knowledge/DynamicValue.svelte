<script>
  export let ctx;
  export let data = '';   // query name
  export let column = '';
  export let param = '';

  const { results, params } = ctx;

  $: result = data ? $results[data]?.data : null;
  $: value = param
    ? $params[param]
    : (result && column ? result.rows?.[0]?.[column] : result?.rowCount);
</script>

<span class="mdx-dynamic-value">{value ?? ''}</span>
