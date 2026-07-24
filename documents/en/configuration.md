# Configuration

## Environment Variables

All configuration is done through environment variables. These can be set in a `.env` file (at the project root or `server/.env`) or in the system environment.

### Authentication

| Variable | Default | Description |
|---|---|---|
| `WIKI_SESSION_KEY` | auto-generated | Secret key for session cookie encryption. Generate once: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. If not set, a random key is generated on each restart (invalidates all sessions). |
| `USER_DB_URL` | `./data/tabularium.json` | Path to the user database file. Stored as JSON, one file per environment. |

### Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8888` | HTTP server port |
| `HOST` | `0.0.0.0` | Bind address |
| `LANG` | `en` | Default locale for API error messages |

### Knowledge Base

| Variable | Default | Description |
|---|---|---|
| `KNOWLEDGE_ROOTS` | — | JSON array of root directories (`[{name, path}]`) |
| `KNOWLEDGE_BASE` | `./knowledge` | Single root path (fallback when `KNOWLEDGE_ROOTS` is not set) |

Example `KNOWLEDGE_ROOTS`:

```env
KNOWLEDGE_ROOTS='[{"name":"wiki","path":"/path/to/knowledge"},{"name":"docs","path":"./workspace/docs"}]'
```

### Database

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string (postgres:// or libpq format) |
| `PG_CONNECT_STRING` | — | libpq-style connection string for DuckDB ATTACH |

### Collabora Online

| Variable | Default | Description |
|---|---|---|
| `WOPI_SRC` | — | WOPI server base URL (must be reachable from inside the container) |
| `COLLABORA_HOST` | auto | Collabora Online host |
| `COLLABORA_BROWSER_PATH` | `/browser/de013a57f9/cool.html` | Collabora browser client path |
| `COLLABORA_ENGINE` | `podman` | Container engine (only Podman is supported) |
| `COLLABORA_IMAGE` | `docker.io/collabora/code` | Container image |
| `COLLABORA_CONTAINER_NAME` | `legion-cool` | Container name |
| `COLLABORA_PORT` | `9980:9980` | Port mapping |
| `COLLABORA_USERNAME` | — | Admin console username |
| `COLLABORA_PASSWORD` | — | Admin console password |
| `COLLABORA_SERVER_NAME` | — | Server hostname:port |

### Draw.io

| Variable | Default | Description |
|---|---|---|
| `DRAWIO_URL` | `/drawio` | draw.io editor URL. Default uses built-in static files served by Tabularium. Set to `https://embed.diagrams.net` to use the cloud version, or `http://localhost:8080` for a self-hosted instance. |
| `COLLABORA_EXTRA_ARGS` | — | Extra command-line arguments for container engine |

## Root Persistence

Roots added via the API at runtime are persisted in `roots.json` at the project root.
Environment-configured roots (`KNOWLEDGE_ROOTS`) cannot be removed via the API — only runtime-added roots can.
