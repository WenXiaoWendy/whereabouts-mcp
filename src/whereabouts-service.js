const { startLocationIngestServer } = require("./location-ingest-server");
const { LocationStore } = require("./location-store");
const {
  computeRecordDurationMs,
  formatDisplayTime,
  formatDuration,
  resolveDisplayTimeZone,
  serializeLocationHistoryForOutput,
  serializeLocationMovesForOutput,
  serializeLocationRecordForOutput,
} = require("./location-format");

class WhereaboutsService {
  constructor({ config, store = null } = {}) {
    this.config = config || {};
    this.store = store || new LocationStore({
      filePath: this.config.storeFile,
      historyLimit: this.config.historyLimit,
      movementEventLimit: this.config.movementEventLimit,
      batteryHistoryLimit: this.config.batteryHistoryLimit,
      knownPlaces: this.config.knownPlaces,
      knownPlaceRadiusMeters: this.config.knownPlaceRadiusMeters,
      stayMergeRadiusMeters: this.config.stayMergeRadiusMeters,
      stayBreakConfirmRadiusMeters: this.config.stayBreakConfirmRadiusMeters,
      stayBreakConfirmSamples: this.config.stayBreakConfirmSamples,
      majorMoveThresholdMeters: this.config.majorMoveThresholdMeters,
    });
    this.server = null;
  }

  appendPoint(point) {
    return this.store.append(point);
  }

  getCurrentStay() {
    return this.store.getLatest();
  }

  listRecentStays({ limit = 20 } = {}) {
    return this.store.listRecent(limit);
  }

  listRecentMovementEvents({ limit = 20 } = {}) {
    return this.store.listRecentMovementEvents(limit);
  }

  listRecentBatteryObservations({ limit = 100 } = {}) {
    return this.store.listRecentBatteryObservations(limit);
  }

  getSnapshot({ stayLimit = 5, moveLimit = 5, batteryBucketMinutes } = {}) {
    const displayTimeZone = resolveDisplayTimeZone();
    const currentStay = this.getCurrentStay();
    const recentStays = this.listRecentStays({ limit: stayLimit });
    const recentMovementEvents = this.listRecentMovementEvents({ limit: moveLimit });
    const recentBatteryObservations = this.listRecentBatteryObservations({
      limit: this.config.batteryHistoryLimit || 100,
    });
    return {
      currentStay: currentStay ? serializeLocationRecordForOutput(currentStay, displayTimeZone) : null,
      recentStays: recentStays.map((record) => serializeLocationRecordForOutput(record, displayTimeZone)),
      recentMovementEvents: recentMovementEvents.map((record) => serializeLocationRecordForOutput(record, displayTimeZone)),
      batteryTrend: buildBatteryTrend(recentBatteryObservations, [], displayTimeZone, {
        bucketMinutes: batteryBucketMinutes,
      }),
    };
  }

  getCurrentStayForOutput() {
    const currentStay = this.getCurrentStay();
    return currentStay ? serializeLocationRecordForOutput(currentStay) : null;
  }

  getRecentStaysForOutput({ limit = 20 } = {}) {
    return serializeLocationHistoryForOutput(
      this.getCurrentStay(),
      this.listRecentStays({ limit })
    );
  }

  getRecentMovesForOutput({ limit = 20 } = {}) {
    return serializeLocationMovesForOutput(
      this.getCurrentStay(),
      this.listRecentMovementEvents({ limit })
    );
  }

  getSummary({ range = "day", batteryBucketMinutes } = {}) {
    const displayTimeZone = resolveDisplayTimeZone();
    const normalizedRange = normalizeSummaryRange(range);
    const now = new Date();
    const rangeStart = computeRangeStart(now, normalizedRange, displayTimeZone);
    const rangeEnd = now;
    const currentStay = this.getCurrentStay();
    const recentStays = this.listRecentStays({ limit: this.config.historyLimit || 1000 });
    const recentMovementEvents = this.listRecentMovementEvents({
      limit: this.config.movementEventLimit || 100,
    });
    const recentBatteryObservations = this.listRecentBatteryObservations({
      limit: this.config.batteryHistoryLimit || 1000,
    });
    const staysInRange = [currentStay, ...recentStays]
      .filter(Boolean)
      .filter((stay) => recordOverlapsWindow(stay, rangeStart, rangeEnd));
    const movesInRange = recentMovementEvents.filter((event) => {
      const movedAt = Date.parse(event.movedAt || "");
      return Number.isFinite(movedAt) && movedAt >= rangeStart.getTime() && movedAt <= rangeEnd.getTime();
    });
    const batteryObservationsInRange = recentBatteryObservations.filter((observation) => {
      const timestamp = Date.parse(observation.timestamp || "");
      return Number.isFinite(timestamp) && timestamp >= rangeStart.getTime() && timestamp <= rangeEnd.getTime();
    });

    const totalKnownStayDurationMs = staysInRange.reduce(
      (sum, stay) => sum + computeWindowedRecordDurationMs(stay, rangeStart, rangeEnd),
      0
    );
    const totalMajorMoveDistanceMeters = movesInRange.reduce(
      (sum, event) => sum + (Number.isFinite(event.distanceMeters) ? event.distanceMeters : 0),
      0
    );
    const pendingBreak = typeof this.store.getPendingBreak === "function"
      ? this.store.getPendingBreak()
      : null;

    return {
      range: normalizedRange,
      displayTimeZone,
      rangeStartAt: rangeStart.toISOString(),
      rangeStartAtLocal: formatDisplayTime(rangeStart.toISOString(), displayTimeZone),
      rangeEndAt: rangeEnd.toISOString(),
      rangeEndAtLocal: formatDisplayTime(rangeEnd.toISOString(), displayTimeZone),
      mobilityState: buildMobilityState(currentStay, pendingBreak, displayTimeZone),
      currentStay: currentStay ? serializeLocationRecordForOutput(currentStay, displayTimeZone) : null,
      stayCount: staysInRange.length,
      moveCount: movesInRange.length,
      knownPlaces: buildKnownPlaces(staysInRange, rangeStart, rangeEnd, displayTimeZone),
      totalKnownStayDurationMs,
      totalKnownStayDurationMinutes: Math.round(totalKnownStayDurationMs / 60000),
      totalKnownStayDurationText: formatDuration(totalKnownStayDurationMs),
      totalMajorMoveDistanceMeters: Math.round(totalMajorMoveDistanceMeters),
      maxMoveDistanceMeters: movesInRange.length
        ? Math.max(...movesInRange.map((event) => event.distanceMeters || 0))
        : 0,
      lastMove: movesInRange[0] ? serializeLocationRecordForOutput(movesInRange[0], displayTimeZone) : null,
      batteryTrend: buildBatteryTrend(batteryObservationsInRange, staysInRange, displayTimeZone, {
        bucketMinutes: batteryBucketMinutes,
      }),
      dataCoverage: {
        batteryObservationCount: batteryObservationsInRange.length,
        stayCount: staysInRange.length,
        moveCount: movesInRange.length,
        note: batteryObservationsInRange.length
          ? "Battery trend is based on retained battery observations in this range."
          : "No retained battery observations in this range; old stores only have aggregated stays.",
      },
    };
  }

  async startServer({ host, port, token, onAccepted } = {}) {
    if (this.server) {
      return this.server;
    }
    const resolvedHost = normalizeText(host) || this.config.host || "0.0.0.0";
    const resolvedPort = normalizePositiveInt(port, this.config.port || 4318);
    const resolvedToken = normalizeText(token) || this.config.token;
    if (!resolvedToken) {
      throw new Error("WHEREABOUTS_TOKEN or --token is required for serve.");
    }
    this.server = await startLocationIngestServer({
      store: this.store,
      token: resolvedToken,
      host: resolvedHost,
      port: resolvedPort,
      onAccepted,
    });
    return this.server;
  }

  async closeServer() {
    if (!this.server) {
      return;
    }
    const server = this.server;
    this.server = null;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInt(value, fallback) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeSummaryRange(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "week" || normalized === "month") {
    return normalized;
  }
  return "day";
}

function computeRangeStart(now, range, displayTimeZone) {
  const parts = getZonedDateParts(now, displayTimeZone);
  if (range === "month") {
    return zonedDateTimeToUtc({ year: parts.year, month: parts.month, day: 1 }, displayTimeZone);
  }
  if (range === "week") {
    const localMidnightUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
    const dayOfWeek = new Date(localMidnightUtc).getUTCDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const weekStartUtc = new Date(localMidnightUtc);
    weekStartUtc.setUTCDate(weekStartUtc.getUTCDate() - daysSinceMonday);
    return zonedDateTimeToUtc({
      year: weekStartUtc.getUTCFullYear(),
      month: weekStartUtc.getUTCMonth() + 1,
      day: weekStartUtc.getUTCDate(),
    }, displayTimeZone);
  }
  return zonedDateTimeToUtc({ year: parts.year, month: parts.month, day: parts.day }, displayTimeZone);
}

function getZonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const mapped = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      mapped[part.type] = Number(part.value);
    }
  }
  return mapped;
}

function zonedDateTimeToUtc({ year, month, day }, timeZone) {
  const localAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let utcMs = localAsUtc - getTimeZoneOffsetMs(new Date(localAsUtc), timeZone);
  utcMs = localAsUtc - getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  return new Date(utcMs);
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getZonedDateParts(date, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0
  );
  return localAsUtc - date.getTime();
}

function recordOverlapsWindow(record, start, end) {
  return computeWindowedRecordDurationMs(record, start, end) > 0;
}

function computeWindowedRecordDurationMs(record, start, end) {
  const recordStart = Date.parse(record?.enteredAt || record?.timestamp || "");
  const recordEnd = Date.parse(record?.leftAt || record?.lastSeenAt || record?.receivedAt || "");
  if (!Number.isFinite(recordStart) || !Number.isFinite(recordEnd)) {
    return 0;
  }
  const clippedStart = Math.max(recordStart, start.getTime());
  const clippedEnd = Math.min(recordEnd, end.getTime());
  return Math.max(0, clippedEnd - clippedStart);
}

function buildKnownPlaces(stays, rangeStart, rangeEnd, displayTimeZone) {
  const grouped = new Map();
  for (const stay of stays) {
    const key = buildPlaceKey(stay);
    const existing = grouped.get(key) || {
      placeTag: stay.placeTag || undefined,
      address: stay.address || undefined,
      centerLat: stay.centerLat,
      centerLng: stay.centerLng,
      stayCount: 0,
      sampleCount: 0,
      durationMs: 0,
      lastSeenAt: "",
    };
    existing.stayCount += 1;
    existing.sampleCount += normalizePositiveInt(stay.sampleCount, 0);
    existing.durationMs += computeWindowedRecordDurationMs(stay, rangeStart, rangeEnd);
    if (!existing.lastSeenAt || Date.parse(stay.lastSeenAt || "") > Date.parse(existing.lastSeenAt)) {
      existing.lastSeenAt = stay.lastSeenAt;
    }
    grouped.set(key, existing);
  }
  return Array.from(grouped.values())
    .map((place) => ({
      ...place,
      durationMinutes: Math.round(place.durationMs / 60000),
      durationText: formatDuration(place.durationMs),
      lastSeenAtLocal: formatDisplayTime(place.lastSeenAt, displayTimeZone),
    }))
    .sort((left, right) => right.durationMs - left.durationMs);
}

function buildPlaceKey(stay) {
  const explicit = normalizeText(stay.placeTag);
  if (explicit) {
    return explicit.toLowerCase();
  }
  const lat = Number(stay.centerLat);
  const lng = Number(stay.centerLng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${lat.toFixed(4)},${lng.toFixed(4)}`;
  }
  return "unknown";
}

function buildBatteryTrend(observations, stays, displayTimeZone, options = {}) {
  const batteryRecords = observations
    .filter((observation) => Number.isFinite(observation.batteryLevel))
    .map((observation) => ({
      level: observation.batteryLevel,
      percent: normalizeBatteryPercent(observation.batteryLevel),
      timestamp: observation.timestamp,
    }))
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  if (!batteryRecords.length) {
    const stayRecords = stays
      .filter((stay) => Number.isFinite(stay.batteryLevel))
      .map((stay) => ({
        level: stay.batteryLevel,
        percent: normalizeBatteryPercent(stay.batteryLevel),
        timestamp: stay.lastSeenAt,
      }))
      .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
    return buildBatteryTrendFromRecords(stayRecords, displayTimeZone, "aggregated_stays", options);
  }
  return buildBatteryTrendFromRecords(batteryRecords, displayTimeZone, "battery_observations", options);
}

function buildBatteryTrendFromRecords(records, displayTimeZone, source, options = {}) {
  if (!records.length) {
    return {
      source,
      sampleCount: 0,
      values: [],
      note: "No battery observations in this range.",
    };
  }
  const first = records[0];
  const last = records[records.length - 1];
  const percents = records.map((record) => record.percent).filter(Number.isFinite);
  const deltaPercent = Number.isFinite(first.percent) && Number.isFinite(last.percent)
    ? Math.round((last.percent - first.percent) * 10) / 10
    : null;
  const bucketMinutes = normalizeBatteryBucketMinutes(
    options.bucketMinutes,
    chooseBatteryBucketMinutes(first.timestamp, last.timestamp)
  );
  const series = buildBatterySeries(records, bucketMinutes);
  const durationHours = computeDurationHours(first.timestamp, last.timestamp);
  const deltaPerHourPercent = deltaPercent != null && durationHours > 0
    ? Math.round((deltaPercent / durationHours) * 10) / 10
    : 0;
  return {
    source,
    sampleCount: records.length,
    firstLevelPercent: first.percent,
    latestLevelPercent: last.percent,
    bucketMinutes,
    seriesStartAt: series.seriesStartAt,
    seriesStartAtLocal: formatDisplayTime(series.seriesStartAt, displayTimeZone),
    seriesEndAt: series.seriesEndAt,
    seriesEndAtLocal: formatDisplayTime(series.seriesEndAt, displayTimeZone),
    values: series.values,
    deltaPercent,
    deltaPerHourPercent,
    direction: inferBatteryDirection(deltaPercent),
    minLevelPercent: percents.length ? Math.min(...percents) : null,
    maxLevelPercent: percents.length ? Math.max(...percents) : null,
    fillStrategy: "latest_observation_per_bucket_then_carry_forward",
  };
}

function buildBatterySeries(records, bucketMinutes) {
  const bucketMs = bucketMinutes * 60000;
  const firstTime = Date.parse(records[0]?.timestamp || "");
  const lastTime = Date.parse(records[records.length - 1]?.timestamp || "");
  if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) {
    return {
      seriesStartAt: "",
      seriesEndAt: "",
      values: [],
    };
  }
  const startMs = Math.floor(firstTime / bucketMs) * bucketMs;
  const endMs = Math.floor(lastTime / bucketMs) * bucketMs;
  const bucketValues = new Map();
  for (const record of records) {
    const timestamp = Date.parse(record.timestamp || "");
    if (!Number.isFinite(timestamp) || !Number.isFinite(record.percent)) {
      continue;
    }
    const bucketIndex = Math.floor((timestamp - startMs) / bucketMs);
    // Records are time-ascending, so repeated writes keep the latest value in the bucket.
    bucketValues.set(bucketIndex, record.percent);
  }
  const bucketCount = Math.floor((endMs - startMs) / bucketMs) + 1;
  const values = [];
  let carried = bucketValues.get(0);
  for (let index = 0; index < bucketCount; index += 1) {
    if (bucketValues.has(index)) {
      carried = bucketValues.get(index);
    }
    values.push(carried);
  }
  return {
    seriesStartAt: new Date(startMs).toISOString(),
    seriesEndAt: new Date(endMs).toISOString(),
    values,
  };
}

function chooseBatteryBucketMinutes(firstTimestamp, lastTimestamp) {
  const first = Date.parse(firstTimestamp || "");
  const last = Date.parse(lastTimestamp || "");
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) {
    return 5;
  }
  const spanMinutes = (last - first) / 60000;
  if (spanMinutes <= 24 * 60) {
    return 5;
  }
  if (spanMinutes <= 7 * 24 * 60) {
    return 30;
  }
  return 120;
}

function normalizeBatteryBucketMinutes(value, fallback) {
  const numeric = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}

function computeDurationHours(firstTimestamp, lastTimestamp) {
  const first = Date.parse(firstTimestamp || "");
  const last = Date.parse(lastTimestamp || "");
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) {
    return 0;
  }
  return (last - first) / 3600000;
}

function inferBatteryDirection(deltaPercent) {
  if (!Number.isFinite(deltaPercent)) {
    return "unknown";
  }
  if (deltaPercent >= 2) {
    return "charging";
  }
  if (deltaPercent <= -2) {
    return "draining";
  }
  return "stable";
}

function normalizeBatteryPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return Math.round(percent * 10) / 10;
}

function buildMobilityState(currentStay, pendingBreak, displayTimeZone) {
  if (pendingBreak) {
    return {
      state: "in_transit",
      startedAt: pendingBreak.enteredAt,
      startedAtLocal: formatDisplayTime(pendingBreak.enteredAt, displayTimeZone),
      lastSeenAt: pendingBreak.lastSeenAt,
      lastSeenAtLocal: formatDisplayTime(pendingBreak.lastSeenAt, displayTimeZone),
      sampleCount: pendingBreak.sampleCount,
      address: pendingBreak.address,
      placeTag: pendingBreak.placeTag,
      note: "A sample outside the current stay is waiting for confirmation.",
    };
  }
  if (currentStay) {
    return {
      state: "staying",
      since: currentStay.enteredAt,
      sinceLocal: formatDisplayTime(currentStay.enteredAt, displayTimeZone),
      durationMs: computeRecordDurationMs(currentStay),
      durationText: formatDuration(computeRecordDurationMs(currentStay)),
      address: currentStay.address,
      placeTag: currentStay.placeTag,
    };
  }
  return {
    state: "unknown",
  };
}

module.exports = { WhereaboutsService };
