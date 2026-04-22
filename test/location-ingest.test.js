const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { ingestLocationPayload } = require("../src/location-ingest-server");
const { LocationStore } = require("../src/location-store");

function createTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whereabouts-mcp-test-"));
  return path.join(dir, "locations.json");
}

test("location store keeps latest entry and bounded history", () => {
  const filePath = createTempStore();
  const store = new LocationStore({ filePath, historyLimit: 2 });

  store.append({ latitude: 22.6, longitude: 114.0, trigger: "first" });
  store.append({ latitude: 22.6001, longitude: 114.0001, trigger: "second" });

  const latest = store.getLatest();
  assert.equal(latest.trigger, "second");
  assert.equal(latest.sampleCount, 2);
  assert.deepEqual(store.listRecent(10), []);
});

test("location ingest accepts authorized shortcut payloads", () => {
  const filePath = createTempStore();
  const store = new LocationStore({ filePath, historyLimit: 10 });
  const response = ingestLocationPayload({
    store,
    token: "secret-token",
    authorization: "Bearer secret-token",
    bodyText: JSON.stringify({
      latitude: 22.5,
      longitude: 113.9,
      address: "Shenzhen",
      trigger: "manual",
    }),
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.body.ok, true);
  assert.equal(store.getLatest().address, "Shenzhen");
});

test("location store keeps battery observations and tags known places by coordinates", () => {
  const filePath = createTempStore();
  const store = new LocationStore({
    filePath,
    historyLimit: 10,
    batteryHistoryLimit: 2,
    knownPlaces: [{ tag: "home", latitude: 22.5, longitude: 113.9, radiusMeters: 150 }],
  });

  store.append({
    latitude: 22.5,
    longitude: 113.9,
    timestamp: "2026-04-22T01:00:00.000Z",
    batteryLevel: 51,
  });
  store.append({
    latitude: 22.5001,
    longitude: 113.9001,
    timestamp: "2026-04-22T02:00:00.000Z",
    batteryLevel: 6,
  });

  const latest = store.getLatest();
  const observations = store.listRecentBatteryObservations(10);
  assert.equal(latest.placeTag, "home");
  assert.equal(latest.batteryLevel, 6);
  assert.equal(observations.length, 2);
  assert.deepEqual(Object.keys(observations[0]).sort(), ["batteryLevel", "timestamp"]);
  assert.equal(observations[0].batteryLevel, 6);
  assert.equal(observations[1].batteryLevel, 51);
});

test("location store exposes pending break as in-transit input", () => {
  const filePath = createTempStore();
  const store = new LocationStore({ filePath, historyLimit: 10 });

  store.append({ latitude: 22.6, longitude: 114.0, address: "Home" });
  store.append({ latitude: 22.61, longitude: 114.01, address: "Road" });

  const pendingBreak = store.getPendingBreak();
  assert.ok(pendingBreak);
  assert.equal(pendingBreak.address, "Road");
});

test("location store omits empty and debug-only fields", () => {
  const filePath = createTempStore();
  const store = new LocationStore({ filePath, historyLimit: 10 });

  const result = store.append({
    latitude: 22.5,
    longitude: 113.9,
    batteryLevel: "",
    address: "",
    notes: "  ",
    trigger: "manual",
    remoteAddress: "100.1.2.3",
    userAgent: "ShortcutRunner",
  });
  const record = result.point;

  assert.equal("batteryLevel" in record, false);
  assert.equal("address" in record, false);
  assert.equal("notes" in record, false);
  assert.equal("remoteAddress" in record, false);
  assert.equal("userAgent" in record, false);
  assert.equal(record.trigger, "manual");
});

test("location store closes a stay after two stable off-site points", () => {
  const filePath = createTempStore();
  const store = new LocationStore({ filePath, historyLimit: 10 });

  store.append({ latitude: 22.6, longitude: 114.0, address: "Home" });
  store.append({ latitude: 22.6001, longitude: 114.0001, address: "Home" });
  store.append({ latitude: 22.603, longitude: 114.003, address: "Cafe" });
  const result = store.append({ latitude: 22.6031, longitude: 114.0031, address: "Cafe" });

  assert.equal(result.movementEvent, null);
  assert.equal(store.getLatest().address, "Cafe");
  assert.equal(store.getLatest().sampleCount, 2);
  assert.equal(store.listRecent(10).length, 1);
  assert.equal(store.listRecent(10)[0].address, "Home");
});

test("location store emits a movement event for major moves", () => {
  const filePath = createTempStore();
  const store = new LocationStore({ filePath, historyLimit: 10 });

  store.append({ latitude: 22.6, longitude: 114.0, address: "Home" });
  store.append({ latitude: 22.6001, longitude: 114.0001, address: "Home" });
  store.append({ latitude: 22.61, longitude: 114.01, address: "Office" });
  const result = store.append({ latitude: 22.6101, longitude: 114.0101, address: "Office" });

  assert.ok(result.movementEvent);
  assert.match(String(result.movementEvent.distanceMeters), /^\d+$/);
  assert.equal(result.movementEvent.fromAddress, "Home");
  assert.equal(result.movementEvent.toAddress, "Office");
  assert.equal(store.listRecentMovementEvents(10).length, 1);
});

test("location store exposes movement history separately from recent stays", () => {
  const filePath = createTempStore();
  const store = new LocationStore({ filePath, historyLimit: 10 });

  store.append({ latitude: 22.6, longitude: 114.0, address: "Home" });
  store.append({ latitude: 22.6001, longitude: 114.0001, address: "Home" });
  store.append({ latitude: 22.61, longitude: 114.01, address: "Office" });
  store.append({ latitude: 22.6101, longitude: 114.0101, address: "Office" });

  const stays = store.listRecent(10);
  const moves = store.listRecentMovementEvents(10);
  assert.equal(stays.length, 1);
  assert.equal(stays[0].address, "Home");
  assert.equal(moves.length, 1);
  assert.equal(moves[0].fromAddress, "Home");
  assert.equal(moves[0].toAddress, "Office");
});

test("location ingest rejects missing auth", () => {
  const filePath = createTempStore();
  const store = new LocationStore({ filePath, historyLimit: 10 });
  const response = ingestLocationPayload({
    store,
    token: "secret-token",
    authorization: "",
    bodyText: JSON.stringify({ latitude: 22.5, longitude: 113.9 }),
  });

  assert.equal(response.statusCode, 401);
  assert.equal(store.getLatest(), null);
});
