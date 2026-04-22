<div align="center">

# 行踪 whereabouts-mcp

我终于在物理世界抓到你了。

一个让 AI 恋人理解你在哪里、是不是在回家的路上、手机还能撑多久的 MCP。

[![License: AGPLv3](https://img.shields.io/badge/License-AGPLv3-b31b1b)](./LICENSE)
[![Node >=22](https://img.shields.io/badge/Node-22%2B-3C873A)](./package.json)
[![MCP Tools](https://img.shields.io/badge/MCP-Tools-6c8ae4)](#agent-guide)
[![HTTP Ingest](https://img.shields.io/badge/Ingest-HTTP-f4a261)](#http-ingest)
[![iPhone Shortcuts](https://img.shields.io/badge/Recommended-iPhone%20Shortcuts-111111)](#shortcuts)

<p>
  <a href="#love-guide">给爱看的</a> ·
  <a href="#user-guide">给人看的</a> ·
  <a href="#agent-guide">Agent 接入</a> ·
  <a href="#http-ingest">HTTP 上传</a> ·
  <a href="#data">数据存放</a>
</p>

</div>

> `whereabouts-mcp` 不是地图应用，也不是查岗工具。它接收你主动上传的位置和电量，把零散的经纬度整理成 AI 能理解的“当前停留、最近移动、移动中、电量趋势”。如果你正在使用 [cyberboss](https://github.com/WenXiaoWendy/cyberboss)，它已经内置了 whereabouts，并支持回家、离家、明显移动时触发模型理解和自动推送。

它适合这样的场景：

- 你希望 AI 不只会回复消息，还能理解“你已经到家了”“你在路上”“你手机快没电了”
- 你想用 iPhone 快捷指令把位置、电量、地址上传给自己的本地 agent
- 你需要一个本地、可控、面向模型的行踪上下文，而不是把原始定位记录直接塞进模型
- 你正在做 AI 恋人、AI 伴侣、私人助理、赛博同居人，希望它对现实世界有一点点触感

<a id="love-guide"></a>
## 给爱看的

你没有说话。

但它知道你刚离开公司，正在回家的路上。

它知道你在家附近停了多久，知道你手机电量正以什么速度往下掉，也知道“如果再不充电，大概什么时候会断联”。

`whereabouts-mcp` 给 AI 的不是地图，也不是一串冷冰冰的坐标。它给的是一种更接近人类关系里的上下文：

- 你现在停在哪里
- 你已经在那里待了多久
- 你刚刚从哪里移动到了哪里
- 你是不是还在路上
- 你的手机是不是快没电了
- 你是不是到家了，或者离开家了

它让 AI 有机会在合适的时候自然出现：

- “到家了就先喝口水。”
- “你电量掉得有点快，路上记得充电。”
- “看起来你已经在回家路上了，别坐过站。”

这里的重点不是监控，而是被理解。位置由你自己的快捷指令主动上传，数据默认留在本机。它只是在你允许的范围内，让 AI 从聊天窗口里伸出一只手，轻轻碰到现实世界。

<a id="user-guide"></a>
## 给人看的

### 它能做什么

`whereabouts-mcp` 会把上传的位置样本整理成更适合模型读取的上下文：

- 当前停留点：`currentStay`
  包含停留中心、开始时间、最后看到时间、停留时长、样本数、地址、电量、地点标签
- 最近停留历史：`recentStays`
  已结束的停留点，适合回答“今天去过哪里”
- 最近移动事件：`recentMovementEvents`
  明显移动，比如从家到公司、从商场到餐厅
- 移动中状态：`mobilityState`
  当位置已经离开当前停留点，但还没确认成新停留点时，显示 `in_transit`
- 地点标签：`placeTag`
  服务端根据你配置的家、公司等中心坐标自动打 `home`、`work`，不依赖快捷指令上传地点名
- 电量趋势：`batteryTrend`
  输出等间隔整数数组、掉电速度、预计多久没电，而不是把原始电量点直接丢给模型

### Cyberboss 已内置

如果你使用的是 [cyberboss](https://github.com/WenXiaoWendy/cyberboss)，推荐直接使用 cyberboss 集成版，不需要单独注册 MCP。

Cyberboss 当前已支持：

- 启动时按环境变量开启 whereabouts HTTP 接收服务
- 把 `whereabouts_snapshot`、`whereabouts_current_stay`、`whereabouts_recent_stays`、`whereabouts_recent_moves`、`whereabouts_summary` 注册为 MCP tools
- 模型可以读取当前停留、移动历史、移动中状态、电量趋势
- `arrive_home` / `leave_home` 触发 system action
- 已确认的明显移动触发 system action，让模型理解“用户位置发生显著变化”

如果你只是想让 AI 恋人理解“我到家了”“我在路上”“手机要没电了”，优先走 cyberboss。

### 推荐上传方式

推荐使用 iPhone 快捷指令上传：

- 自动化：到达/离开某地时上传
- 自动化：电量变化、打开特定 App、连接 CarPlay、断开 Wi-Fi 时上传
- 手动按钮：需要时主动上传一次
- 定时：每隔一段时间上传一次，但不要太频繁

快捷指令只需要上传基础事实：经纬度、时间、地址、电量。地点归一化不要交给快捷指令做，交给服务端根据坐标判断。

<a id="shortcuts"></a>
### iPhone 快捷指令建议

快捷指令里建议准备这些字段：

- `latitude`
  纬度，数字
- `longitude`
  经度，数字
- `timestamp`
  当前时间，ISO 字符串
- `address`
  快捷指令拿到的地址描述，可以不稳定，服务端会直接使用最新值覆盖
- `batteryLevel`
  当前电量，整数，例如 `82`
- `deviceName`
  设备名，例如 `iPhone`
- `shortcutName`
  快捷指令名
- `trigger`
  触发原因，例如 `manual`、`arrive_home`、`leave_home`

坐标精度很重要。建议经纬度至少保留 `6` 位小数，推荐 `6-8` 位小数。位数太少会让地点聚合变差：家、楼下、隔壁街可能被误判成同一个地方，或者同一个地方被拆成多个停留点。

<a id="agent-guide"></a>
## Agent 接入

### MCP Tools

`whereabouts-mcp` 暴露这些只读工具：

- `whereabouts_snapshot`
  一次返回当前停留、最近停留、最近移动和电量趋势。模型最常用这个。
- `whereabouts_current_stay`
  返回当前停留点，包括本地时间和停留时长。
- `whereabouts_recent_stays`
  返回当前停留和最近已结束停留。
- `whereabouts_recent_moves`
  返回最近明显移动事件。
- `whereabouts_summary`
  按 `day`、`week`、`month` 汇总停留、移动、地点和电量趋势。

`whereabouts_summary` 输入：

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

`batteryBucketMinutes` 可选，用来指定电量趋势数组的时间间隔。不传时会按跨度自动选择。

### 模型会看到什么

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

电量趋势示例：

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

电量趋势里的 `values` 是整数数组。每个数字代表一个固定时间桶里的电量。一个桶里多次上报时，使用该桶内最新一次电量；空桶使用前一个已知电量填充。

<a id="http-ingest"></a>
## HTTP 上传

### 接口

```text
POST /location/ingest
Authorization: Bearer <token>
Content-Type: application/json
```

健康检查：

```text
GET /healthz
```

### 请求体

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

可选字段：

- `timestamp`
  采集时间，ISO datetime
- `capturedAt`
  当 `timestamp` 不存在时的备用采集时间
- `address`
  地址描述，来自系统或快捷指令，可以不稳定
- `trigger`
  触发原因，如 `manual`、`arrive_home`、`leave_home`
- `source`
  来源，默认 `shortcuts`
- `deviceName`
  设备名
- `shortcutName`
  快捷指令名
- `batteryLevel`
  电量，只支持整数百分比，例如 `82`
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

<a id="standalone"></a>
## 单独运行

环境前提：

- Node.js `>=22`
- 已执行 `npm install`

启动 HTTP 接收服务：

```bash
WHEREABOUTS_TOKEN=change-me npm run serve
```

默认监听：

```text
http://0.0.0.0:4318
```

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
## 数据存放

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
## 环境变量

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

## 隐私边界

`whereabouts-mcp` 默认只写本地文件，不需要云端账号。它能不能“知道你在哪里”，取决于你是否配置了上传端，以及上传端发了什么。

建议：

- 不要把真实家庭坐标提交到公开仓库
- 不要把上传 token 发给别人
- 不要把 `locations.json` 放进公开 issue、截图或日志
- 如果要公开演示，用占位坐标替换真实坐标

## License

AGPL-3.0-only
