const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatDisplayTime,
  serializeLocationHistoryForOutput,
  serializeLocationMovesForOutput,
  serializeLocationRecordForOutput,
} = require("../src/location-format");

test("location display time follows TZ environment", () => {
  const previousTz = process.env.TZ;
  process.env.TZ = "Asia/Shanghai";
  try {
    assert.equal(
      formatDisplayTime("2026-04-18T16:28:06.366Z"),
      "2026-04-19 00:28:06"
    );
  } finally {
    if (previousTz == null) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTz;
    }
  }
});

test("location json output includes localized time fields", () => {
  const previousTz = process.env.TZ;
  process.env.TZ = "Asia/Shanghai";
  try {
    const output = serializeLocationRecordForOutput({
      enteredAt: "2026-04-18T15:37:49.740Z",
      lastSeenAt: "2026-04-18T16:28:06.366Z",
    });
    assert.equal(output.displayTimeZone, "Asia/Shanghai");
    assert.equal(output.enteredAtLocal, "2026-04-18 23:37:49");
    assert.equal(output.lastSeenAtLocal, "2026-04-19 00:28:06");
    assert.equal(output.durationMinutes, 50);
    assert.equal(output.durationText, "50m");
  } finally {
    if (previousTz == null) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTz;
    }
  }
});

test("location history and moves json keep current stay visible", () => {
  const currentStay = {
    enteredAt: "2026-04-18T15:37:49.740Z",
    lastSeenAt: "2026-04-18T16:28:06.366Z",
  };
  const historyOutput = serializeLocationHistoryForOutput(currentStay, [], "Asia/Shanghai");
  const movesOutput = serializeLocationMovesForOutput(currentStay, [], "Asia/Shanghai");
  assert.equal(historyOutput.currentStay.enteredAtLocal, "2026-04-18 23:37:49");
  assert.equal(historyOutput.currentStay.lastSeenAtLocal, "2026-04-19 00:28:06");
  assert.equal(movesOutput.currentStay.enteredAtLocal, "2026-04-18 23:37:49");
  assert.equal(movesOutput.currentStay.lastSeenAtLocal, "2026-04-19 00:28:06");
  assert.deepEqual(historyOutput.recentStays, []);
  assert.deepEqual(movesOutput.recentMovementEvents, []);
});
