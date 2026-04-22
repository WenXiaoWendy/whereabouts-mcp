const { readConfig } = require("./config");
const { LocationStore, computeDistanceMeters, normalizeLocationPoint } = require("./location-store");
const {
  createLocationIngestServer,
  ingestLocationPayload,
  startLocationIngestServer,
} = require("./location-ingest-server");
const {
  computeRecordDurationMs,
  formatCoordinatePair,
  formatDisplayTime,
  formatDuration,
  printLocationRecord,
  printMovementRecord,
  resolveDisplayTimeZone,
  serializeLocationHistoryForOutput,
  serializeLocationMovesForOutput,
  serializeLocationRecordForOutput,
} = require("./location-format");
const { WhereaboutsService } = require("./whereabouts-service");
const { WhereaboutsToolHost } = require("./tool-host");
const { runWhereaboutsMcpServer } = require("./mcp-stdio-server");

module.exports = {
  computeRecordDurationMs,
  computeDistanceMeters,
  createLocationIngestServer,
  formatCoordinatePair,
  formatDisplayTime,
  formatDuration,
  ingestLocationPayload,
  LocationStore,
  normalizeLocationPoint,
  printLocationRecord,
  printMovementRecord,
  readConfig,
  resolveDisplayTimeZone,
  runWhereaboutsMcpServer,
  serializeLocationHistoryForOutput,
  serializeLocationMovesForOutput,
  serializeLocationRecordForOutput,
  startLocationIngestServer,
  WhereaboutsService,
  WhereaboutsToolHost,
};
