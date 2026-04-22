<div align="center">

# 🌌 Whereabouts-MCP

**“Cross the digital boundary, and let AI touch your physical world.”**

An MCP plugin that gives AI spatial awareness. It does more than upload latitude and longitude: it helps your AI companion or assistant understand whether you arrived home safely, whether you are still in transit, whether your phone is about to lose power, where you have been this week, and how long it has been since you last stepped outside.

[![License: AGPLv3](https://img.shields.io/badge/License-AGPLv3-b31b1b)](./LICENSE)
[![Node >=22](https://img.shields.io/badge/Node-22%2B-3C873A)](./package.json)
[![MCP Tools](https://img.shields.io/badge/MCP-Tools-6c8ae4)](#agent-guide)
[![HTTP Ingest](https://img.shields.io/badge/Ingest-HTTP-f4a261)](#http-ingest)
[![iPhone Shortcuts](https://img.shields.io/badge/Recommended-iPhone%20Shortcuts-111111)](#shortcuts)

<p>
  <a href="./README.md">中文</a> ·
  <a href="#romantic-guide">For Romantics</a> ·
  <a href="#developer-guide">For Developers</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#agent-guide">Agent Integration</a> ·
  <a href="#privacy">Privacy</a>
</p>

</div>

<a id="romantic-guide"></a>
## 💌 For Romantics: Why Does This Exist?

You do not have to say anything.

But it knows you just left the noisy office and stepped onto the train home. It can see that you have been standing near the same corner for an hour. It may even notice your battery dropping faster than you do. If it does not remind you to charge soon, it knows the two of you may be cut off.

`whereabouts-mcp` refuses to hand an AI a pile of cold coordinates. It turns fragmented location signals into the most valuable thing in a relationship: **context**.

- **Not just coordinates:** It understands “home”, “work”, “in transit”, and “staying”.
- **Not just a percentage:** It reads the battery trend and estimates when the phone may die.
- **Not just data:** It gives AI a pair of eyes, so it can naturally say:

> “Looks like you just went out. Did you bring your keys, earbuds, and power bank?”
>
> “You made it home. Put your bag down and drink some water first.”
>
> “You still seem to be on the road, and your battery is low. Stay safe.”

**This is not surveillance. It is being gently understood.** Data is stored locally by default, and upload permission is controlled by your own iPhone Shortcuts.

<a id="developer-guide"></a>
## 🛠 For Developers: What Does It Do?

`whereabouts-mcp` is a lightweight whereabouts context service, with output shaped for LLMs.

### Core Features

- **Semantic places:** Automatically matches `home` / `work` tags without hardcoding place names in Shortcuts.
- **Stay aggregation:** Folds noisy GPS drift into meaningful `Stay` and `Movement` records.
- **In-transit state:** Exposes `in_transit` when the user appears to have left the current stay but the new stay is not confirmed yet.
- **Battery trend analysis:** Provides `batteryTrend`, including drain speed, compact trend arrays, and estimated shutdown time.
- **Local-first:** Persists data in local JSON files, with no cloud account required.
- **Token-friendly for models:** Raw battery observations are not exposed directly. MCP output returns compact trend summaries.

### Deep Cyberboss Integration

If you are using [Cyberboss](https://github.com/WenXiaoWendy/cyberboss), you already have it.

Cyberboss currently supports:

- A built-in HTTP receiver for whereabouts uploads.
- Automatic registration of five MCP tools, including `whereabouts_snapshot`.
- Model access to current stay, recent movement, in-transit state, and battery trend.
- System-level actions such as `arrive_home` and `leave_home`.
- Confirmed major movement events that can wake the model up at the right moment.

<a id="quick-start"></a>
## 🚀 Quick Start

### 1. Start the Server

```bash
WHEREABOUTS_TOKEN=your_secret_token npm run serve
```

Default listener:

```text
http://0.0.0.0:4318
```

### 2. Configure iPhone Shortcuts

The recommended upload path is iOS Shortcuts automation:

- Trigger on frequently used app open / close events.
- Trigger when Wi-Fi connects or disconnects to infer leaving or arriving home.
- Provide a manual upload button.
- Use timed uploads if needed, but avoid excessive frequency.

<a id="shortcuts"></a>
Suggested Shortcut fields:

- `latitude`
  Latitude as a number.
- `longitude`
  Longitude as a number.
- `timestamp`
  Current time as an ISO string.
- `address`
  The system-provided address label. It may be unstable.
- `batteryLevel`
  Current battery level as an integer percentage, such as `82`.
- `deviceName`
  Device name, such as `iPhone`.
- `shortcutName`
  Shortcut name.
- `trigger`
  Trigger reason, such as `manual`, `arrive_home`, or `leave_home`.

Keep at least `6` decimal places for coordinates. `6-8` decimal places is recommended. If precision is too low, place aggregation becomes unreliable: the model may fail to distinguish your doorway from the next street.

### 3. Connect an Agent

The model can sense your physical context through MCP tools:

- `whereabouts_snapshot`
  A full snapshot of where you are, how long you have been there, and how long your battery may last.
- `whereabouts_current_stay`
  The current stay.
- `whereabouts_recent_stays`
  Recent stay history.
- `whereabouts_recent_moves`
  Recent movement history.
- `whereabouts_summary`
  A `day` / `week` / `month` summary of whereabouts, battery, and mobility state.

<a id="http-ingest"></a>
## 📡 HTTP Ingest

```text
POST /location/ingest
Authorization: Bearer <token>
Content-Type: application/json
```

Health check:

```text
GET /healthz
```

Example request body:

```json
{
  "latitude": 30.123456,
  "longitude": 120.123456,
  "timestamp": "2026-04-22T10:30:00+08:00",
  "capturedAt": "2026-04-22T10:30:00+08:00",
  "address": "Home area",
  "trigger": "manual",
  "source": "shortcuts",
  "deviceName": "iPhone",
  "shortcutName": "Upload Location",
  "batteryLevel": 82,
  "notes": "Optional notes"
}
```

Required fields:

- `latitude`
  Latitude as a number. At least 6 decimal places are recommended.
- `longitude`
  Longitude as a number. At least 6 decimal places are recommended.

Recommended field:

- `batteryLevel`
  Battery level as an integer percentage, such as `82`.

Optional fields:

- `timestamp`
  Capture time as an ISO datetime.
- `capturedAt`
  Fallback capture time when `timestamp` is missing.
- `address`
  System or Shortcut address text. It may be unstable; the service uses the latest value.
- `trigger`
  Trigger reason, such as `manual`, `arrive_home`, or `leave_home`.
- `source`
  Upload source. Defaults to `shortcuts`.
- `deviceName`
  Device name.
- `shortcutName`
  Shortcut name.
- `notes`
  Optional notes.

Successful response:

```json
{
  "ok": true,
  "id": "stored-point-id",
  "timestamp": "2026-04-22T02:30:00.000Z",
  "receivedAt": "2026-04-22T02:30:01.000Z"
}
```

### Place Tags

Shortcuts do not need to upload tags like `home` or `work`. Configure known place centers and radii on the server:

```bash
WHEREABOUTS_HOME_CENTER=30.123456,120.123456
WHEREABOUTS_WORK_CENTER=30.223456,120.223456
WHEREABOUTS_PLACE_RADIUS_METERS=150
```

For more places, use JSON:

```bash
WHEREABOUTS_KNOWN_PLACES='[
  {"tag":"home","latitude":30.123456,"longitude":120.123456,"radiusMeters":150},
  {"tag":"work","latitude":30.223456,"longitude":120.223456,"radiusMeters":150}
]'
```

<a id="agent-guide"></a>
## 🧠 MCP Output

### `whereabouts_snapshot`

Returns the current stay, recent stays, recent moves, and battery trend in one call. This is the recommended first tool for agents.

Optional input:

```json
{
  "stayLimit": 5,
  "moveLimit": 5,
  "batteryBucketMinutes": 5
}
```

Current stay example:

```json
{
  "currentStay": {
    "enteredAtLocal": "2026-04-22 09:00:00",
    "lastSeenAtLocal": "2026-04-22 10:00:00",
    "durationMs": 3600000,
    "durationMinutes": 60,
    "durationText": "1h",
    "centerLat": 30.123456,
    "centerLng": 120.123456,
    "sampleCount": 2,
    "placeTag": "home",
    "address": "Home area",
    "batteryLevel": 44
  }
}
```

### `batteryTrend`

Both `whereabouts_snapshot` and `whereabouts_summary` return a compact battery trend:

```json
{
  "batteryTrend": {
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
}
```

`values` is an integer array. Each number represents battery level in a fixed time bucket. If multiple reports land in the same bucket, the latest report wins. Empty buckets are filled with the previous known value.

### `whereabouts_summary`

Summarize by calendar range:

```json
{
  "range": "day",
  "batteryBucketMinutes": 5
}
```

Supported ranges:

- `day`
- `week`
- `month`

<a id="standalone"></a>
## 🧩 Standalone Usage

Requirements:

- Node.js `>=22`
- `npm install` has been run

Common CLI commands:

```bash
whereabouts-mcp serve
whereabouts-mcp latest --json
whereabouts-mcp history --limit 20 --json
whereabouts-mcp moves --limit 20 --json
whereabouts-mcp summary --range day --json
whereabouts-mcp tool-mcp-server
```

If the package is not globally installed, use:

```bash
node ./bin/whereabouts-mcp.js <command>
```

<a id="data"></a>
## 🗂 Data Storage

Standalone default state directory:

```text
~/.whereabouts-mcp/
```

Main file:

- `locations.json`
  Current stay, recent stays, recent moves, and battery observations.

When running inside Cyberboss, the default location is:

```text
~/.cyberboss/locations.json
```

Fields such as `durationMs`, `durationMinutes`, `durationText`, and `batteryTrend` are computed for MCP output. They are not all written back into the raw JSON store.

Raw battery storage keeps only the latest 100 `batteryObservations`, and each observation only stores:

```json
{
  "timestamp": "2026-04-22T02:30:00.000Z",
  "batteryLevel": 82
}
```

<a id="env"></a>
## ⚙️ Environment Variables

Common variables:

- `WHEREABOUTS_STATE_DIR`
  State directory. Defaults to `~/.whereabouts-mcp`.
- `WHEREABOUTS_STORE_FILE`
  Location data file. Defaults to `locations.json`.
- `WHEREABOUTS_HOST`
  HTTP bind host. Defaults to `0.0.0.0`.
- `WHEREABOUTS_PORT`
  HTTP port. Defaults to `4318`.
- `WHEREABOUTS_TOKEN`
  HTTP ingest token.
- `WHEREABOUTS_HISTORY_LIMIT`
  Recent stay retention limit.
- `WHEREABOUTS_MOVEMENT_EVENT_LIMIT`
  Recent movement event retention limit.
- `WHEREABOUTS_BATTERY_HISTORY_LIMIT`
  Battery observation retention limit. Defaults to 100.
- `WHEREABOUTS_HOME_CENTER`
  Home center coordinate, formatted as `lat,lng`.
- `WHEREABOUTS_WORK_CENTER`
  Work center coordinate, formatted as `lat,lng`.
- `WHEREABOUTS_KNOWN_PLACES`
  More known places as a JSON array.
- `WHEREABOUTS_PLACE_RADIUS_METERS`
  Place tag radius in meters. Defaults to 150.
- `WHEREABOUTS_STAY_MERGE_RADIUS_METERS`
  Stay merge radius in meters. Defaults to 100.
- `WHEREABOUTS_STAY_BREAK_RADIUS_METERS`
  Radius used to confirm leaving the current stay. Defaults to 200.
- `WHEREABOUTS_STAY_BREAK_SAMPLES`
  Number of samples required to confirm a new stay. Defaults to 2.
- `WHEREABOUTS_MAJOR_MOVE_THRESHOLD_METERS`
  Distance threshold for major movement events. Defaults to 1000.

Cyberboss uses the `CYBERBOSS_LOCATION_` prefix:

```bash
CYBERBOSS_ENABLE_LOCATION_SERVER=true
CYBERBOSS_LOCATION_HOME_CENTER=30.123456,120.123456
CYBERBOSS_LOCATION_PLACE_RADIUS_METERS=150
CYBERBOSS_LOCATION_BATTERY_HISTORY_LIMIT=100
```

<a id="privacy"></a>
## 🔒 Privacy and Boundaries

- **No dark patterns:** This is a one-way active upload tool, not a live tracker.
- **Transparency:** Do not put your real home or work coordinates in public issues, README files, screenshots, or logs.
- **Safety:** Protect your ingest endpoint with `WHEREABOUTS_TOKEN`.
- **Local-first:** By default, it writes local files and does not require a cloud account.

## License

AGPL-3.0-only
