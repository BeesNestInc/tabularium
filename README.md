# Tabularium

Tabularium is a knowledge base server with a built-in single-page application.
It exposes filesystem directories as a REST API and provides a browser interface for browsing and editing.

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

- [API Reference](@documents/api.md)
- [Configuration](@documents/configuration.md)
- [Dependencies](@documents/dependencies.md)
- [Usage Guide](@documents/usage.md)

## Languages

| Locale | Language | Auto-detection |
|--------|----------|----------------|
| `en`   | English (default) | `Accept-Language: en` |
| `ja`   | 日本語 | `Accept-Language: ja` |
| `zh`   | 简体中文 | `Accept-Language: zh` |

See [Adding a language](@documents/configuration.md#adding-a-language).

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
│       ├── libs/         #   Client libraries (i18n, etc.）
│       ├── lib/          #   SPA internal libraries
│       └── components/
├── @documents/           # Documentation
├── public/               # SPA build output
└── package.json
```

## License

AGPL-3.0-or-later
