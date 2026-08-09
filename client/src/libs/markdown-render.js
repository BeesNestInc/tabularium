import MarkdownIt from 'markdown-it';
import { full as Emoji } from 'markdown-it-emoji';
import Attrs from 'markdown-it-attrs';
import Anchor from 'markdown-it-anchor';
import * as Prism from 'prismjs';
import { isHydratable } from './hydratable-registry.js';

import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-http.js';
import 'prismjs/components/prism-python.js';

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escHtml(s).replace(/"/g, '&quot;');

export const placeholderHtml = (name, props, label) => {
  const propsAttr = escAttr(JSON.stringify(props || {}));
  const body = label ? `<div class="mdx-hydrate-box">${escHtml(label)}</div>` : '';
  return `<div class="mdx-hydrate" data-hydrate="${escAttr(name)}" data-props="${propsAttr}">${body}</div>`;
};

const CHART_TAGS = new Set(['LineChart', 'BarChart', 'AreaChart', 'ScatterPlot', 'PieChart']);

export const processComponentTags = (html) => {
  return String(html).replace(
    /<([A-Z][\w]*)\s+([\s\S]*?)\/>/g,
    (match, tagName, attrs) => {
      const isChart = CHART_TAGS.has(tagName);
      const hydrateName = isChart ? 'Chart' : tagName;
      if (!isHydratable(hydrateName)) return match;
      const props = {};
      attrs.replace(/(\w+)=(\{[^}]+\}|"[^"]*"|'[^']*'|[^\s/>]+)/g, (m, key, val) => {
        if (val.startsWith('{') && val.endsWith('}')) props[key] = val.slice(1, -1);
        else if (val.length >= 2 && (val[0] === '"' && val[val.length - 1] === '"' || val[0] === "'" && val[val.length - 1] === "'")) props[key] = val.slice(1, -1);
        else props[key] = val;
      });
      if (isChart) props.type = tagName;
      if ((isChart || tagName === 'DataTable') && !props.data) return match;
      if (tagName === 'ParamInput') {
        return placeholderHtml('ParamInput', props, `Param: ${props.name || ''}`);
      }
      if (tagName === 'DynamicValue') {
        return placeholderHtml('DynamicValue', props, 'DynamicValue');
      }
      return placeholderHtml(hydrateName, props, `${tagName}${props.data ? ` (${props.data})` : ''}`);
    }
  );
};

const mdxContainer = (md, name, renderOpen, renderClose) => {
  const startRe = new RegExp('^:::\\s*' + name + '\\s*(.*)$');
  md.block.ruler.before('paragraph', 'mdx_' + name, (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (state.src.charCodeAt(start) !== 0x3a) return false;
    const m = state.src.slice(start, max).match(startRe);
    if (!m) return false;
    if (silent) return true;
    let nextLine = startLine + 1;
    let closed = -1;
    while (nextLine < endLine) {
      const s = state.bMarks[nextLine] + state.tShift[nextLine];
      const e = state.eMarks[nextLine];
      if (/^:::\s*$/.test(state.src.slice(s, e))) { closed = nextLine; break; }
      nextLine++;
    }
    if (closed < 0) return false;
    const open = state.push('mdx_' + name + '_open', 'div', 1);
    open.meta = m[1].trim();
    open.map = [startLine, closed];
    if (renderClose) {
      state.md.block.tokenize(state, startLine + 1, closed);
      state.push('mdx_' + name + '_close', 'div', -1);
    }
    state.line = closed + 1;
    return true;
  });
  md.renderer.rules['mdx_' + name + '_open'] = (tokens, idx) => renderOpen(tokens[idx].meta);
  if (renderClose) md.renderer.rules['mdx_' + name + '_close'] = () => renderClose();
};

const mdxQuery = (md) => {
  md.block.ruler.before('paragraph', 'mdx_query', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (state.src.charCodeAt(start) !== 0x3a) return false;
    const m = state.src.slice(start, max).match(/^:::\s*query\s*(\w*)\s*$/);
    if (!m) return false;
    if (silent) return true;
    let nextLine = startLine + 1;
    let closed = -1;
    while (nextLine < endLine) {
      const s = state.bMarks[nextLine] + state.tShift[nextLine];
      const e = state.eMarks[nextLine];
      if (/^:::\s*$/.test(state.src.slice(s, e))) { closed = nextLine; break; }
      nextLine++;
    }
    if (closed < 0) return false;
    const sql = state.src.slice(state.bMarks[startLine + 1], state.bMarks[closed]).trim();
    const open = state.push('mdx_query_open', 'div', 1);
    open.meta = { name: m[1] || '', sql };
    open.map = [startLine, closed];
    state.line = closed + 1;
    return true;
  });
  md.renderer.rules.mdx_query_open = (tokens, idx) => {
    const meta = tokens[idx].meta;
    return placeholderHtml('Query', meta, 'Query' + (meta.name ? ` “${meta.name}”` : ''));
  };
};

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

  const renderCodeBlock = (lang, code) => {
    if (Prism?.languages?.[lang]) {
      try {
        const highlighted = Prism.highlight(code, Prism.languages[lang], lang);
        return `<pre class="language-${lang}"><code class="language-${lang}">${highlighted}</code></pre>\n`;
      } catch {}
    }
    return `<pre class="language-${lang}"><code class="language-${lang}">${md.utils.escapeHtml(code)}</code></pre>\n`;
  };

  mdxQuery(md);
  mdxContainer(md, 'callout', (args) => `<div class="callout callout-${escAttr(args || 'info')}">`, () => '</div>');
  mdxContainer(md, 'collapse', (args) => `<details class="collapse-block"><summary>${escHtml(args || '')}</summary>`, () => '</details>');

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
    // 実行SQL: ```sql:run 名前  (素の ```sql は表示コードのまま)
    const sqlRunMatch = info.match(/^sql:run(?:\s+(\w+))?$/);
    if (sqlRunMatch) {
      const queryName = sqlRunMatch[1] || '';
      return placeholderHtml('Query', { name: queryName, sql: token.content }, 'Query' + (queryName ? ` “${queryName}”` : '')) + '\n';
    }
    // 実行JS: ```js:run 名前  (素の ```javascript は表示コードのまま)
    const jsRunMatch = info.match(/^(javascript|js):run(?:\s+(\w+))?$/);
    if (jsRunMatch) {
      const scriptName = jsRunMatch[2] || '';
      return placeholderHtml('Script', { name: scriptName, code: token.content }, 'Script' + (scriptName ? ` “${scriptName}”` : '')) + '\n';
    }
    // 表示専用フェンス (実行しない): ```sql:show / ```js:show など
    const showMatch = info.match(/^(sql|javascript|js):(show|plain|display|static|example)$/);
    if (showMatch) {
      const lang = showMatch[1] === 'js' ? 'javascript' : showMatch[1];
      return renderCodeBlock(lang, token.content);
    }
    return renderCodeBlock(info || 'clike', token.content);
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
