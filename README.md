# whereabouts-mcp

`whereabouts-mcp` is a small Node.js package that receives location samples, folds them into stays and movement events, and exposes the data through a local HTTP ingest endpoint plus MCP tools.

## What It Does

- accepts location uploads over HTTP
- stores the current stay, recent stays, and recent major moves
- merges nearby samples into the same stay
- waits for multiple off-site samples before breaking a stay
- exposes the data through MCP tools and a small CLI

## CLI

```bash
whereabouts-mcp serve
whereabouts-mcp latest --json
whereabouts-mcp history --limit 20 --json
whereabouts-mcp moves --limit 20 --json
whereabouts-mcp tool-mcp-server
```

## Environment

```bash
WHEREABOUTS_STATE_DIR
WHEREABOUTS_STORE_FILE
WHEREABOUTS_HOST
WHEREABOUTS_PORT
WHEREABOUTS_TOKEN
WHEREABOUTS_HISTORY_LIMIT
WHEREABOUTS_MOVEMENT_EVENT_LIMIT
WHEREABOUTS_STAY_MERGE_RADIUS_METERS
WHEREABOUTS_STAY_BREAK_RADIUS_METERS
WHEREABOUTS_STAY_BREAK_SAMPLES
WHEREABOUTS_MAJOR_MOVE_THRESHOLD_METERS
```

## HTTP Endpoint

```text
POST /location/ingest
Authorization: Bearer <token>
GET /healthz
```

## MCP Tools

- `whereabouts_snapshot`
- `whereabouts_current_stay`
- `whereabouts_recent_stays`
- `whereabouts_recent_moves`
- `whereabouts_ingest_point`
