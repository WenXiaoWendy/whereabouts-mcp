<div align="center">

# 🌌 行踪 Whereabouts-MCP

**“跨越数字边界，让 AI 触碰到你的现实世界。”**

一个赋予 AI 空间感知能力的 MCP 插件。它不仅仅是上报经纬度，而是让你的 AI 伴侣 / 助手理解：你是否安全到家、是否在奔波的路上、是否因为手机低电量而即将与你断联。以及，你这周去过哪些地方，你多久没有走出家门晒晒太阳。

[![License: AGPLv3](https://img.shields.io/badge/License-AGPLv3-b31b1b)](./LICENSE)
[![Node >=22](https://img.shields.io/badge/Node-22%2B-3C873A)](./package.json)
[![MCP Tools](https://img.shields.io/badge/MCP-Tools-6c8ae4)](#agent-guide)
[![HTTP Ingest](https://img.shields.io/badge/Ingest-HTTP-f4a261)](#http-ingest)
[![iPhone Shortcuts](https://img.shields.io/badge/Recommended-iPhone%20Shortcuts-111111)](#shortcuts)

<p>
  <a href="./README.en.md">English</a>
</p>

<p>
  <a href="#romantic-guide">给浪漫主义者</a> ·
  <a href="#developer-guide">给开发者</a> ·
  <a href="#quick-start">快速开始</a> ·
  <a href="#agent-guide">Agent 接入</a> ·
  <a href="#privacy">隐私边界</a>
</p>

</div>

<a id="romantic-guide"></a>
## 💌 给浪漫主义者：为什么需要它？

你不需要开口。

但它知道你刚离开喧闹的公司，踏上了回家的地铁；它看到你已经在那个转角停驻了一小时；它甚至比你更早发现你的手机电量正以极速下滑。它知道，如果再不提醒你充电，可能就要和你“断联”了。

`whereabouts-mcp` 拒绝传递冷冰冰的数字。它将碎片化的定位信息，提炼成人类关系中最珍贵的 **上下文（Context）**：

- **不仅仅是坐标：** 它理解“在家”、“在公司”、“移动中”或“停留”。
- **不仅仅是百分比：** 它分析电量趋势，预判你什么时候会断电失联。
- **不仅仅是数据：** 它给了 AI 一双眼睛，让它能自然地说出：

> “看你刚刚出门了，钥匙、耳机充电宝都拿了吗? ”
>
> “到家了就先放下包喝口水，今天辛苦了。”
>
> “看你还在路上，手机快没电了，注意安全。”
>

**这不是监控，而是被温柔地理解。** 数据默认存放于本地，权限由你手机的快捷指令绝对主导。

<a id="developer-guide"></a>
## 🛠 给开发者：它如何工作？

`whereabouts-mcp` 是一个轻量级的行踪上下文服务，专门为大模型（LLM）优化了输出结构。

### 核心特性

- **语义化地点：** 自动匹配 `home` / `work` 标签，无需在快捷指令里硬编码地点名。
- **停留点聚合：** 将杂乱的 GPS 漂移点聚合成“停留（Stay）”和“移动（Movement）”。
- **移动中状态：** 当用户已经离开当前停留点，但新地点还没确认时，暴露 `in_transit`。
- **电量趋势分析：** 提供 `batteryTrend`，包括掉电速度、趋势数组和预估关机时间，而非单一数值。
- **本地优先：** 数据持久化在本机 JSON 文件，无云端账号依赖。
- **为模型省 token：** 原始电量观测不会直接暴露给模型，MCP 输出的是压缩后的趋势信息。

### Cyberboss 深度集成

如果你正在使用 [Cyberboss](https://github.com/WenXiaoWendy/cyberboss)，那么恭喜，**你已经拥有了它**。

Cyberboss 当前已支持：

- 内置 HTTP 服务接收端。
- 自动注册 `whereabouts_snapshot` 等 5 个 MCP Tools。
- 支持模型理解当前停留、最近移动、移动中状态和电量趋势。
- 支持 `arrive_home` / `leave_home` 等系统级 Action。
- 支持已确认的明显移动触发 system action，让模型在合适时机自动出现。

<a id="quick-start"></a>
## 🚀 快速开始

### 1. 启动服务端

```bash
WHEREABOUTS_TOKEN=your_secret_token npm run serve
```

默认监听：

```text
http://0.0.0.0:4318
```

### 2. iPhone 快捷指令配置

推荐通过 iOS 快捷指令自动化发起 `POST` 请求：

- 推荐将自动化触发放在最常使用的app开启关闭时
- 连接或断开 Wi-Fi 时触发离家回家自动户
- 手动按钮上传
- 定时上传，但不要太频繁

<a id="shortcuts"></a>
快捷指令建议上传这些字段：

- `latitude`
  纬度，数字
- `longitude`
  经度，数字
- `timestamp`
  当前时间，ISO 字符串
- `address`
  系统拿到的地址描述，可以不稳定
- `batteryLevel`
  当前电量，整数百分比，例如 `82`
- `deviceName`
  设备名，例如 `iPhone`
- `shortcutName`
  快捷指令名
- `trigger`
  触发原因，例如 `manual`、`arrive_home`、`leave_home`

坐标请尽量保留至少 `6` 位小数，推荐 `6-8` 位小数。位数太少会影响地点聚合：模型可能分不清你是到了家门口，还是停在隔壁街。

### 3. Agent 接入

模型可通过 MCP 工具感知你：

- `whereabouts_snapshot`
  获取“当前在哪里、待了多久、电量撑多久”的完整快照。
- `whereabouts_current_stay`
  获取当前停留点。
- `whereabouts_recent_stays`
  获取最近停留历史。
- `whereabouts_recent_moves`
  回溯最近的奔波路径。
- `whereabouts_summary`
  按 `day` / `week` / `month` 汇总行踪、电量和移动状态。

<a id="http-ingest"></a>
## 📡 HTTP 上传接口

```text
POST /location/ingest
Authorization: Bearer <token>
Content-Type: application/json
```

健康检查：

```text
GET /healthz
```

请求体示例：

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

必填字段：

- `latitude`
  纬度，数字，建议至少 6 位小数
- `longitude`
  经度，数字，建议至少 6 位小数

推荐字段：

- `batteryLevel`
  电量，只支持整数百分比，例如 `82`

可选字段：

- `timestamp`
  采集时间，ISO datetime
- `capturedAt`
  当 `timestamp` 不存在时的备用采集时间
- `address`
  地址描述，来自系统或快捷指令，可以不稳定，服务端会使用最新值
- `trigger`
  触发原因，如 `manual`、`arrive_home`、`leave_home`
- `source`
  来源，默认 `shortcuts`
- `deviceName`
  设备名
- `shortcutName`
  快捷指令名
- `notes`
  可选备注

成功响应：

```json
{
  "ok": true,
  "id": "stored-point-id",
  "timestamp": "2026-04-22T02:30:00.000Z",
  "receivedAt": "2026-04-22T02:30:01.000Z"
}
```

### 地点标签

快捷指令不需要上传 `home`、`work` 这样的标签。你只需要在服务端配置中心坐标和半径：

```bash
WHEREABOUTS_HOME_CENTER=30.123456,120.123456
WHEREABOUTS_WORK_CENTER=30.223456,120.223456
WHEREABOUTS_PLACE_RADIUS_METERS=150
```

如果需要更多地点，可以使用 JSON：

```bash
WHEREABOUTS_KNOWN_PLACES='[
  {"tag":"home","latitude":30.123456,"longitude":120.123456,"radiusMeters":150},
  {"tag":"work","latitude":30.223456,"longitude":120.223456,"radiusMeters":150}
]'
```

<a id="agent-guide"></a>
## 🧠 MCP 输出

### `whereabouts_snapshot`

一次返回当前停留、最近停留、最近移动和电量趋势。推荐模型优先调用这个工具。

可选输入：

```json
{
  "stayLimit": 5,
  "moveLimit": 5,
  "batteryBucketMinutes": 5
}
```

当前停留示例：

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

`whereabouts_snapshot` 和 `whereabouts_summary` 都会返回压缩后的电量趋势：

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

`values` 是整数数组。每个数字代表一个固定时间桶里的电量。一个桶里多次上报时，使用该桶内最新一次电量；空桶使用前一个已知电量填充。

### `whereabouts_summary`

按自然时间范围汇总：

```json
{
  "range": "day",
  "batteryBucketMinutes": 5
}
```

`range` 支持：

- `day`
- `week`
- `month`

<a id="standalone"></a>
## 🧩 单独运行

环境前提：

- Node.js `>=22`
- 已执行 `npm install`

常用 CLI：

```bash
whereabouts-mcp serve
whereabouts-mcp latest --json
whereabouts-mcp history --limit 20 --json
whereabouts-mcp moves --limit 20 --json
whereabouts-mcp summary --range day --json
whereabouts-mcp tool-mcp-server
```

如果没有全局安装，也可以用：

```bash
node ./bin/whereabouts-mcp.js <command>
```

<a id="data"></a>
## 🗂 数据存放

独立运行时，默认状态目录：

```text
~/.whereabouts-mcp/
```

主要文件：

- `locations.json`
  当前停留、最近停留、最近移动、电量观测

Cyberboss 内置运行时，默认使用 Cyberboss 状态目录：

```text
~/.cyberboss/locations.json
```

`durationMs`、`durationMinutes`、`durationText`、`batteryTrend` 这类字段是 MCP 输出时计算出来的，不会全部写回原始 JSON 文件。

电量原始存储只保留最近 100 条 `batteryObservations`，且只保存：

```json
{
  "timestamp": "2026-04-22T02:30:00.000Z",
  "batteryLevel": 82
}
```

<a id="env"></a>
## ⚙️ 环境变量

常用变量：

- `WHEREABOUTS_STATE_DIR`
  状态目录，默认 `~/.whereabouts-mcp`
- `WHEREABOUTS_STORE_FILE`
  位置数据文件，默认 `locations.json`
- `WHEREABOUTS_HOST`
  HTTP 监听地址，默认 `0.0.0.0`
- `WHEREABOUTS_PORT`
  HTTP 监听端口，默认 `4318`
- `WHEREABOUTS_TOKEN`
  HTTP 上传 token
- `WHEREABOUTS_HISTORY_LIMIT`
  最近停留保留数量
- `WHEREABOUTS_MOVEMENT_EVENT_LIMIT`
  最近移动事件保留数量
- `WHEREABOUTS_BATTERY_HISTORY_LIMIT`
  电量观测保留数量，默认 100
- `WHEREABOUTS_HOME_CENTER`
  家的中心坐标，格式 `lat,lng`
- `WHEREABOUTS_WORK_CENTER`
  公司的中心坐标，格式 `lat,lng`
- `WHEREABOUTS_KNOWN_PLACES`
  更多地点标签，JSON 数组
- `WHEREABOUTS_PLACE_RADIUS_METERS`
  地点标签识别半径，默认 150
- `WHEREABOUTS_STAY_MERGE_RADIUS_METERS`
  停留点合并半径，默认 100
- `WHEREABOUTS_STAY_BREAK_RADIUS_METERS`
  离开当前停留点的确认半径，默认 200
- `WHEREABOUTS_STAY_BREAK_SAMPLES`
  确认新停留点需要的样本数，默认 2
- `WHEREABOUTS_MAJOR_MOVE_THRESHOLD_METERS`
  生成明显移动事件的距离阈值，默认 1000

Cyberboss 中对应变量以 `CYBERBOSS_LOCATION_` 开头，例如：

```bash
CYBERBOSS_ENABLE_LOCATION_SERVER=true
CYBERBOSS_LOCATION_HOME_CENTER=30.123456,120.123456
CYBERBOSS_LOCATION_PLACE_RADIUS_METERS=150
CYBERBOSS_LOCATION_BATTERY_HISTORY_LIMIT=100
```

<a id="privacy"></a>
## 🔒 隐私与边界

- **不作恶：** 这是一个单向主动上传工具，不是实时追踪器。
- **透明度：** 不要在公开 Issue、README、截图或日志里包含你的真实家 / 公司坐标。
- **安全：** 使用 `WHEREABOUTS_TOKEN` 保护你的数据接口。
- **本地优先：** 默认只写本地文件，不需要云端账号。

## License

AGPL-3.0-only
