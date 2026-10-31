import assert from "node:assert/strict";
import test from "node:test";
import { DeviceStore } from "../src/device-store.js";
import { createControllerServer } from "../src/server.js";

test("reads only the authenticated device snapshots without creating actions or refreshing contact", async () => {
  const store = new DeviceStore(":memory:");
  const server = createControllerServer(store);
  try {
    const credential = store.pairDevice(store.createPairingCode().code, "device-1", "Phone");
    assert.ok(credential);
    const other = store.pairDevice(store.createPairingCode().code, "device-2", "Other phone");
    assert.ok(other);
    const url = "/api/devices/device-1/state";
    assert.equal((await server.inject({ url })).statusCode, 401);
    assert.equal((await server.inject({ url, headers: { authorization: `Bearer ${other.token}` } })).statusCode, 401);
    const headers = { authorization: `Bearer ${credential.token}` };
    const empty = await server.inject({ url, headers });
    assert.equal(empty.statusCode, 200);
    assert.deepEqual(empty.json(), { storage: null, apps: null, files: null });

    const capturedAt = new Date().toISOString();
    store.receiveTelemetry("device-1", {
      deviceName: "Phone", manufacturer: "Google", model: "Pixel", androidVersion: "14", apiLevel: 34,
      agentVersion: "0.1", capabilities: [], batteryPercentage: 80, isCharging: false, capturedAt,
    });
    store.receiveStorageSummary("device-1", { totalBytes: 100, usedBytes: 40, availableBytes: 60, capturedAt });
    store.receiveAppInventory("device-1", { capturedAt, apps: [] });
    store.receiveFileInventory("device-1", { capturedAt, sources: [], files: [] });
    const lastSeenAt = store.getDevice("device-1")?.lastSeenAt;
    const response = await server.inject({ url, headers });
    assert.equal(response.json().storage.availableBytes, 60);
    assert.deepEqual(response.json().apps.apps, []);
    assert.deepEqual(response.json().files.files, []);
    assert.deepEqual(store.getActionHistory("device-1"), []);
    assert.equal(store.getDevice("device-1")?.lastSeenAt, lastSeenAt);
  } finally {
    await server.close();
  }
});
