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
whereabouts-mcp summary --range day --json
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
WHEREABOUTS_SAMPLE_LIMIT
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

`POST /location/ingest` accepts a JSON object:

```json
{
  "latitude": 22.6,
  "longitude": 114.0,
  "timestamp": "2026-04-22T10:30:00+08:00",
  "capturedAt": "2026-04-22T10:30:00+08:00",
  "address": "Optional address label",
  "trigger": "manual",
  "source": "shortcuts",
  "deviceName": "iPhone",
  "shortcutName": "Upload Location",
  "placeId": "home",
  "placeLabel": "Home",
  "batteryLevel": 0.82,
  "notes": "Optional notes"
}
```

Required fields:

- `latitude`: number
- `longitude`: number

Optional fields:

- `timestamp`: ISO datetime for when the sample was captured
- `capturedAt`: fallback ISO datetime when `timestamp` is not present
- `address`: human-readable location label
- `trigger`: event label such as `manual`, `arrive_home`, or `leave_home`
- `source`: producer label, defaults to `shortcuts`
- `deviceName`: reporting device name
- `shortcutName`: iOS Shortcut name
- `placeId`: stable normalized place id such as `home` or `work`
- `placeLabel`: human-friendly normalized place label
- `batteryLevel`: number
- `notes`: free-form notes

Successful response:

```json
{
  "ok": true,
  "id": "stored-point-id",
  "timestamp": "2026-04-22T02:30:00.000Z",
  "receivedAt": "2026-04-22T02:30:01.000Z"
}
```

## MCP Tools

- `whereabouts_snapshot`
- `whereabouts_current_stay`
- `whereabouts_recent_stays`
- `whereabouts_recent_moves`
- `whereabouts_summary`

`whereabouts_current_stay`, `whereabouts_recent_stays`, and `whereabouts_snapshot`
include `durationMs`, `durationMinutes`, and `durationText` for stay records.

`whereabouts_summary` accepts:

```json
{
  "range": "day"
}
```

`range` can be `day`, `week`, or `month`. The summary is calendar-based in the
display timezone and includes current mobility state, stay duration, known
places, movement counts, and battery trend when retained raw samples are
available.
