export const renderAll = async (root) => {
  if (typeof mermaid === 'undefined' || !root) return;
  const pres = [...root.querySelectorAll('pre.language-mermaid')];
  if (!pres.length) return;
  const jobs = pres.map(pre => {
    const code = pre.querySelector('code.language-mermaid');
    const source = (code ? code.textContent : pre.textContent).trim().replace(/(\d\/\d)"/g, '$1in');
    return mermaid.render('m-' + Math.random().toString(36).slice(2), source)
      .then(({ svg }) => ({ pre, svg, error: null }))
      .catch(err => ({ pre, svg: null, error: err.message }));
  });
  const results = await Promise.all(jobs);
  results.forEach(({ pre, svg, error }) => {
    if (!pre.parentNode) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-wrapper';
    wrapper.innerHTML = error
      ? '<pre style="color:#c00;background:#fee;padding:8px;border-radius:4px;font-size:12px">Mermaid render error: ' + error + '</pre>'
      : svg;
    pre.parentNode.replaceChild(wrapper, pre);
  });
};
