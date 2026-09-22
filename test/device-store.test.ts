import assert from "node:assert/strict";
import test from "node:test";
import { DeviceStore } from "../src/device-store.js";

test("stores telemetry and completes a controller command", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:00:00.000Z", () => "command-1");
  store.receiveTelemetry("device-1", {
    deviceName: "Pixel",
    batteryPercentage: 80,
    isCharging: false,
    capturedAt: "2026-09-19T11:59:00.000Z",
  });

  const command = store.createCommand("device-1", "collectTelemetry");

  assert.equal(command?.id, "command-1");
  assert.equal(store.getPendingCommands("device-1").length, 1);

  const completedCommand = store.completeCommand("command-1", true, "Telemetry sent");

  assert.equal(completedCommand?.status, "completed");
  assert.equal(store.getPendingCommands("device-1").length, 0);
  store.close();
});
