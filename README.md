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
WHEREABOUTS_BATTERY_HISTORY_LIMIT
WHEREABOUTS_KNOWN_PLACES
WHEREABOUTS_HOME_CENTER
WHEREABOUTS_WORK_CENTER
WHEREABOUTS_PLACE_RADIUS_METERS
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
- `batteryLevel`: number
- `notes`: free-form notes

## Known Place Tagging

Shortcut uploads do not need to provide normalized place names. Configure known
place centers on the server and whereabouts will add `placeTag` automatically
when a stay center falls within the configured radius.

Simple center envs:

```bash
WHEREABOUTS_HOME_CENTER=22.63944177344174,114.00687423407666
WHEREABOUTS_WORK_CENTER=22.000000,114.000000
WHEREABOUTS_PLACE_RADIUS_METERS=150
```

Or put JSON in `WHEREABOUTS_KNOWN_PLACES` for more places:

```json
[
  { "tag": "home", "latitude": 22.63944177344174, "longitude": 114.00687423407666, "radiusMeters": 150 },
  { "tag": "work", "latitude": 22.0, "longitude": 114.0, "radiusMeters": 150 }
]
```

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
These duration fields are computed output fields; they are not written back into
the raw `locations.json` store.

`whereabouts_summary` accepts:

```json
{
  "range": "day"
}
```

`range` can be `day`, `week`, or `month`. The summary is calendar-based in the
display timezone and includes current mobility state, stay duration, known
places, movement counts, and battery trend when retained battery observations
are available.

`whereabouts_snapshot` and `whereabouts_summary` include a compact
`batteryTrend`:

```json
{
  "source": "battery_observations",
  "sampleCount": 4,
  "firstLevelPercent": 50,
  "latestLevelPercent": 44,
  "bucketMinutes": 5,
  "seriesStartAtLocal": "2026-04-22 09:00:00",
  "seriesEndAtLocal": "2026-04-22 09:15:00",
  "values": [48, 48, 45, 44],
  "deltaPercent": -6,
  "deltaPerHourPercent": -24,
  "direction": "draining",
  "estimatedMinutesToEmpty": 110,
  "estimatedEmptyAtLocal": "2026-04-22 11:06:00",
  "estimatedEmptyReason": "trend_projection",
  "fillStrategy": "latest_observation_per_bucket_then_carry_forward"
}
```

If several reports land in the same bucket, the latest report in that bucket
wins. Empty buckets are filled with the previous known battery value. Raw
`batteryObservations` stay in storage only, capped at 100 newest-first entries
by default.
