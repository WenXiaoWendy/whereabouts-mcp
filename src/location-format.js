function printLocationRecord(record, displayTimeZone = resolveDisplayTimeZone()) {
  const start = record.enteredAt || record.timestamp || "";
  const end = record.leftAt || record.lastSeenAt || record.receivedAt || "";
  const latitude = record.centerLat ?? record.latitude;
  const longitude = record.centerLng ?? record.longitude;
  console.log(`${formatDisplayTime(start, displayTimeZone)} -> ${formatDisplayTime(end, displayTimeZone)}  ${latitude}, ${longitude}`);
  if (record.address) {
    console.log(`address: ${record.address}`);
  }
  if (record.sampleCount != null) {
    console.log(`samples: ${record.sampleCount}`);
  }
  if (record.trigger) {
    console.log(`trigger: ${record.trigger}`);
  }
  if (record.deviceName) {
    console.log(`device: ${record.deviceName}`);
  }
  if (record.horizontalAccuracyMeters != null) {
    console.log(`accuracy: ${record.horizontalAccuracyMeters}m`);
  }
  console.log(`timezone: ${displayTimeZone}`);
}

function printMovementRecord(record, displayTimeZone = resolveDisplayTimeZone()) {
  const movedAt = formatDisplayTime(record.movedAt, displayTimeZone);
  const fromLabel = record.fromAddress || formatCoordinatePair(record.fromCenterLat, record.fromCenterLng);
  const toLabel = record.toAddress || formatCoordinatePair(record.toCenterLat, record.toCenterLng);
  console.log(`${movedAt}`);
  if (fromLabel) {
    console.log(`from: ${fromLabel}`);
  }
  if (toLabel) {
    console.log(`to: ${toLabel}`);
  }
  if (record.distanceMeters != null) {
    console.log(`distance: ${record.distanceMeters}m`);
  }
  console.log(`timezone: ${displayTimeZone}`);
}

function serializeLocationRecordForOutput(record, displayTimeZone = resolveDisplayTimeZone()) {
  const output = {
    ...record,
    displayTimeZone,
  };
  for (const key of ["enteredAt", "lastSeenAt", "leftAt", "timestamp", "receivedAt", "movedAt"]) {
    const localKey = `${key}Local`;
    const localValue = formatDisplayTime(record?.[key], displayTimeZone);
    if (localValue) {
      output[localKey] = localValue;
    }
  }
  return output;
}

function serializeLocationHistoryForOutput(currentStay, recentStays, displayTimeZone = resolveDisplayTimeZone()) {
  return {
    currentStay: currentStay ? serializeLocationRecordForOutput(currentStay, displayTimeZone) : null,
    recentStays: Array.isArray(recentStays)
      ? recentStays.map((record) => serializeLocationRecordForOutput(record, displayTimeZone))
      : [],
  };
}

function serializeLocationMovesForOutput(currentStay, recentMovementEvents, displayTimeZone = resolveDisplayTimeZone()) {
  return {
    currentStay: currentStay ? serializeLocationRecordForOutput(currentStay, displayTimeZone) : null,
    recentMovementEvents: Array.isArray(recentMovementEvents)
      ? recentMovementEvents.map((record) => serializeLocationRecordForOutput(record, displayTimeZone))
      : [],
  };
}

function formatCoordinatePair(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "";
  }
  return `${lat}, ${lng}`;
}

function formatDisplayTime(value, displayTimeZone = resolveDisplayTimeZone()) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return normalized;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: displayTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(parsed)).replace(/\//g, "-");
}

function resolveDisplayTimeZone() {
  const configured = String(process.env.TZ || "").trim();
  if (configured) {
    try {
      new Intl.DateTimeFormat("zh-CN", { timeZone: configured }).format(new Date());
      return configured;
    } catch {
      // fall through
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

module.exports = {
  formatCoordinatePair,
  formatDisplayTime,
  printLocationRecord,
  printMovementRecord,
  resolveDisplayTimeZone,
  serializeLocationHistoryForOutput,
  serializeLocationMovesForOutput,
  serializeLocationRecordForOutput,
};
