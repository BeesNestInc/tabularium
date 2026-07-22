import MarkdownIt from 'markdown-it';
import { full as Emoji } from 'markdown-it-emoji';
import Attrs from 'markdown-it-attrs';
import Anchor from 'markdown-it-anchor';
import * as Prism from 'prismjs';

import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-http.js';
import 'prismjs/components/prism-python.js';

export function createMd(options = {}) {
  const {
    useAnchor = false,
    useLinkOpen = false,
    mermaidSanitize = false,
    mdOptions = { html: true, linkify: true, typographer: true },
    anchorOptions = {},
  } = options;

  const md = new MarkdownIt(mdOptions)
    .use(Emoji)
    .use(Attrs);

  if (useAnchor) {
    md.use(Anchor, anchorOptions);
  }

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = token.info ? token.info.trim() : '';
    if (info === 'mermaid') {
      let content = token.content;
      if (mermaidSanitize) {
        content = content.replace(/(\d\/\d)"/g, '$1in');
      }
      return `<pre class="language-mermaid"><code class="language-mermaid">${md.utils.escapeHtml(content)}</code></pre>\n`;
    }
    if (info === 'sql' || /^sql\s/i.test(info)) {
      const code = token.content;
      const queryNameMatch = info.match(/^sql\s+(\w+)/);
      const queryName = queryNameMatch ? queryNameMatch[1] : '';
      const sqlId = `sql-${Math.random().toString(36).slice(2, 8)}`;
      return `<div class="sql-block" data-sql-id="${sqlId}">
<pre class="language-sql" data-sql="${md.utils.escapeHtml(code)}" data-query-name="${md.utils.escapeHtml(queryName)}"><code class="language-sql">${md.utils.escapeHtml(code)}</code></pre>
<div class="sql-toolbar">
  <button class="sql-run-btn btn btn-sm btn-outline-primary" data-sql-id="${sqlId}">▶ Run</button>
  <span class="sql-status"></span>
</div>
<div class="sql-result" data-sql-id="${sqlId}" style="display:none"></div>
</div>\n`;
    }
    const lang = info || 'clike';
    const code = token.content;
    if (Prism.languages[lang]) {
      try {
        const highlighted = Prism.highlight(code, Prism.languages[lang], lang);
        return `<pre class="language-${lang}"><code class="language-${lang}">${highlighted}</code></pre>\n`;
      } catch {}
    }
    // 言語が未登録または highlight 失敗時は素のHTMLにフォールバック
    return `<pre class="language-${lang}"><code class="language-${lang}">${md.utils.escapeHtml(code)}</code></pre>\n`;
  };

  md.renderer.rules.table_open = () => '<table class="table table-striped">\n';

  if (useLinkOpen) {
    md.renderer.rules.link_open = (tokens, idx, _, __, self) => {
      const a = tokens[idx].attrIndex('target');
      if (a < 0) tokens[idx].attrPush(['target', '_blank']);
      const r = tokens[idx].attrIndex('rel');
      if (r < 0) tokens[idx].attrPush(['rel', 'noopener noreferrer']);
      return self.renderToken(tokens, idx, _);
    };
  }

  return md;
}
