# Tabularium

Tabularium is an open, file-based knowledge workspace for humans and AI.
It brings Markdown, spreadsheets, calendars, Office documents, diagrams, bookmarks, and data analytics into a unified browser interface.

## Quick start

```bash
git clone https://github.com/BeesNestInc/tabularium.git
cd tabularium
npm run setup
npm start
```

Open http://localhost:8888.

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

## Documentation

- [API Reference](documents/en/api.md)
- [Configuration](documents/en/configuration.md)
- [Dependencies](documents/en/dependencies.md)
- [Usage Guide](documents/en/usage.md)

## Languages

| Locale | Language | Auto-detection |
|--------|----------|----------------|
| `en`   | English (default) | `Accept-Language: en` |
| `ja`   | [日本語](README_ja.md) | `Accept-Language: ja` |
| `zh`   | [简体中文](README_zh.md) | `Accept-Language: zh` |

See [Adding a language](documents/en/configuration.md#adding-a-language).

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
├── documents/            # Documentation (en/ja)
├── public/               # SPA build output + draw.io static files
└── package.json
```

## License

AGPL-3.0-or-later

This software bundles [draw.io](https://github.com/jgraph/drawio) (AGPL-3.0) for diagram editing.
