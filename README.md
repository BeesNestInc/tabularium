# Tabularium

Tabularium is a knowledge base server with a built-in single-page application.
It exposes filesystem directories as a REST API and provides a browser interface for browsing and editing.

## Features

- **Knowledge API**: file tree browsing, Markdown/file viewing and editing
- **Multi-root**: combine multiple directories into a single tree
- **SQL execution**: inline DuckDB / PostgreSQL query execution
- **Markdown rendering**: Prism.js syntax highlighting, Mermaid diagrams
- **draw.io editing**: edit diagrams in the browser, export SVG
- **CSV**: edit spreadsheets inline
- **WOPI integration**: edit Office documents via Collabora Online
- **Bookmarks**: save URLs with automatic favicon/OGP thumbnail fetching
- **Calendar**: view and edit iCal/YAML calendar files

## Languages

The UI language is auto-detected from the browser's `Accept-Language` header
(server) and `navigator.language` (client). The server default can be overridden
via the `LANG` environment variable.

| Locale | Language |
|--------|----------|
| `en`   | English (default) |
| `ja`   | 日本語 |
| `zh`   | 简体中文 |

### Adding a language

**Server side**:
1. Copy `server/libs/locales/en.json` to `server/libs/locales/{lang}.json` and translate
2. Add `loadLocale('{lang}');` in the preload section of `server/libs/i18n.js`

**Client side**:
1. Add a translation object to `client/src/libs/i18n.js`
2. Register it in the `dicts` object

## Installation

```bash
git clone https://github.com/BeesNestInc/tabularium.git
cd tabularium
npm run setup
```

`npm run setup` runs:
- `npm install` — server dependencies
- `cd client && npm install` — SPA dependencies
- `npm run build` — builds the SPA into `public/`

### Individual commands

```bash
npm install        # server dependencies only
npm run build      # build the SPA only
```

## Usage

```bash
npm start
```

The server listens on port `8888` by default. Open http://localhost:8888 in your browser.

## Configuration

Environment variables (`.env` file or system env):

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `8888` |
| `HOST` | Bind address | `0.0.0.0` |
| `KNOWLEDGE_ROOTS` | Root directories (JSON array) | falls back to `KNOWLEDGE_BASE` |
| `KNOWLEDGE_BASE` | Single root path (fallback) | `./knowledge` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `PG_CONNECT_STRING` | DuckDB ATTACH libpq-style connection string | - |
| `WOPI_SRC` | WOPI server base URL | `http://localhost:8888` |
| `COLLABORA_HOST` | Collabora Online host | `http://localhost:9980` |
| `COLLABORA_ENGINE` | Container engine (podman/docker) | auto-detect |

### Root configuration example

```env
KNOWLEDGE_ROOTS='[{"name":"wiki","path":"/path/to/knowledge"},{"name":"docs","path":"./workspace/docs"}]'
```

## Project structure

```
tabularium/
├── server/               # Server-side (Node.js + Fastify)
│   ├── index.js          #   Entry point
│   ├── wopi.js           #   WOPI protocol routes
│   ├── collabora.js      #   Collabora container management
│   └── libs/             #   Server libraries
│       ├── knowledge-routes.js
│       ├── bookmarks.js
│       ├── i18n.js
│       └── locales/      #   Translation files (en/ja/zh)
├── client/               # SPA (Svelte + Vite)
│   ├── wiki.html
│   └── src/
│       ├── pages/Knowledge.svelte
│       ├── libs/         #   Client libraries (i18n, etc.)
│       ├── lib/          #   SPA internal libraries
│       └── components/
├── public/               # SPA build output
└── package.json
```

## License

AGPL-3.0-or-later
