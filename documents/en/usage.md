# Usage Guide

## Installation

```bash
git clone https://github.com/BeesNestInc/tabularium.git
cd tabularium
npm run setup
```

This runs: `npm install` (server) → `cd client && npm install` (SPA) → `npm run build` (SPA build).

## Starting the Server

```bash
npm start
```

Open http://localhost:8888 in your browser.

## Building the SPA

```bash
npm run build
```

Output goes to `public/`. The SPA must be built before the server can serve it.

## Collabora Online (Office Editing)

Tabularium can integrate with Collabora Online to edit Office documents (`.docx`, `.xlsx`, `.pptx`) directly in the browser.

### Setup

Install Podman or Docker, then:

```bash
# Start the Collabora container
node server/collabora.js start

# Check status
node server/collabora.js status

# View logs
node server/collabora.js logs

# Stop
node server/collabora.js stop
```

### Configuration

Set in `.env`:

```env
WOPI_SRC=http://your-host:8888
COLLABORA_SERVER_NAME=your-host:9980
```

Optional admin credentials:

```env
COLLABORA_USERNAME=admin
COLLABORA_PASSWORD=secret
```

## SQL Execution

Files with frontmatter can execute DuckDB or PostgreSQL queries inline.

### Example page

```markdown
---
engine: duckdb
databases:
  pg: postgres://user:pass@host/db
---

## Sales Report

```sql
SELECT product, SUM(amount) FROM sales GROUP BY product
```

```

Click **▶ Run** on any SQL block to execute. Supported languages:

| Front matter `engine` | Languages |
|---|---|
| `duckdb` or unset | `sql`, `duckdb` |
| `postgresql` or `pg` | `postgresql`, `pg` |

The `databases` field maps alias names to PostgreSQL connection strings for cross-engine queries.

## Multi-Root

Tabularium can combine multiple directories into a single tree:

```env
KNOWLEDGE_ROOTS='[
  {"name":"wiki","path":"/path/to/knowledge"},
  {"name":"docs","path":"./workspace/docs"}
]'
```

Roots can also be added at runtime via the SPA settings dialog or the API.
They are persisted in `roots.json`.

## Bookmarks

Drag and drop a URL onto the content pane to add it as a bookmark.
Bookmarks are stored in `.bookmarks/bookmarks.yaml` within the target directory.
Favicons and OG image thumbnails are fetched automatically.

## Calendar

Files with `.ical` or `.mycal` extension are rendered as interactive calendars.
Supported features:
- Month, week, day views
- Recurring events (rrule)
- ICS import/export
- Multi-calendar overlay
- Drag-and-drop event rescheduling
