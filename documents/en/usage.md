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

## Authentication

Tabularium has a built-in multi-user authentication system based on session cookies.

### First-Time Setup

The first user to sign up automatically becomes **admin**. Subsequent users get the **user** role.

1. Open Tabularium in your browser
2. You will see the login page
3. Click **Sign Up** and create the first account
4. You are now logged in as admin

### User Management

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/signup` | POST | No | Create a new user. First user becomes admin. |
| `/api/auth/login` | POST | No | Log in with `loginId` and `password`. Returns a session cookie. |
| `/api/auth/logout` | POST | Yes | Destroy the current session. |
| `/api/auth/me` | GET | Yes | Returns the current user's profile. |
| `/api/auth/change-password` | POST | Yes | Change password. Requires `currentPassword` and `newPassword`. |
| `/api/auth/users` | GET | Admin | List all users. |

### Session

Authentication uses `@fastify/secure-session` with encrypted, httpOnly, sameSite=Lax cookies.
The session key is either set via `WIKI_SESSION_KEY` env var or auto-generated on each restart
(auto-generation invalidates all sessions on restart).

The session cookie expires after 7 days by default.

### User Database

User accounts are stored in a JSON file at `./data/tabularium.json` by default.
The path can be changed with the `USER_DB_URL` environment variable.

```env
USER_DB_URL=/path/to/users.json
```

### Legion Integration

When Tabularium runs as part of [Legion](https://github.com/BeesNestInc/legion), authentication
is handled by Legion's own auth system. Tabularium's login page and user menu are automatically
hidden. The SPA still uses `/api/auth/me` to determine the current user, but user management
(signup, password change) goes through Legion's interface.

### WOPI / Collabora

When a user opens an Office document, Tabularium generates a short-lived (5-minute) signed access
token for the Collabora Online iframe. The token is created via `HMAC-SHA256` using the session
key and is bound to the user's `loginId`. No additional WOPI token configuration is needed.

## Building the SPA

```bash
npm run build
```

Output goes to `public/`. The SPA must be built before the server can serve it.

## Collabora Online (Office Editing)

Tabularium can integrate with Collabora Online to edit Office documents (`.docx`, `.xlsx`, `.pptx`) directly in the browser.

### Setup

Install [Podman](https://podman.io), then:

```bash
# Pull the Collabora image
podman pull docker.io/collabora/code

# Start the container
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

`WOPI_SRC` must be a URL reachable from **inside the Collabora container**.
If the container uses `--network host` (the default when started from tabularium),
`http://localhost:8888` works. If the container uses a bridge network, use the
host machine's LAN IP or hostname instead.

`COLLABORA_HOST` can be explicitly set when auto-detection doesn't produce the
correct value (default: derived from the current request's hostname).

Optional admin credentials:

```env
COLLABORA_USERNAME=admin
COLLABORA_PASSWORD=secret
```

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "プロキシの設定が…" / Collabora UI loads but document doesn't render | Container can't reach the WOPI server | Ensure `WOPI_SRC` is set to a hostname reachable from inside the container. Recreate the container: `node server/collabora.js remove && node server/collabora.js start`. Requires [Podman](https://podman.io). |
| "Server not found" when loading the Collabora iframe | Collabora container not running | Check with `node server/collabora.js status`, start with `node server/collabora.js start` |
| Office file opens as blank / download only | File extension not recognized by Collabora | Supported: `.doc`, `.docx`, `.odt`, `.xls`, `.xlsx`, `.ods`, `.ppt`, `.pptx`, `.odp`, `.rtf`, `.csv`, `.txt` |

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
