# Markdown Component Hydration System

**Created: 2026-08-12** — This document records the design and implementation of interactive components that can be embedded in Tabularium wiki markdown (SQL execution, charts, forms, JS execution, and more), at a level of detail sufficient for developers to work with the code.

> **Terminology**: "hydration" refers to the software term **hydration**. In the code it is written as `hydrate()` / `data-hydrate`.

## 1. Where the code lives

- The implementation is in **`client/`** (a Svelte + Vite SPA). The server-side API is in **`server/`**.
- Main rendering pipeline: `client/src/libs/markdown-render.js` → `client/src/libs/hydrate.js` → `client/src/components/knowledge/*.svelte`.
- The query execution engine (DuckDB / direct PostgreSQL) is centralized in **`server/libs/query-engine.js`** (imported by `server/index.js`).
- **Legion integration**: this repository is also consumed by the Legion project (web-ui). The frontend is shared via symlinks into `client/`, and the server side is shared via a thin wrapper that imports `query-engine.js`.

### Commands

```bash
cd client
npm run build        # vite build → ../public/
npm test             # vitest run (unit tests)
npm run test:watch   # watch mode
```

## 2. Overall architecture

```
markdown body
   │  createMd() (markdown-it) + processComponentTags()
   ▼
<div class="mdx-hydrate" data-hydrate="Query" data-props='{json}'>
   │  Knowledge.svelte's hydrateContent() after render
   ▼
hydrate(root, ctx) imports + Svelte5 mount() from the registry
   ▼
Each component shares state via ctx (query context)
```

- markdown-it emits **typed placeholders**, and after the page renders, `hydrate()` hydrates the corresponding Svelte components. The old hacks (HTML string + regex substitution for SQL/charts) have been **removed**.
- Components are `mount()`ed independently, so Svelte's `getContext` cannot be used. All state sharing goes through `ctx` (query-context).

## 3. File map

| Path (relative to `client/`) | Role |
|---|---|
| `src/libs/markdown-render.js` | `createMd()` (markdown-it config, fence/container rules), `processComponentTags()`, `placeholderHtml()` |
| `src/libs/hydratable-registry.js` | Component registry. `registerHydratable()` / `getHydratable()` / `isHydratable()` |
| `src/libs/hydrate.js` | `hydrate(root, ctx)` / `unmountAll()`. Re-exports `registerHydratable` |
| `src/libs/query-context.js` | `createQueryContext(meta)`. Query execution, params, Script shared execution |
| `src/libs/script-precompile.js` | Converts Script block top-level declarations to shared assignments (`@babel/parser`, dynamic import) |
| `src/libs/std.js` | `Tablarium` / `Legion` standard library (section 14) |
| `src/libs/script-helpers.js` | `registerScriptHelper(name, value)` — extra helpers injected into the Script run scope |
| `src/components/knowledge/*.svelte` | Built-in components (Query/Chart/DataTable/ResultTable/EChart/ParamInput/DynamicValue/Script/Form/FrontmatterImport/Badge) |
| `src/extensions.js` | **Registration entry point** for custom components / script helpers (imported by `wiki-main.js`) |
| `src/wiki-main.js` | SPA entry. Reads `import './extensions.js'` |
| `src/pages/Knowledge.svelte` | The page itself. Calls `hydrate()` via `hydrateContent()` |
| `src/lib/content-types/markdown.js` | `load()` for markdown content. Wraps front matter `engine`/`databases` in `<div data-page-meta>` |
| `src/lib/preview.js` | Edit-mode preview (applies `processComponentTags`) |
| `src/styles/markdown-content.scss` | Shared content styles (`.sql-block`, `.mdx-hydrate-*`, `.form-container`, `.callout`, etc.) |

## 4. Markdown syntax reference

### 4.1 Fences (```…```)

| Fence | Behavior |
|---|---|
| ` ```sql:run name ` | **Executable query** (Query component, ▶Run) |
| ` ```js:run name ` | **Executable script** (Script component, ▶Run) |
| ` ```sql ` / ` ```javascript ` / ` ```js ` | **Display only** (Prism highlight) |
| ` ```sql:show ` / ` ```js:show ` (also `plain`/`display`/`static`/`example`) | Display only (explicit) |
| ` ```mermaid ` | Mermaid diagram |
| Other languages | Rendered with Prism |

**Convention (important)**: for both `sql` and `javascript`, a bare fence means "display", and execution requires `:run`. This prevents display-only code examples from accidentally becoming executable blocks.

### 4.2 Self-closing component tags

```md
<LineChart data={q1} x=month y=revenue />
<BarChart data={q} x=region y=sales />
<PieChart data={q} x=region y=sales />
<AreaChart data={q} x=month y=orders fill=true />
<DataTable data={q} />
<ParamInput name="region" label="地域:" options="東京,大阪,名古屋" default="大阪" />
<DynamicValue data={q} column="sales" />
```

- Attributes are `key=value`; spaces inside quotes are allowed (`suffix=" 百万円"`).
- `{...}` is a reference (e.g., a query name); the braces are stripped.
- **Only registered tags** are converted; unregistered uppercase self-closing tags pass through (`processComponentTags`).
- **Embedding in HTML**: because markdown-it uses `html: true`, `<ParamInput/>` / `<DynamicValue/>` written inside raw HTML blocks (e.g., `<form>`) are also converted and hydrated (since `processComponentTags` scans the whole rendered HTML). ParamInput placed in raw HTML inside a `:::form` is also collected by the apply button.
- **Inline generation**: `ParamInput` / `DynamicValue` are emitted as `<span class="mdx-hydrate mdx-hydrate-inline">`, so when written inline they flow into the text without a line break. Charts and tables remain `<div>` (block).
- **How to show code examples**: always write tag usage examples inside ``` fences (content in fences is HTML-escaped, so it is not converted/hydrated). Inside raw `<pre><code>` the tags would be converted — but since examples should use fences, this is **not handled** (accepted known behavior).

### 4.3 Containers (`:::`)

```md
:::callout warning
**注意** body (markdown OK)
:::

:::collapse details
collapsed body
:::

:::query q1
SELECT 1;
:::

:::form filter
<ParamInput name="min_price" label="最低価格:" type="number" default="1000" />
<ParamInput name="region" label="地域:" options="東京,大阪" default="大阪" />
:::

:::import knowledge/demo-data as demodb
:::

:::import knowledge/demo-data/sales.csv as sales
:::
```

- `:::query` defines a SQL query (Query component; execution is the same as the `sql:run` fence).
- `:::form` is a container of fields plus an **Apply** button. The argument is the form name (optional).
- `:::import path [as name]` imports **front matter / CSV into DuckDB** (FrontmatterImport component). `.md` (directory or single file) → front matter table; `.csv` (single file) → the raw contents. See section 13.

## 5. Query context (ctx)

The object returned by `createQueryContext(meta)`. Every component receives it as a prop.

| Member | Type / description |
|---|---|
| `meta` | `{ engine, databases }` (from front matter, or null) |
| `results` | Svelte store. `{ queryName: { status:'running'/'done'/'error', data?, error? } }` |
| `running` | store. `{ queryName: bool }` |
| `params` | store. `{ paramName: stringValue }` (substituted into `{name}` in SQL) |
| `paramVersion` | store (number). Incremented on every `setParam`/`applyParams` |
| `scriptStore` | plain object. Current values of **top-level declarations shared between Script blocks** |
| `runScript(code, helpers)` | Executes a Script block, accumulating top-level declarations into the shared scope, passing `helpers` (per-block injections such as `output`/`runQuery`/`container`). Unwraps and returns the value |
| `scriptResults` | plain object. Holds **return values of named Scripts** keyed by name |
| `setScriptResult(name, value)` | Stores a named Script's return value (used internally by Script.svelte) |
| `getScriptResult(name)` | Returns a named Script's return value (exposed as `getScript(name)` in Scripts) |
| `runQuery(name, sql?)` | Executes a query. If `sql` is omitted, uses the `registerQuery`ed SQL |
| `registerQuery(name, sql, auto)` | Defines a named query (registered by Query onMount) |
| `setParam(k, v)` | Sets a param and **re-runs already-run queries that reference it** |
| `applyParams({k:v})` | Sets multiple params and **re-runs registered queries that reference them once each** (including not-yet-run ones) |

### Parameter substitution

`runQuery` substitutes `{name}` in the SQL with `params[name]`. Empty/undefined params are **left as `{name}`** (which produces a SQL error — informing the author).

## 6. Auto-run rules

- `hydrate()` collects the query names referenced by any component with a `data` property, and passes `auto=true` to the matching `Query` → it runs onMount.
- `ParamInput`'s `default` is applied via `setParam` onMount (so auto-run queries use the initial value).
- Fields inside a Form do **not** run immediately on change (deferred). The **Apply** button calls `applyParams`, which re-runs the referencing queries.

## 7. Component details

### Query.svelte
- props: `ctx`, `name`, `sql`, `auto`
- ▶Run button + status display + table/chart tabs (`ResultTable` / `EChart`).
- Registers `ctx.registerQuery(name, sql, auto)` onMount, and runs if `auto`.

### Chart.svelte / EChart.svelte
- `Chart`: props `ctx, data(queryName), type(LineChart/BarChart/AreaChart/ScatterPlot/PieChart), x, y, y2, fill`. Builds an ECharts option via `buildOption()` → `EChart`.
- `EChart`: takes `option`, dynamic `import('echarts')`, ResizeObserver, dispose management.

### DataTable.svelte / ResultTable.svelte
- `DataTable`: props `ctx, data`. Feeds the result to `ResultTable`.
- `ResultTable`: data display. Click header to sort, pagination (100/page), CSV export.

### ParamInput.svelte (runes mode)
- props: `ctx, name, label, type(text/number/date/textarea/checkbox), options, default, min, max, step, rows, apply, inForm`
- `options` → select / `type=checkbox` → boolean (`true`/`false` string) / `textarea` / `number` / `date` / default text.
- **Deferred** when `inForm` (injected by hydrate) or `apply=true`: does not call `setParam` immediately; marks `.param-pending`. With `apply`, shows its own Apply button.
- `bind:value` on a number input yields a number, so `commit()` normalizes with `String()` before `setParam`.

### Script.svelte
- props: `ctx, name, code`. ▶Run executes `ctx.runScript(code, helpers)`.
- Variables available in the run scope (`helpers`):
  `ctx`, `runQuery`, `getResult`, `setParam`, `getParam`, `getScript`, `output(html)`, `append(html)`, `clearOutput()`, `container` (result DOM), `meta` + **`...getScriptHelpers()`** (standard library `Tablarium`/`Legion` registered via `script-helpers.js`; section 14)
- async/await supported. Exceptions are shown as errors.
- **Shared environment**: all Script blocks on the same page share **top-level declarations** (`let`/`const`/`var`/`function`/`class`). `const x = 5` in one block is visible in another. Nested declarations remain block-scoped.
- **Named** (` ```js:run name `) scripts store their **return value** via `ctx.setScriptResult(name, value)`; other blocks can read it with `getScript('name')`.

### Script shared execution mechanism (`query-context.runScript` + `script-precompile`)

1. `script-precompile.js`: parses the code as an async function with Babel, rewriting **top-level declarations into shared-scope assignments** (`const x = 5` → `void (x = 5)`, `function f(){}` → `f = function f(){}`, last expression → `return {returnValue: (...)}`, leading `"use strict"` removed). Also converts **static `import ... from 'absoluteURL'` into `await import(...)`** (named/default/namespace/side-effect supported). A reimplementation of the livenote/jsconsole approach. `@babel/parser` is dynamically imported (kept out of the main bundle).
2. `query-context.runScript`: executes the rewritten statements in **`with(scope)`** inside a `new Function`. `scope` is a **Proxy** with `has: () => true` (reads: helper → scriptStore → real global; writes: into scriptStore). This shares declarations between blocks **without polluting `window`**.
3. `with` is used **only inside a non-strict `new Function` body** (never in module/app code).

### Form.svelte (container)
- props: `ctx, name, button, target` (`target` = the mount element hydrate passes).
- The **Apply** button scans `target.querySelectorAll('[data-hydrate="ParamInput"]')`, collects each field's current value (checkbox → checked), and calls `ctx.applyParams(values)`.
- As a container, hydrate mounts it **without clearing innerHTML** (preserving child placeholders).

### FrontmatterImport.svelte
- props: `path, as, _imported`. Display only (the actual import is performed by `hydrate()` before mounting).
- Shows "N rows" for `kind: 'csv'`, "N pages" for `'frontmatter'`.

### Badge.svelte (custom component reference)
- props: `ctx, data, column, label, prefix, suffix, format`. Shows the first row's value as a KPI card.

## 8. Adding a custom component

1. Create a `.svelte` file under `src/components/knowledge/`.
2. Register it in `src/extensions.js`:
   ```js
   import { registerHydratable } from './libs/hydrate.js';
   registerHydratable('MyWidget', () => import('./components/knowledge/MyWidget.svelte'));
   ```
   - Pass `{ container: true }` as the third argument to make it a container that wraps child placeholders (like Form).
   - Registering with the same name overrides a built-in.
3. Use it in markdown as `<MyWidget prop="val"/>`.
4. Components receive `ctx`. Writing `data={queryName}` makes the query an auto-run target.

## 9. hydrate internals (before touching the code)

- Iterates `[...root.querySelectorAll('[data-hydrate]')]` in DOM order.
- Collects query names from `data` properties into `referenced` (auto-run determination).
- For each element: gets `{ loader, container }` from the registry. For non-containers, clears `el.innerHTML` before `mount`. Passes `{ ...dataProps, ctx, target: el }` as props.
- Injects `props.auto` for `Query`, `props.inForm` (via `el.closest('[data-hydrate="Form"]')`) for `ParamInput`.
- **FrontmatterImport is awaited before mounting** (ordering guarantee so auto-run queries don't run before the table exists).
- **Containers do not clear innerHTML** (preserving child placeholders). Mount order is DOM order, so Form comes first, then its children.

## 10. markdown-render internals

- `placeholderHtml(name, props, label, { inline })` → `<div class="mdx-hydrate" data-hydrate="NAME" data-props='JSON(escaped)'>` (with `inline`: `<span class="mdx-hydrate mdx-hydrate-inline">`).
- `processComponentTags(html)`: matches uppercase self-closing tags via `/<([A-Z][\w]*)\s+([\s\S]*?)\/>/g`, converting registered ones to placeholders. Chart tags get a `type` and map to the hydrate name `Chart`.
- Attribute parser: `/(\w+)=(\{[^}]+\}|"[^"]*"|'[^']*'|[^\s/>]+)/g` (spaces inside quotes supported).
- Container rules use `mdxContainer(md, name, openFn, closeFn)` / `mdxQuery(md)` (markdown-it `block.ruler.before('paragraph')`).
- `createMd({ useAnchor, useLinkOpen, mermaidSanitize })`.

## 11. Tests

- vitest + jsdom + @testing-library/svelte, under `client/tests/`.
- `vitest.config.js`: adds `'browser'` to `resolve.conditions` (**required to prevent Svelte5's `mount` from resolving to the server entry**). `environment: 'jsdom'`, `setupFiles: tests/setup.js` (ResizeObserver polyfill / fetch reset / cleanup).
- ECharts is `vi.mock('echarts')` in tests.
- Covers: markdown-render (fences/containers/tags/escaping), query-context (runQuery/params/applyParams), Query/Script/ParamInput/Form/FrontmatterImport/std components, hydrate (hydration/auto/container).
- Test widget: `tests/TestWidget.svelte` (for verifying `registerHydratable`).

## 12. Known pitfalls

- Respect the `:run`/`:show` fence convention. Bare ` ```sql `/` ```javascript ` are display-only.
- Numbers and checkboxes are stored in `params` as strings. In SQL use `WHERE price >= {min_price}` **without quotes** for numbers, and `'{name}'` **with quotes** for strings.
- Scripts execute arbitrary code. **Assumes only trusted editors.**
- When adding a container (Form), always register it with `{ container: true }` and understand hydrate's container handling.
- Script shared execution uses **`with` + Proxy only inside a non-strict `new Function` body**. `"use strict"` is removed by precompile. **Never use `with` in app/module code.**
- Declaring a helper name (`output`/`runQuery`, etc.) at the top level of a Script block shadows the helper in the shared scope (reserved-name behavior).
- `@babel/parser` is dynamically imported (kept out of the main bundle; loaded on first Script run).

## 13. Importing front matter / CSV into DuckDB (`:::import`, an SQL-flavored Dataview)

Declaring "use this markdown" in the page imports it into DuckDB on the spot:

```md
:::import knowledge/demo-data as demodb
:::

```sql:run projects
SELECT path, title, data->>'status' AS status, data->>'owner' AS owner
FROM demodb WHERE data->>'type' = 'project'
```
```

- Mechanism:
  1. `:::import path [as name]` container → `<div data-hydrate="FrontmatterImport">` (`mdxContainer` in markdown-render)
  2. **`hydrate()` completes the import before mounting** (awaits the FrontmatterImport placeholder's `POST /api/frontmatter/import`). This ordering guarantee prevents auto-run queries from running before the table exists.
  3. Server `importFrontmatter()`: resolve path (`splitRootPath`) → recursively collect `.md`/`.mmd` (excluding `node_modules`/`.git`/`dist`/`.trash`) → parse front matter with `matter()` → `CREATE OR REPLACE TABLE` in the shared DuckDB (prepared statements).
  4. `FrontmatterImport.svelte` only displays the result (`_imported` prop).
- Schema: `path, root, name, title, mtime, size, data` (`data` is the full front matter as a JSON string)
  - Arbitrary props: `data->>'key'` / `json_extract_string(data, '$.key')` (DuckDB VARCHAR JSON operations).
- **CSV**: `:::import file.csv [as name]` imports the file as-is via `read_csv_auto` (types inferred by DuckDB). A single non-`.md` file produces an `unsupported file type` error. The return value's `kind: 'csv'` / `'frontmatter'` switches the display unit (rows/pages).
- Re-import is idempotent (`CREATE OR REPLACE`). Hydrate re-imports on every page view, so it stays current.

## 14. Standard library (`Tablarium` / `Legion`)

An API standard library usable inside `js:run` scripts.

- **`src/libs/std.js`** (framework-agnostic, plain ESM, fetch-based)
  - `Tablarium`: `knowledge` (reuses `knowledge-api.js`), `query.run(sql, {language, attach})`, `query.importFrontmatter(path, as)`, `collab.config()`, `auth.me()`
  - `Legion`: `auth.me()`, `personas.list()`, `roles.list()`, `supervisor.{status,start,stop,restart,logs,startCoding}`, `tasks.{list,get}`, `mailbox.{graph,messages}`, `logs.{list,get}`, `chat.{send,history}`, `instruction.{send,history}`
  - `configure({ tablariumBase, legionBase, credentials })`: changes the base URL. Defaults to the same-origin `/api`
- **`src/libs/script-helpers.js`**: `registerScriptHelper(name, value)` / `getScriptHelpers()`. `Script.svelte` merges `...getScriptHelpers()` into the run scope each time.
- **`extensions.js`** registers `Tablarium` / `Legion` by **default** (the name is decided here; adding/overriding also happens here).
- **Legion is a different origin** (web-ui). To use it from the wiki, call `configure({ legionBase })` and set up CORS (credentials) on the target side. Plugins/apps can import `std.js` directly and set the base via `configure()`.
