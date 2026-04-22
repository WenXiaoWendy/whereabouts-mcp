const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { LocationStore } = require("../src/location-store");
const { WhereaboutsService } = require("../src/whereabouts-service");
const { WhereaboutsToolHost } = require("../src/tool-host");

function createService() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whereabouts-tool-host-test-"));
  const store = new LocationStore({ filePath: path.join(dir, "locations.json") });
  return new WhereaboutsService({ store });
}

function isoAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

test("snapshot tool returns current stay and recent history", async () => {
  const service = createService();
  service.appendPoint({ latitude: 22.6, longitude: 114.0, address: "Home" });
  service.appendPoint({ latitude: 22.6001, longitude: 114.0001, address: "Home" });
  service.appendPoint({ latitude: 22.61, longitude: 114.01, address: "Office" });
  service.appendPoint({ latitude: 22.6101, longitude: 114.0101, address: "Office" });

  const host = new WhereaboutsToolHost({ service });
  const result = await host.invokeTool("whereabouts_snapshot", { stayLimit: 5, moveLimit: 5 });

  assert.equal(result.data.currentStay.address, "Office");
  assert.ok("durationMs" in result.data.currentStay);
  assert.equal(result.data.recentStays.length, 1);
  assert.equal(result.data.recentMovementEvents.length, 1);
});

test("summary tool returns duration, mobility state, places, moves, and battery trend", async () => {
  const service = createService();
  service.appendPoint({
    latitude: 22.6,
    longitude: 114.0,
    timestamp: isoAgo(4),
    address: "Home",
    placeId: "home",
    placeLabel: "Home",
    batteryLevel: 51,
  });
  service.appendPoint({
    latitude: 22.6001,
    longitude: 114.0001,
    timestamp: isoAgo(3),
    address: "Home",
    placeId: "home",
    placeLabel: "Home",
    batteryLevel: 40,
  });
  service.appendPoint({
    latitude: 22.61,
    longitude: 114.01,
    timestamp: isoAgo(2),
    address: "Office",
    placeId: "work",
    placeLabel: "Work",
    batteryLevel: 10,
  });
  service.appendPoint({
    latitude: 22.6101,
    longitude: 114.0101,
    timestamp: isoAgo(1),
    address: "Office",
    placeId: "work",
    placeLabel: "Work",
    batteryLevel: 6,
  });

  const host = new WhereaboutsToolHost({ service });
  const result = await host.invokeTool("whereabouts_summary", { range: "month" });

  assert.equal(result.data.range, "month");
  assert.equal(result.data.mobilityState.state, "staying");
  assert.equal(result.data.moveCount, 1);
  assert.equal(result.data.knownPlaces.length, 2);
  assert.equal(result.data.batteryTrend.source, "raw_samples");
  assert.equal(result.data.batteryTrend.firstLevelPercent, 51);
  assert.equal(result.data.batteryTrend.latestLevelPercent, 6);
  assert.equal(result.data.batteryTrend.deltaPercent, -45);
});

test("current stay tool returns empty state when no data exists", async () => {
  const host = new WhereaboutsToolHost({ service: createService() });
  const result = await host.invokeTool("whereabouts_current_stay", {});
  assert.equal(result.data.currentStay, null);
});

test("tool host rejects unknown fields", async () => {
  const host = new WhereaboutsToolHost({ service: createService() });
  await assert.rejects(
    host.invokeTool("whereabouts_recent_stays", { bad: true }),
    /input.bad is not allowed/
  );
  await assert.rejects(
    host.invokeTool("whereabouts_summary", { range: "year" }),
    /input.range must be one of/
  );
});

test("tool host does not expose write-side ingest tools", () => {
  const host = new WhereaboutsToolHost({ service: createService() });
  assert.equal(
    host.listTools().some((tool) => tool.name === "whereabouts_ingest_point"),
    false
  );
  assert.equal(
    host.listTools().some((tool) => tool.name === "whereabouts_summary"),
    true
  );
});
