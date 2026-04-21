const { startLocationIngestServer } = require("./location-ingest-server");
const { LocationStore } = require("./location-store");
const {
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

  getSnapshot({ stayLimit = 5, moveLimit = 5 } = {}) {
    const currentStay = this.getCurrentStay();
    const recentStays = this.listRecentStays({ limit: stayLimit });
    const recentMovementEvents = this.listRecentMovementEvents({ limit: moveLimit });
    return {
      currentStay,
      recentStays,
      recentMovementEvents,
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

module.exports = { WhereaboutsService };
