const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

class LocationStore {
  constructor({
    filePath,
    historyLimit = 1000,
    stayMergeRadiusMeters = 100,
    stayBreakConfirmRadiusMeters = 200,
    stayBreakConfirmSamples = 2,
    majorMoveThresholdMeters = 1000,
    movementEventLimit,
    batteryHistoryLimit,
    knownPlaces = [],
    knownPlaceRadiusMeters = 150,
  }) {
    this.filePath = filePath;
    this.historyLimit = normalizePositiveInt(historyLimit, 1000);
    this.stayMergeRadiusMeters = normalizePositiveInt(stayMergeRadiusMeters, 100);
    this.stayBreakConfirmRadiusMeters = Math.max(
      this.stayMergeRadiusMeters,
      normalizePositiveInt(stayBreakConfirmRadiusMeters, 200)
    );
    this.stayBreakConfirmSamples = normalizePositiveInt(stayBreakConfirmSamples, 2);
    this.majorMoveThresholdMeters = normalizePositiveInt(majorMoveThresholdMeters, 1000);
    this.movementEventLimit = normalizePositiveInt(
      movementEventLimit,
      Math.min(this.historyLimit, 100)
    );
    this.batteryHistoryLimit = normalizePositiveInt(batteryHistoryLimit, 100);
    this.knownPlaceRadiusMeters = normalizePositiveInt(knownPlaceRadiusMeters, 150);
    this.knownPlaces = normalizeKnownPlaces(knownPlaces, this.knownPlaceRadiusMeters);
    this.state = createEmptyState();
    this.ensureParentDirectory();
    this.load();
  }

  ensureParentDirectory() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.state = this.normalizeLoadedState(parsed);
    } catch {
      this.state = createEmptyState();
    }
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.serializeState(), null, 2));
  }

  append(record) {
    this.load();
    const point = this.annotatePoint(normalizeLocationPoint(record));
    if (!point) {
      throw new Error("invalid location payload");
    }
    appendBatteryObservation(this.state, point, this.batteryHistoryLimit);
    const movementEvent = this.applyPoint(point);
    this.save();
    return {
      point: { ...point },
      currentStay: this.getCurrentStay(),
      movementEvent: movementEvent ? { ...movementEvent } : null,
    };
  }

  getLatest() {
    return this.getCurrentStay();
  }

  getCurrentStay() {
    this.load();
    return this.state.currentStay ? { ...this.state.currentStay } : null;
  }

  listRecent(limit = 20) {
    this.load();
    const normalizedLimit = normalizePositiveInt(limit, 20);
    return this.state.recentStays.slice(-normalizedLimit).reverse().map((stay) => ({ ...stay }));
  }

  listRecentMovementEvents(limit = 20) {
    this.load();
    const normalizedLimit = normalizePositiveInt(limit, 20);
    return this.state.recentMovementEvents.slice(-normalizedLimit).reverse().map((event) => ({ ...event }));
  }

  listRecentBatteryObservations(limit = 100) {
    this.load();
    const normalizedLimit = normalizePositiveInt(limit, 100);
    return this.state.batteryObservations.slice(0, normalizedLimit).map((observation) => ({ ...observation }));
  }

  getPendingBreak() {
    this.load();
    return this.state._meta.pendingBreak ? { ...this.state._meta.pendingBreak } : null;
  }

  normalizeLoadedState(parsed) {
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && ("currentStay" in parsed || "recentStays" in parsed || "recentMovementEvents" in parsed)) {
      return {
        currentStay: this.annotateStay(normalizeStay(parsed.currentStay)),
        recentStays: normalizeStayArray(parsed.recentStays, this.historyLimit)
          .map((stay) => this.annotateStay(stay)),
        recentMovementEvents: normalizeMovementEventArray(parsed.recentMovementEvents, this.movementEventLimit),
        batteryObservations: normalizeBatteryObservationArray(
          parsed.batteryObservations || parsed.recentSamples,
          this.batteryHistoryLimit
        ),
        _meta: {
          pendingBreak: normalizePendingBreak(parsed?._meta?.pendingBreak),
        },
      };
    }

    const legacyPoints = collectLegacyPoints(parsed);
    if (!legacyPoints.length) {
      return createEmptyState();
    }

    this.state = createEmptyState();
    for (const point of legacyPoints) {
      const annotatedPoint = this.annotatePoint(point);
      appendBatteryObservation(this.state, annotatedPoint, this.batteryHistoryLimit);
      this.applyPoint(annotatedPoint);
    }
    return this.state;
  }

  serializeState() {
    const serialized = {
      currentStay: this.state.currentStay ? { ...this.state.currentStay } : null,
      recentStays: this.state.recentStays.map((stay) => ({ ...stay })),
      recentMovementEvents: this.state.recentMovementEvents.map((event) => ({ ...event })),
      batteryObservations: this.state.batteryObservations.map((observation) => ({ ...observation })),
    };
    if (this.state._meta?.pendingBreak) {
      serialized._meta = {
        pendingBreak: { ...this.state._meta.pendingBreak },
      };
    }
    return serialized;
  }

  applyPoint(point) {
    if (!this.state.currentStay) {
      this.state.currentStay = createStayFromPoint(point);
      this.state._meta.pendingBreak = null;
      return null;
    }

    const currentStay = this.state.currentStay;
    const distanceToCurrent = computeDistanceMeters(
      currentStay.centerLat,
      currentStay.centerLng,
      point.latitude,
      point.longitude
    );

    if (distanceToCurrent <= this.stayMergeRadiusMeters) {
      mergePointIntoStay(currentStay, point, { updateCenter: true });
      this.state._meta.pendingBreak = null;
      return null;
    }

    if (distanceToCurrent <= this.stayBreakConfirmRadiusMeters) {
      mergePointIntoStay(currentStay, point, { updateCenter: false });
      this.state._meta.pendingBreak = null;
      return null;
    }

    const pendingBreak = this.state._meta.pendingBreak;
    const nextPendingBreak = updatePendingBreak(
      pendingBreak,
      point,
      this.stayMergeRadiusMeters
    );

    if (nextPendingBreak.sampleCount < this.stayBreakConfirmSamples) {
      this.state._meta.pendingBreak = nextPendingBreak;
      return null;
    }

    const nextStay = finalizePendingBreak(nextPendingBreak);
    const closedStay = closeStay(currentStay);
    this.state.recentStays.push(closedStay);
    this.state.recentStays = this.state.recentStays.slice(-this.historyLimit);
    this.state.currentStay = nextStay;
    this.state._meta.pendingBreak = null;

    const distanceBetweenStays = computeDistanceMeters(
      closedStay.centerLat,
      closedStay.centerLng,
      nextStay.centerLat,
      nextStay.centerLng
    );
    if (distanceBetweenStays < this.majorMoveThresholdMeters) {
      return null;
    }

    const movementEvent = createMovementEvent(closedStay, nextStay, distanceBetweenStays);
    this.state.recentMovementEvents.push(movementEvent);
    this.state.recentMovementEvents = this.state.recentMovementEvents.slice(-this.movementEventLimit);
    return movementEvent;
  }

  annotatePoint(point) {
    if (!point) {
      return null;
    }
    return applyKnownPlaceTag({ ...point }, this.knownPlaces);
  }

  annotateStay(stay) {
    if (!stay) {
      return null;
    }
    return applyKnownPlaceTag({ ...stay }, this.knownPlaces);
  }
}

function createEmptyState() {
  return {
    currentStay: null,
    recentStays: [],
    recentMovementEvents: [],
    batteryObservations: [],
    _meta: {
      pendingBreak: null,
    },
  };
}

function collectLegacyPoints(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }
  const history = Array.isArray(parsed.history)
    ? parsed.history.map(normalizeLocationPoint).filter(Boolean)
    : [];
  const latest = normalizeLocationPoint(parsed.latest);
  if (latest && !history.some((point) => point.id === latest.id)) {
    history.push(latest);
  }
  return history.sort((left, right) => compareIsoTime(left.timestamp, right.timestamp));
}

function normalizeLocationPoint(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const latitude = normalizeFiniteNumber(value.latitude);
  const longitude = normalizeFiniteNumber(value.longitude);
  if (latitude == null || longitude == null) {
    return null;
  }

  const point = {
    id: normalizeText(value.id) || crypto.randomUUID(),
    timestamp: normalizeIsoTime(value.timestamp) || normalizeIsoTime(value.receivedAt) || new Date().toISOString(),
    receivedAt: normalizeIsoTime(value.receivedAt) || new Date().toISOString(),
    latitude,
    longitude,
  };

  assignOptionalNumber(point, "batteryLevel", value.batteryLevel);
  assignOptionalText(point, "source", normalizeText(value.source) || "shortcuts");
  assignOptionalText(point, "trigger", value.trigger);
  assignOptionalText(point, "deviceName", value.deviceName);
  assignOptionalText(point, "shortcutName", value.shortcutName);
  assignOptionalText(point, "address", value.address);
  assignOptionalText(point, "notes", value.notes);
  return point;
}

function createStayFromPoint(point) {
  const stay = {
    id: crypto.randomUUID(),
    enteredAt: point.timestamp,
    lastSeenAt: point.timestamp,
    centerLat: point.latitude,
    centerLng: point.longitude,
    sampleCount: 1,
  };
  applyPointMetadata(stay, point);
  return stay;
}

function mergePointIntoStay(stay, point, { updateCenter }) {
  const previousCount = normalizePositiveInt(stay.sampleCount, 1);
  const nextCount = previousCount + 1;
  if (updateCenter) {
    stay.centerLat = ((stay.centerLat * previousCount) + point.latitude) / nextCount;
    stay.centerLng = ((stay.centerLng * previousCount) + point.longitude) / nextCount;
  }
  stay.sampleCount = nextCount;
  stay.lastSeenAt = maxIsoTime(stay.lastSeenAt, point.timestamp);
  applyPointMetadata(stay, point);
}

function updatePendingBreak(existing, point, mergeRadiusMeters) {
  if (!existing) {
    return createPendingBreak(point);
  }
  const distance = computeDistanceMeters(
    existing.centerLat,
    existing.centerLng,
    point.latitude,
    point.longitude
  );
  if (distance > mergeRadiusMeters) {
    return createPendingBreak(point);
  }
  return mergePointIntoPendingBreak(existing, point);
}

function createPendingBreak(point) {
  return {
    enteredAt: point.timestamp,
    lastSeenAt: point.timestamp,
    centerLat: point.latitude,
    centerLng: point.longitude,
    sampleCount: 1,
    source: point.source,
    trigger: point.trigger,
    deviceName: point.deviceName,
    shortcutName: point.shortcutName,
    placeTag: point.placeTag,
    address: point.address,
    batteryLevel: point.batteryLevel,
  };
}

function mergePointIntoPendingBreak(pendingBreak, point) {
  const previousCount = normalizePositiveInt(pendingBreak.sampleCount, 1);
  const nextCount = previousCount + 1;
  pendingBreak.centerLat = ((pendingBreak.centerLat * previousCount) + point.latitude) / nextCount;
  pendingBreak.centerLng = ((pendingBreak.centerLng * previousCount) + point.longitude) / nextCount;
  pendingBreak.sampleCount = nextCount;
  pendingBreak.lastSeenAt = maxIsoTime(pendingBreak.lastSeenAt, point.timestamp);
  applyPointMetadata(pendingBreak, point);
  return pendingBreak;
}

function finalizePendingBreak(pendingBreak) {
  return {
    id: crypto.randomUUID(),
    enteredAt: pendingBreak.enteredAt,
    lastSeenAt: pendingBreak.lastSeenAt,
    centerLat: pendingBreak.centerLat,
    centerLng: pendingBreak.centerLng,
    sampleCount: pendingBreak.sampleCount,
    ...(pendingBreak.source ? { source: pendingBreak.source } : {}),
    ...(pendingBreak.trigger ? { trigger: pendingBreak.trigger } : {}),
    ...(pendingBreak.deviceName ? { deviceName: pendingBreak.deviceName } : {}),
    ...(pendingBreak.shortcutName ? { shortcutName: pendingBreak.shortcutName } : {}),
    ...(pendingBreak.placeTag ? { placeTag: pendingBreak.placeTag } : {}),
    ...(pendingBreak.address ? { address: pendingBreak.address } : {}),
    ...(pendingBreak.batteryLevel != null ? { batteryLevel: pendingBreak.batteryLevel } : {}),
  };
}

function closeStay(stay) {
  return {
    ...stay,
    leftAt: stay.lastSeenAt,
  };
}

function createMovementEvent(fromStay, toStay, distanceMeters) {
  const event = {
    id: crypto.randomUUID(),
    movedAt: toStay.enteredAt,
    distanceMeters: Math.round(distanceMeters),
    fromStayId: fromStay.id,
    toStayId: toStay.id,
  };

  assignOptionalText(event, "fromAddress", fromStay.address);
  assignOptionalText(event, "toAddress", toStay.address);
  assignOptionalText(event, "fromPlaceTag", fromStay.placeTag);
  assignOptionalText(event, "toPlaceTag", toStay.placeTag);
  assignOptionalNumber(event, "fromCenterLat", fromStay.centerLat);
  assignOptionalNumber(event, "fromCenterLng", fromStay.centerLng);
  assignOptionalNumber(event, "toCenterLat", toStay.centerLat);
  assignOptionalNumber(event, "toCenterLng", toStay.centerLng);
  return event;
}

function applyPointMetadata(target, point) {
  assignOptionalText(target, "source", point.source);
  assignOptionalText(target, "trigger", point.trigger);
  assignOptionalText(target, "deviceName", point.deviceName);
  assignOptionalText(target, "shortcutName", point.shortcutName);
  assignOptionalText(target, "placeTag", point.placeTag);
  assignOptionalText(target, "address", point.address);
  assignOptionalNumber(target, "batteryLevel", point.batteryLevel);
}

function normalizeStay(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const centerLat = normalizeFiniteNumber(value.centerLat);
  const centerLng = normalizeFiniteNumber(value.centerLng);
  const enteredAt = normalizeIsoTime(value.enteredAt);
  const lastSeenAt = normalizeIsoTime(value.lastSeenAt);
  if (centerLat == null || centerLng == null || !enteredAt || !lastSeenAt) {
    return null;
  }

  const stay = {
    id: normalizeText(value.id) || crypto.randomUUID(),
    enteredAt,
    lastSeenAt,
    centerLat,
    centerLng,
    sampleCount: normalizePositiveInt(value.sampleCount, 1),
  };
  assignOptionalText(stay, "source", value.source);
  assignOptionalText(stay, "trigger", value.trigger);
  assignOptionalText(stay, "deviceName", value.deviceName);
  assignOptionalText(stay, "shortcutName", value.shortcutName);
  assignOptionalText(stay, "placeTag", value.placeTag);
  assignOptionalText(stay, "address", value.address);
  assignOptionalNumber(stay, "batteryLevel", value.batteryLevel);
  const leftAt = normalizeIsoTime(value.leftAt);
  if (leftAt) {
    stay.leftAt = leftAt;
  }
  return stay;
}

function normalizeMovementEvent(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const movedAt = normalizeIsoTime(value.movedAt);
  const distanceMeters = normalizePositiveInt(value.distanceMeters, 0);
  if (!movedAt || !distanceMeters) {
    return null;
  }

  const event = {
    id: normalizeText(value.id) || crypto.randomUUID(),
    movedAt,
    distanceMeters,
    fromStayId: normalizeText(value.fromStayId),
    toStayId: normalizeText(value.toStayId),
  };
  assignOptionalText(event, "fromAddress", value.fromAddress);
  assignOptionalText(event, "toAddress", value.toAddress);
  assignOptionalText(event, "fromPlaceTag", value.fromPlaceTag);
  assignOptionalText(event, "toPlaceTag", value.toPlaceTag);
  assignOptionalNumber(event, "fromCenterLat", value.fromCenterLat);
  assignOptionalNumber(event, "fromCenterLng", value.fromCenterLng);
  assignOptionalNumber(event, "toCenterLat", value.toCenterLat);
  assignOptionalNumber(event, "toCenterLng", value.toCenterLng);
  return event;
}

function normalizePendingBreak(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const centerLat = normalizeFiniteNumber(value.centerLat);
  const centerLng = normalizeFiniteNumber(value.centerLng);
  const enteredAt = normalizeIsoTime(value.enteredAt);
  const lastSeenAt = normalizeIsoTime(value.lastSeenAt);
  if (centerLat == null || centerLng == null || !enteredAt || !lastSeenAt) {
    return null;
  }
  const pendingBreak = {
    enteredAt,
    lastSeenAt,
    centerLat,
    centerLng,
    sampleCount: normalizePositiveInt(value.sampleCount, 1),
  };
  assignOptionalText(pendingBreak, "source", value.source);
  assignOptionalText(pendingBreak, "trigger", value.trigger);
  assignOptionalText(pendingBreak, "deviceName", value.deviceName);
  assignOptionalText(pendingBreak, "shortcutName", value.shortcutName);
  assignOptionalText(pendingBreak, "placeTag", value.placeTag);
  assignOptionalText(pendingBreak, "address", value.address);
  assignOptionalNumber(pendingBreak, "batteryLevel", value.batteryLevel);
  return pendingBreak;
}

function normalizeStayArray(values, limit) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map(normalizeStay).filter(Boolean).slice(-limit);
}

function normalizeMovementEventArray(values, limit) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map(normalizeMovementEvent).filter(Boolean).slice(-limit);
}

function appendBatteryObservation(state, point, limit) {
  if (!Number.isFinite(point?.batteryLevel)) {
    return;
  }
  state.batteryObservations.push({
    timestamp: point.timestamp,
    batteryLevel: point.batteryLevel,
  });
  state.batteryObservations.sort((left, right) => compareIsoTime(right.timestamp, left.timestamp));
  state.batteryObservations = state.batteryObservations.slice(0, limit);
}

function normalizeBatteryObservationArray(values, limit) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map(normalizeBatteryObservation)
    .filter(Boolean)
    .sort((left, right) => compareIsoTime(right.timestamp, left.timestamp))
    .slice(0, limit);
}

function normalizeBatteryObservation(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const timestamp = normalizeIsoTime(value.timestamp || value.lastSeenAt || value.receivedAt);
  const batteryLevel = normalizeFiniteNumber(value.batteryLevel);
  if (!timestamp || batteryLevel == null) {
    return null;
  }
  return { timestamp, batteryLevel };
}

function normalizeKnownPlaces(values, fallbackRadiusMeters) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => normalizeKnownPlace(value, fallbackRadiusMeters))
    .filter(Boolean);
}

function normalizeKnownPlace(value, fallbackRadiusMeters) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const tag = normalizeText(value.tag);
  const latitude = normalizeFiniteNumber(value.latitude ?? value.centerLat);
  const longitude = normalizeFiniteNumber(value.longitude ?? value.centerLng);
  if (!tag || latitude == null || longitude == null) {
    return null;
  }
  return {
    tag,
    latitude,
    longitude,
    radiusMeters: normalizePositiveInt(value.radiusMeters, fallbackRadiusMeters),
  };
}

function applyKnownPlaceTag(record, knownPlaces) {
  if (!record || !Array.isArray(knownPlaces) || !knownPlaces.length) {
    return record;
  }
  const latitude = record.latitude ?? record.centerLat;
  const longitude = record.longitude ?? record.centerLng;
  if (normalizeFiniteNumber(latitude) == null || normalizeFiniteNumber(longitude) == null) {
    return record;
  }
  let bestMatch = null;
  for (const place of knownPlaces) {
    const distanceMeters = computeDistanceMeters(place.latitude, place.longitude, latitude, longitude);
    if (distanceMeters <= place.radiusMeters && (!bestMatch || distanceMeters < bestMatch.distanceMeters)) {
      bestMatch = { place, distanceMeters };
    }
  }
  if (bestMatch) {
    record.placeTag = bestMatch.place.tag;
  } else {
    delete record.placeTag;
  }
  return record;
}

function normalizeIsoTime(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return new Date(parsed).toISOString();
}

function maxIsoTime(left, right) {
  return compareIsoTime(left, right) >= 0 ? left : right;
}

function compareIsoTime(left, right) {
  return Date.parse(left || "") - Date.parse(right || "");
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFiniteNumber(value) {
  if (value === "" || value == null) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizePositiveInt(value, fallback) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function assignOptionalNumber(target, key, value) {
  const normalized = normalizeFiniteNumber(value);
  if (normalized != null) {
    target[key] = normalized;
  }
}

function assignOptionalText(target, key, value) {
  const normalized = normalizeText(value);
  if (normalized) {
    target[key] = normalized;
  }
}

function computeDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

module.exports = {
  LocationStore,
  computeDistanceMeters,
  normalizeLocationPoint,
};
