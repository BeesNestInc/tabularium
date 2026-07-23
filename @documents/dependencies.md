# Dependencies

## Runtime

- **Node.js** 20+ (ESM)

## Server

| Library | Purpose |
|---|---|
| **Fastify** 5 | HTTP server framework |
| **@fastify/static** | Static file serving for the SPA |
| **DuckDB** 1.4 | In-memory SQL engine |
| **node-postgres (pg)** 8 | PostgreSQL client |
| **dotenv** | `.env` file loading |
| **yaml** (js-yaml) | YAML parsing for frontmatter and bookmarks |

## Client (SPA)

| Library | Purpose |
|---|---|
| **Svelte** 5 | UI framework |
| **Vite** 7 | Build tool |
| **FullCalendar** 6 | Calendar view |
| **ECharts** 5 | Charts |
| **CodeMirror** 6 | Code/markdown editor |
| **markdown-it** 14 | Markdown rendering |
| **PrismJS** 1 | Syntax highlighting |
| **yaml** (js-yaml) | YAML parsing |
| **jSpreadsheet** | CSV spreadsheet editing |
| **ical.js** | iCal file parsing |
| **uuid** | ID generation |

## Infrastructure (Optional)

| Software | Purpose |
|---|---|
| **Collabora Online** | Office document editing via WOPI protocol |
| **Podman** or **Docker** | Container runtime for Collabora Online |
