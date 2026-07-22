import { createMd } from '../../libs/markdown-render.js';
import { t } from '../../libs/i18n.js';
import { fetchRaw, fetchFile } from '../../libs/knowledge-api.js';
import { parse } from 'yaml';

let _md;
const getMd = () => {
  if (!_md) _md = createMd({ useAnchor: true });
  return _md;
};

export const match = (path) => /\.md$|\.mmd$/i.test(path);

const parseFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { body: content, frontmatter: {} };
  try {
    const fm = parse(match[1]) || {};
    return { body: content.slice(match[0].length), frontmatter: fm };
  } catch {
    return { body: content.replace(/^---[\s\S]*?\n---\n?/, ''), frontmatter: {} };
  }
};

export const load = async (path) => {
  try {
    const raw = await fetchRaw(path);
    const { body, frontmatter } = parseFrontmatter(raw.content || '');
    const html = getMd().render(body);
    const engine = frontmatter.engine || (frontmatter.databases || frontmatter.database ? 'duckdb' : null);
    if (engine) {
      let databases = frontmatter.databases || frontmatter.database;
      if (typeof databases === 'string') databases = { default: databases };
      else if (!databases) databases = {};
      const meta = JSON.stringify({ engine, databases }).replace(/"/g, '&quot;');
      return `<div data-page-meta="${meta}">${html}</div>`;
    }
    return html;
  } catch {
    return '<div class="alert alert-danger">' + t('fileNotFound') + '</div>';
  }
};
