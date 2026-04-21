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

test("snapshot tool returns current stay and recent history", async () => {
  const service = createService();
  service.appendPoint({ latitude: 22.6, longitude: 114.0, address: "Home" });
  service.appendPoint({ latitude: 22.6001, longitude: 114.0001, address: "Home" });
  service.appendPoint({ latitude: 22.61, longitude: 114.01, address: "Office" });
  service.appendPoint({ latitude: 22.6101, longitude: 114.0101, address: "Office" });

  const host = new WhereaboutsToolHost({ service });
  const result = await host.invokeTool("whereabouts_snapshot", { stayLimit: 5, moveLimit: 5 });

  assert.equal(result.data.currentStay.address, "Office");
  assert.equal(result.data.recentStays.length, 1);
  assert.equal(result.data.recentMovementEvents.length, 1);
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
});
