const os = require("os");
const path = require("path");

function readConfig(argv = process.argv.slice(2)) {
  const stateDir = readTextEnv("WHEREABOUTS_STATE_DIR") || path.join(os.homedir(), ".whereabouts-mcp");
  return {
    argv,
    command: normalizeText(argv[0]) || "help",
    stateDir,
    storeFile: readTextEnv("WHEREABOUTS_STORE_FILE") || path.join(stateDir, "locations.json"),
    host: readTextEnv("WHEREABOUTS_HOST") || "0.0.0.0",
    port: readIntEnv("WHEREABOUTS_PORT") || 4318,
    token: readTextEnv("WHEREABOUTS_TOKEN"),
    historyLimit: readIntEnv("WHEREABOUTS_HISTORY_LIMIT") || 1000,
    movementEventLimit: readIntEnv("WHEREABOUTS_MOVEMENT_EVENT_LIMIT"),
    batteryHistoryLimit: readIntEnv("WHEREABOUTS_BATTERY_HISTORY_LIMIT"),
    knownPlaces: readKnownPlacesEnv(),
    knownPlaceRadiusMeters: readIntEnv("WHEREABOUTS_PLACE_RADIUS_METERS") || 150,
    stayMergeRadiusMeters: readIntEnv("WHEREABOUTS_STAY_MERGE_RADIUS_METERS") || 100,
    stayBreakConfirmRadiusMeters: readIntEnv("WHEREABOUTS_STAY_BREAK_RADIUS_METERS") || 200,
    stayBreakConfirmSamples: readIntEnv("WHEREABOUTS_STAY_BREAK_SAMPLES") || 2,
    majorMoveThresholdMeters: readIntEnv("WHEREABOUTS_MAJOR_MOVE_THRESHOLD_METERS") || 1000,
  };
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readTextEnv(name) {
  return normalizeText(process.env[name]);
}

function readIntEnv(name) {
  const value = readTextEnv(name);
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readKnownPlacesEnv() {
  const fromJson = parseKnownPlacesJson(readTextEnv("WHEREABOUTS_KNOWN_PLACES"));
  const fromCenters = [
    parseKnownPlaceCenter("home", readTextEnv("WHEREABOUTS_HOME_CENTER")),
    parseKnownPlaceCenter("work", readTextEnv("WHEREABOUTS_WORK_CENTER")),
  ].filter(Boolean);
  return [...fromJson, ...fromCenters];
}

function parseKnownPlacesJson(value) {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseKnownPlaceCenter(tag, value) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) {
    return null;
  }
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { tag, latitude, longitude };
}

module.exports = { readConfig };
