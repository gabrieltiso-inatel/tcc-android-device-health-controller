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

test("pairs a device once and authenticates its token", () => {
  const store = new DeviceStore(
    ":memory:",
    () => "2026-09-19T12:00:00.000Z",
    () => "command-1",
    () => "123456",
    () => "device-token",
  );

  const pairingCode = store.createPairingCode();
  const credential = store.pairDevice(pairingCode.code, "device-1", "Pixel");

  assert.equal(credential?.token, "device-token");
  assert.equal(store.authenticateDevice("device-1", "device-token"), true);
  assert.equal(store.authenticateDevice("device-1", "wrong-token"), false);
  assert.equal(store.pairDevice(pairingCode.code, "device-2", "Tablet"), undefined);
  store.close();
});

test("records device contact without replacing telemetry", () => {
  const timestamps = ["2026-09-19T12:00:00.000Z", "2026-09-19T12:00:30.000Z"];
  const store = new DeviceStore(":memory:", () => timestamps.shift() ?? "2026-09-19T12:00:30.000Z");
  store.receiveTelemetry("device-1", {
    deviceName: "Pixel",
    batteryPercentage: 80,
    isCharging: false,
    capturedAt: "2026-09-19T11:59:00.000Z",
  });

  store.recordDeviceContact("device-1");

  assert.equal(store.getDevice("device-1")?.lastSeenAt, "2026-09-19T12:00:30.000Z");
  assert.equal(store.getDevice("device-1")?.capturedAt, "2026-09-19T11:59:00.000Z");
  store.close();
});

test("retries command delivery and expires it after the attempt limit", () => {
  let currentTime = "2026-09-19T12:00:00.000Z";
  const store = new DeviceStore(
    ":memory:",
    () => currentTime,
    () => "command-1",
    () => "123456",
    () => "device-token",
    60_000,
    2,
  );
  store.receiveTelemetry("device-1", {
    deviceName: "Pixel",
    batteryPercentage: 80,
    isCharging: false,
    capturedAt: currentTime,
  });
  store.createCommand("device-1", "collectTelemetry");

  assert.equal(store.getPendingCommands("device-1")[0]?.attemptCount, 1);

  currentTime = "2026-09-19T12:00:30.000Z";
  assert.equal(store.getPendingCommands("device-1").length, 0);

  currentTime = "2026-09-19T12:01:01.000Z";
  assert.equal(store.getPendingCommands("device-1")[0]?.attemptCount, 2);

  currentTime = "2026-09-19T12:02:02.000Z";
  assert.equal(store.getPendingCommands("device-1").length, 0);
  assert.equal(store.getCommandHistory("device-1")[0]?.status, "expired");
  store.close();
});
