import { t } from '../libs/i18n.js';

const stripFrontMatter = (text) => {
  return text.replace(/^---[\s\S]*?\n---\n?/, '');
};

export const renderPreview = (el, value, md) => {
  if (!el) return;
  const previousScrollTop = el.scrollTop;
  const raw = stripFrontMatter(value || '');
  if (!raw.trim()) {
    el.innerHTML = '<p class="text-muted">' + t('editingPreview') + '</p>';
    el.scrollTop = 0;
    return;
  }
  try {
    const html = md.render(raw);
    el.innerHTML = html;
    requestAnimationFrame(() => { el.scrollTop = previousScrollTop; });
    import('./mermaid.js').then(m => m.renderAll(el));
  } catch (e) {
    el.innerHTML = `<p class="text-danger">preview error: ${e.message}</p>`;
  }
};

export const queuePreview = (el, value, md, prevTimer) => {
  clearTimeout(prevTimer);
  return setTimeout(() => renderPreview(el, value, md), 80);
};
