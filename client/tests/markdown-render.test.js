import { describe, it, expect } from 'vitest';
import { createMd, processComponentTags, placeholderHtml } from '../src/libs/markdown-render.js';

const md = createMd({ useAnchor: true });

const parseProps = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  const node = el.querySelector('[data-props]');
  if (!node) return null;
  return JSON.parse(node.dataset.props);
};

describe('sql fence', () => {
  it('plain sql fence stays a display code block (not executable)', () => {
    const html = md.render('```sql\nSELECT 1;\n```');
    expect(html).not.toContain('data-hydrate');
    expect(html).toContain('language-sql');
  });

  it('sql:run named fence → Query placeholder with name + sql in props', () => {
    const html = md.render('```sql:run q1\nSELECT 1;\n```');
    expect(html).toContain('data-hydrate="Query"');
    const props = parseProps(html);
    expect(props).toEqual({ name: 'q1', sql: 'SELECT 1;\n' });
  });

  it('sql:run without name → Query placeholder with empty name', () => {
    const html = md.render('```sql:run\nSELECT 1;\n```');
    const props = parseProps(html);
    expect(props.name).toBe('');
    expect(props.sql).toBe('SELECT 1;\n');
  });

  it('sql containing double quotes and angle brackets is safely JSON-encoded', () => {
    const html = md.render('```sql:run\nSELECT "a<b" AS x;\n```');
    const props = parseProps(html);
    expect(props.sql).toBe('SELECT "a<b" AS x;\n');
    // the attribute must not contain a raw " that would break HTML
    expect(html.match(/data-props="([^"]*)"/)[1]).not.toContain('SELECT "a<b"');
  });
});

describe(':::query container', () => {
  it('captures raw inner text as sql and emits Query placeholder', () => {
    const html = md.render(':::query q2\nSELECT 2 AS two;\n:::\n');
    expect(html).toContain('data-hydrate="Query"');
    expect(parseProps(html)).toEqual({ name: 'q2', sql: 'SELECT 2 AS two;' });
  });
});

describe('javascript fence', () => {
  it('plain javascript fence stays a display code block (not executable)', () => {
    const html = md.render('```javascript\nconst x = 1;\n```');
    expect(html).not.toContain('data-hydrate');
    expect(html).toContain('language-javascript');
  });

  it('js:run fence → Script placeholder with code', () => {
    const html = md.render('```js:run my_script\noutput("hi");\n```');
    expect(html).toContain('data-hydrate="Script"');
    expect(parseProps(html)).toEqual({ name: 'my_script', code: 'output("hi");\n' });
  });

  it('javascript:run without a name works', () => {
    const html = md.render('```javascript:run\n1 + 1\n```');
    expect(html).toContain('data-hydrate="Script"');
    expect(parseProps(html).name).toBe('');
  });
});

describe(':::form container', () => {
  it('renders a Form placeholder wrapping inner ParamInput placeholders', () => {
    const html = processComponentTags(md.render(':::form filter\n<ParamInput name="min_price" type="number" default="1000" />\n:::'));
    const fi = html.indexOf('data-hydrate="Form"');
    const pi = html.indexOf('data-hydrate="ParamInput"');
    expect(fi).toBeGreaterThan(-1);
    expect(pi).toBeGreaterThan(fi);
    expect(html).toContain('form-container');
  });
});

describe('display-only escape (:show)', () => {
  it('sql:show renders display code, not a Query block', () => {
    const html = md.render('```sql:show\nSELECT 1;\n```');
    expect(html).not.toContain('data-hydrate');
    expect(html).toContain('language-sql');
  });

  it('js:show renders highlighted javascript display code', () => {
    const html = md.render('```js:show\nconst x = 1;\n```');
    expect(html).not.toContain('data-hydrate');
    expect(html).toContain('language-javascript');
  });
});

describe('component tags (Evidence-style)', () => {
  it('chart tag → Chart placeholder with parsed props', () => {
    const html = processComponentTags(md.render('<LineChart data={q1} x=day y="clicks"/>'));
    expect(html).toContain('data-hydrate="Chart"');
    expect(parseProps(html)).toEqual({ type: 'LineChart', data: 'q1', x: 'day', y: 'clicks' });
  });

  it('DataTable tag → DataTable placeholder', () => {
    const html = processComponentTags(md.render('<DataTable data={q1}/>'));
    expect(html).toContain('data-hydrate="DataTable"');
    expect(parseProps(html)).toEqual({ data: 'q1' });
  });

  it('ParamInput / DynamicValue tags → placeholders', () => {
    const p = processComponentTags(md.render('<ParamInput name="region" label="地域"/>'));
    expect(p).toContain('data-hydrate="ParamInput"');
    expect(parseProps(p).name).toBe('region');

    const d = processComponentTags(md.render('<DynamicValue data={q1} column="total"/>'));
    expect(d).toContain('data-hydrate="DynamicValue"');
    expect(parseProps(d).column).toBe('total');
  });

  it('parses quoted attribute values containing spaces', () => {
    const p = processComponentTags(md.render('<ParamInput name="region" label="地域を選択:" suffix=" 百万円" />'));
    const props = parseProps(p);
    expect(props.label).toBe('地域を選択:');
    expect(props.suffix).toBe(' 百万円');
  });

  it('chart tag without data is left untouched', () => {
    const src = '<LineChart x=a y=b/>';
    const html = processComponentTags(md.render(src));
    expect(html).toContain(src);
    expect(html).not.toContain('data-hydrate');
  });
});

describe('containers', () => {
  it(':::callout renders typed callout div with markdown body', () => {
    const html = md.render(':::callout warning\n**注意**\n:::');
    expect(html).toContain('<div class="callout callout-warning">');
    expect(html).toContain('<strong>注意</strong>');
  });

  it(':::collapse renders details/summary', () => {
    const html = md.render(':::collapse 詳細\n中身\n:::');
    expect(html).toContain('<details class="collapse-block"><summary>詳細</summary>');
    expect(html).toContain('<p>中身</p>');
    expect(html).toContain('</details>');
  });
});

describe('placeholderHtml', () => {
  it('escapes props and label', () => {
    const html = placeholderHtml('Query', { sql: 'SELECT "x" < y;' }, 'label <b>x</b>');
    expect(html).toContain('data-hydrate="Query"');
    expect(html).not.toContain('SELECT "x"');
    expect(html).toContain('&lt;b&gt;');
    const props = parseProps(html);
    expect(props.sql).toBe('SELECT "x" < y;');
  });
});
