# API Reference

Base URL: `http://localhost:{PORT}` (default `8888`)

---

## Knowledge API

### GET `/api/knowledge`

List files in a directory or show the root tree.

| Query | Type | Description |
|---|---|---|
| `path` | string | Directory path (omit for root tree) |
| `showHidden` | boolean | Show files starting with `.` |

**Response (root tree):** list of root directories
**Response (directory):** directory stat + child entries

### GET `/api/knowledge/page`

Get file or directory details with index content.

| Query | Type | Description |
|---|---|---|
| `path` | string | **Required.** File or directory path |
| `showHidden` | boolean | Show hidden files |

**Response (directory):** entries list + rendered `index.md` if present
**Response (file):** file metadata + file URL

### GET `/api/knowledge/raw/*`

Read file content as plain text.

**Response:** `{ content, path, size, mtime }`

### PUT `/api/knowledge/raw/*`

Write file content.

**Request body:** `{ content: "..." }`

**Response:** `{ ok: true }`

### DELETE `/api/knowledge/raw/*`

Delete a file or directory.

**Response:** `{ ok: true }`

### POST `/api/knowledge/create/*`

Create a new file. Optionally uses a template based on file extension.

**Response:** `{ ok: true, path }`

### POST `/api/knowledge/mkdir/*`

Create a new directory.

**Response:** `{ ok: true, path }`

### POST `/api/knowledge/move`

Move or rename a file.

**Request body:** `{ from: "...", to: "..." }`

**Response:** `{ ok: true, from, to }`

### GET `/api/knowledge/file/*`

Serve a file as binary data (images, PDFs, etc.) with automatic MIME type detection.

| Query | Type | Description |
|---|---|---|
| `dl` | `1` | Force download with `Content-Disposition: attachment` |

### GET `/api/knowledge/info`

Get file metadata including frontmatter.

| Query | Type | Description |
|---|---|---|
| `path` | string | **Required.** File or directory path |

**Response:** `{ type, path, size, mtime, birthtime, frontmatter? }`

---

## Root Management

### GET `/api/knowledge/roots`

List all configured roots with accessibility status.

### POST `/api/knowledge/roots`

Add a new root.

**Request body:** `{ name: "...", path: "..." }`

**Response:** `{ ok: true, roots: [...] }`

### PUT `/api/knowledge/roots`

Replace all roots (overrides persisted set, env roots are preserved).

**Request body:** `{ roots: [{ name, path }, ...] }`

### DELETE `/api/knowledge/roots/:name`

Remove a root (only runtime-added roots; env-configured roots cannot be removed).

---

## Query Execution

### POST `/api/execute`

Execute SQL queries against DuckDB (in-memory) or PostgreSQL.

**Request body:**

```json
{
  "language": "sql" | "duckdb" | "postgresql" | "pg",
  "code": "SELECT * FROM table",
  "attach": { "alias": "connection_string" }
}
```

The `attach` field attaches PostgreSQL databases to DuckDB for cross-engine queries.
Connection strings default to `PG_CONNECT_STRING` or `DATABASE_URL` env variables.

**Response:** `{ columns: [...], rows: [...], rowCount: N, duration: N }`

---

## Bookmarks

### GET `/api/knowledge/bookmarks`

| Query | Type | Description |
|---|---|---|
| `path` | string | **Required.** Folder path |

### POST `/api/knowledge/bookmarks`

Add a bookmark.

**Request body:** `{ path, title, url }`

### PATCH `/api/knowledge/bookmarks`

Update a bookmark.

**Request body:** `{ path, oldUrl, newTitle?, newUrl? }`

### DELETE `/api/knowledge/bookmarks`

Remove a bookmark.

**Request body:** `{ path, url }`

### GET `/api/knowledge/page-title`

Fetch the `<title>` of a remote URL.

| Query | Type | Description |
|---|---|---|
| `url` | string | **Required.** Remote URL |

---

## Collabora Online

### GET `/api/collabora/status`

Container status.

### POST `/api/collabora/start`

Start the Collabora Online container.

### POST `/api/collabora/stop`

Stop the container.

### GET `/api/collabora/logs?lines=50`

Container logs.

### GET `/api/collabora/config`

WOPI/Collabora configuration URLs.

---

## WOPI Protocol

### GET `/hosting/discovery`

WOPI discovery XML for Collabora Online integration.

### GET `/wopi/files/:fileId`

WOPI `CheckFileInfo` — returns file metadata for the Collabora editor.

### GET `/wopi/files/:fileId/contents`

WOPI `GetFile` — returns raw file content.

### POST `/wopi/files/:fileId/contents`

WOPI `PutFile` — saves edited content back to the file.

---

## Fake Auth (for SPA)

| Endpoint | Response |
|---|---|
| `GET /api/auth/me` | `{ user: { id: 'wiki', name: 'Wiki', role: 'admin' } }` |
| `POST /api/auth/login` | `{ ok: true }` |
| `POST /api/auth/logout` | `{}` |
