import assert from "node:assert/strict";
import test from "node:test";
import { DeviceStore } from "../src/device-store.js";

const telemetry = {
  deviceName: "Pixel",
  manufacturer: "Google",
  model: "Pixel 8",
  androidVersion: "14",
  apiLevel: 34,
  agentVersion: "0.1.0",
  capabilities: ["collectTelemetry" as const, "collectStorageSummary" as const, "collectAppInventory" as const, "removeApplication" as const],
  batteryPercentage: 80,
  isCharging: false,
  capturedAt: "2026-09-19T11:59:00.000Z",
};

const notesAndCalendarInventory = {
  capturedAt: "2026-09-19T12:00:00.000Z",
  apps: [
    {
      applicationId: "com.example.notes",
      name: "Notes",
      canRemove: true,
      versionName: "2.1",
      versionCode: 21,
      installedAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-10T12:00:00.000Z",
    },
    {
      applicationId: "com.example.calendar",
      name: "Calendar",
      canRemove: true,
      versionName: "1.0",
      versionCode: 10,
      installedAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-10T12:00:00.000Z",
    },
  ],
};

test("stores telemetry and completes a controller action", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:00:00.000Z", () => "action-1");
  store.receiveTelemetry("device-1", telemetry);

  const action = store.createAction("device-1", "collectTelemetry", "controller");

  assert.equal(action?.id, "action-1");
  assert.equal(action?.origin, "controller");
  assert.equal(store.getPendingActions("device-1").length, 1);

  const completedAction = store.completeAction("action-1", true, "Telemetry sent");

  assert.equal(completedAction?.status, "completed");
  assert.equal(store.getPendingActions("device-1").length, 0);
  store.close();
});

test("stores an action target as an opaque application identifier", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:00:00.000Z", () => "action-1");
  store.receiveTelemetry("device-1", telemetry);

  const action = store.createAction("device-1", "removeApplication", "controller", {
    applicationId: "application.notes",
  });

  assert.deepEqual(action?.payload, { applicationId: "application.notes" });
  assert.deepEqual(store.getPendingActions("device-1")[0]?.payload, { applicationId: "application.notes" });
  store.close();
});

test("keeps an action awaiting approval until it receives a final result", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:00:00.000Z", () => "action-1");
  store.receiveTelemetry("device-1", telemetry);
  store.createAction("device-1", "removeApplication", "controller", { applicationId: "application.notes" });

  const awaitingApproval = store.completeAction(
    "action-1",
    false,
    "Application removal requires approval",
    "approval_required",
    undefined,
    "awaiting_approval",
  );

  assert.equal(awaitingApproval?.status, "awaiting_approval");
  assert.equal(store.getPendingActions("device-1").length, 0);

  const completed = store.completeAction(
    "action-1",
    true,
    "Application removed",
    "application_removed",
    undefined,
    "completed",
  );
  assert.equal(completed?.status, "completed");
  store.close();
});

test("accepts a repeated final result without changing the recorded outcome", () => {
  const timestamps = ["2026-09-19T12:00:00.000Z", "2026-09-19T12:00:10.000Z", "2026-09-19T12:00:20.000Z"];
  const store = new DeviceStore(":memory:", () => timestamps.shift() ?? "2026-09-19T12:00:20.000Z", () => "action-1");
  store.receiveTelemetry("device-1", telemetry);
  store.createAction("device-1", "removeApplication", "controller", { applicationId: "application.notes" });
  const completed = store.completeAction("action-1", true, "Application removed", "application_removed", undefined, "completed");

  const repeated = store.completeAction("action-1", true, "Application was already absent", "already_absent", undefined, "completed");

  assert.deepEqual(repeated, completed);
  assert.equal(store.getAction("action-1")?.resultCode, "application_removed");
  store.close();
});

test("rejects a different result for a finalized action", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:00:00.000Z", () => "action-1");
  store.receiveTelemetry("device-1", telemetry);
  store.createAction("device-1", "removeApplication", "controller", { applicationId: "application.notes" });
  store.completeAction("action-1", false, "Application removal cancelled", "approval_declined", undefined, "cancelled");

  const conflicting = store.completeAction("action-1", true, "Application removed", "application_removed", undefined, "completed");

  assert.equal(conflicting, undefined);
  assert.equal(store.getAction("action-1")?.status, "cancelled");
  store.close();
});

test("removes the application from the inventory when its removal completes", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:00:00.000Z", () => "action-1");
  store.receiveTelemetry("device-1", telemetry);
  store.receiveAppInventory("device-1", notesAndCalendarInventory);
  store.createAction("device-1", "removeApplication", "controller", { applicationId: "com.example.notes" });

  store.completeAction("action-1", true, "Application removed", "application_removed", undefined, "completed");

  assert.deepEqual(
    store.getAppInventorySnapshot("device-1")?.apps.map((app) => app.applicationId),
    ["com.example.calendar"],
  );
  store.close();
});

test("keeps the application in the inventory when its removal is cancelled", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:00:00.000Z", () => "action-1");
  store.receiveTelemetry("device-1", telemetry);
  store.receiveAppInventory("device-1", notesAndCalendarInventory);
  store.createAction("device-1", "removeApplication", "controller", { applicationId: "com.example.notes" });

  store.completeAction("action-1", false, "Application removal cancelled", "approval_declined", undefined, "cancelled");

  assert.deepEqual(
    store.getAppInventorySnapshot("device-1")?.apps.map((app) => app.applicationId),
    ["com.example.calendar", "com.example.notes"],
  );
  store.close();
});

test("pairs a device once and authenticates its token", () => {
  const store = new DeviceStore(
    ":memory:",
    () => "2026-09-19T12:00:00.000Z",
    () => "action-1",
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
  store.receiveTelemetry("device-1", telemetry);

  store.recordDeviceContact("device-1");

  assert.equal(store.getDevice("device-1")?.lastSeenAt, "2026-09-19T12:00:30.000Z");
  assert.equal(store.getDevice("device-1")?.capturedAt, telemetry.capturedAt);
  store.close();
});

test("stores the latest storage snapshot and refreshes device contact", () => {
  const timestamps = ["2026-09-19T12:00:00.000Z", "2026-09-19T12:00:30.000Z"];
  const store = new DeviceStore(":memory:", () => timestamps.shift() ?? "2026-09-19T12:00:30.000Z");
  store.receiveTelemetry("device-1", telemetry);

  const snapshot = store.receiveStorageSummary("device-1", {
    totalBytes: 100,
    usedBytes: 60,
    availableBytes: 40,
    capturedAt: "2026-09-19T12:00:29.000Z",
  });

  assert.deepEqual(snapshot, {
    totalBytes: 100,
    usedBytes: 60,
    availableBytes: 40,
    capturedAt: "2026-09-19T12:00:29.000Z",
    receivedAt: "2026-09-19T12:00:30.000Z",
  });
  assert.deepEqual(store.getStorageSnapshot("device-1"), snapshot);
  assert.equal(store.getDevice("device-1")?.lastSeenAt, "2026-09-19T12:00:30.000Z");
  store.close();
});

test("does not replace a newer storage snapshot with a delayed result", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:01:00.000Z");
  store.receiveTelemetry("device-1", telemetry);
  const latest = store.receiveStorageSummary("device-1", {
    totalBytes: 100,
    usedBytes: 70,
    availableBytes: 30,
    capturedAt: "2026-09-19T12:01:00.000Z",
  });

  const delayed = store.receiveStorageSummary("device-1", {
    totalBytes: 100,
    usedBytes: 60,
    availableBytes: 40,
    capturedAt: "2026-09-19T12:00:00.000Z",
  });

  assert.deepEqual(delayed, latest);
  assert.deepEqual(store.getStorageSnapshot("device-1"), latest);
  store.close();
});

test("rejects an inconsistent storage summary", () => {
  const store = new DeviceStore(":memory:");
  store.receiveTelemetry("device-1", telemetry);

  assert.throws(() => store.receiveStorageSummary("device-1", {
    totalBytes: 100,
    usedBytes: 80,
    availableBytes: 40,
    capturedAt: "2026-09-19T12:00:00.000Z",
  }), /inconsistent/);
  store.close();
});

test("retries action delivery and expires it after the attempt limit", () => {
  let currentTime = "2026-09-19T12:00:00.000Z";
  const store = new DeviceStore(
    ":memory:",
    () => currentTime,
    () => "action-1",
    () => "123456",
    () => "device-token",
    60_000,
    2,
  );
  store.receiveTelemetry("device-1", { ...telemetry, capturedAt: currentTime });
  store.createAction("device-1", "collectTelemetry", "controller");

  assert.equal(store.getPendingActions("device-1")[0]?.attemptCount, 1);

  currentTime = "2026-09-19T12:00:30.000Z";
  assert.equal(store.getPendingActions("device-1").length, 0);

  currentTime = "2026-09-19T12:01:01.000Z";
  assert.equal(store.getPendingActions("device-1")[0]?.attemptCount, 2);

  currentTime = "2026-09-19T12:02:02.000Z";
  assert.equal(store.getPendingActions("device-1").length, 0);
  assert.equal(store.getActionHistory("device-1")[0]?.status, "expired");
  store.close();
});

test("stores a safe action error code", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:00:00.000Z", () => "action-1");
  store.receiveTelemetry("device-1", telemetry);
  store.createAction("device-1", "collectTelemetry", "controller");

  const action = store.completeAction("action-1", false, "Action execution failed", "execution_failed");

  assert.equal(action?.status, "failed");
  assert.equal(action?.resultCode, "execution_failed");
  assert.equal(action?.resultMessage, "Action execution failed");
  store.close();
});

test("stores a structured action result", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:00:00.000Z", () => "action-1");
  store.receiveTelemetry("device-1", telemetry);
  store.createAction("device-1", "collectStorageSummary", "controller");

  const action = store.completeAction(
    "action-1",
    true,
    "Storage summary collected",
    undefined,
    { totalBytes: 100, usedBytes: 60, availableBytes: 40, capturedAt: "2026-09-19T12:00:00.000Z" },
  );

  assert.deepEqual(action?.result, {
    totalBytes: 100,
    usedBytes: 60,
    availableBytes: 40,
    capturedAt: "2026-09-19T12:00:00.000Z",
  });
  assert.deepEqual(store.getActionHistory("device-1")[0]?.result, action?.result);
  assert.deepEqual(store.getStorageSnapshot("device-1"), {
    totalBytes: 100,
    usedBytes: 60,
    availableBytes: 40,
    capturedAt: "2026-09-19T12:00:00.000Z",
    receivedAt: "2026-09-19T12:00:00.000Z",
  });
  store.close();
});

test("stores an app inventory result", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:00:00.000Z", () => "action-1");
  store.receiveTelemetry("device-1", telemetry);
  store.createAction("device-1", "collectAppInventory", "controller");
  const inventory = {
    capturedAt: "2026-09-19T12:00:00.000Z",
    apps: [{
      applicationId: "com.example.notes",
      name: "Notes",
      canRemove: true,
      versionName: "2.1",
      versionCode: 21,
      installedAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-10T12:00:00.000Z",
    }],
  };

  const action = store.completeAction("action-1", true, "App inventory collected", undefined, inventory);

  assert.deepEqual(action?.result, inventory);
  assert.deepEqual(store.getActionHistory("device-1")[0]?.result, inventory);
  store.close();
});

test("stores the current app inventory atomically", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:00:00.000Z");
  store.receiveTelemetry("device-1", telemetry);
  const inventory = {
    capturedAt: "2026-09-19T12:00:00.000Z",
    apps: [{
      applicationId: "com.example.notes",
      name: "Notes",
      canRemove: true,
      versionName: "2.1",
      versionCode: 21,
      installedAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-10T12:00:00.000Z",
    }],
  };

  const snapshot = store.receiveAppInventory("device-1", inventory);

  assert.deepEqual(snapshot.apps, inventory.apps);
  assert.deepEqual(store.getAppInventorySnapshot("device-1"), snapshot);
  store.close();
});

test("rejects an action that the device does not support", () => {
  const store = new DeviceStore(":memory:");
  store.receiveTelemetry("device-1", { ...telemetry, capabilities: [] });

  assert.equal(store.createAction("device-1", "collectTelemetry", "controller"), undefined);
  store.close();
});

test("device actions are recorded without entering the delivery queue", () => {
  const store = new DeviceStore(":memory:", () => "2026-09-19T12:00:00.000Z", () => "action-1");
  store.receiveTelemetry("device-1", telemetry);

  const action = store.createAction("device-1", "collectStorageSummary", "device");

  assert.equal(action?.origin, "device");
  assert.equal(action?.status, "delivered");
  assert.equal(store.getPendingActions("device-1").length, 0);
  assert.equal(store.getActionHistory("device-1")[0]?.origin, "device");
  store.close();
});
