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
    stayMergeRadiusMeters: readIntEnv("WHEREABOUTS_STAY_MERGE_RADIUS_METERS") || 50,
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

module.exports = { readConfig };
