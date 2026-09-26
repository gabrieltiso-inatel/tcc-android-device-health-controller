import assert from "node:assert/strict";
import test from "node:test";
import { DeviceStore } from "../src/device-store.js";
import { createControllerServer } from "../src/server.js";

const telemetry = {
  deviceName: "Pixel",
  manufacturer: "Google",
  model: "Pixel 8",
  androidVersion: "14",
  apiLevel: 34,
  agentVersion: "0.1.0",
  capabilities: ["collectTelemetry", "collectStorageSummary", "collectAppInventory"],
  batteryPercentage: 50,
  isCharging: false,
  capturedAt: "2026-09-19T12:00:00.000Z",
};

test("accepts telemetry and creates collection actions", async () => {
  const store = new DeviceStore(":memory:");
  const server = createControllerServer(store);
  await server.ready();

  try {
    const pairingCodeResponse = await server.inject({ method: "POST", url: "/api/pairing-codes" });
    const code = pairingCodeResponse.json().pairingCode.code as string;
    const pairingResponse = await server.inject({
      method: "POST",
      url: "/api/devices/pair",
      payload: { code, deviceId: "device-1", deviceName: "Pixel" },
    });
    assert.equal(pairingResponse.statusCode, 201);
    const token = pairingResponse.json().token as string;

    const telemetryResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/telemetry",
      headers: { authorization: `Bearer ${token}` },
      payload: telemetry,
    });
    assert.equal(telemetryResponse.statusCode, 200);

    const actionResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/actions",
      payload: { type: "collectTelemetry" },
    });
    assert.equal(actionResponse.statusCode, 201);
    assert.equal(actionResponse.json().action.origin, "controller");

    const storageActionResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/actions",
      payload: { type: "collectStorageSummary" },
    });
    assert.equal(storageActionResponse.statusCode, 201);
    const storageActionId = storageActionResponse.json().action.id as string;

    const actionsResponse = await server.inject({
      method: "GET",
      url: "/api/devices/device-1/actions",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.deepEqual(
      actionsResponse.json().actions.map((action: { type: string }) => action.type),
      ["collectTelemetry", "collectStorageSummary"],
    );

    const resultResponse = await server.inject({
      method: "POST",
      url: `/api/actions/${storageActionId}/result`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        succeeded: true,
        message: "Storage summary collected",
        result: {
          totalBytes: 100,
          usedBytes: 60,
          availableBytes: 40,
          capturedAt: "2026-09-19T12:00:00.000Z",
        },
      },
    });
    assert.equal(resultResponse.statusCode, 200);
    assert.equal(resultResponse.json().action.result.availableBytes, 40);

    const appActionResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/actions",
      payload: { type: "collectAppInventory" },
    });
    assert.equal(appActionResponse.statusCode, 201);
    const appActionId = appActionResponse.json().action.id as string;
    await server.inject({
      method: "GET",
      url: "/api/devices/device-1/actions",
      headers: { authorization: `Bearer ${token}` },
    });
    const appResultResponse = await server.inject({
      method: "POST",
      url: `/api/actions/${appActionId}/result`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        succeeded: true,
        message: "App inventory collected",
        result: {
          capturedAt: "2026-09-19T12:00:00.000Z",
          apps: [{
            packageName: "com.example.notes",
            name: "Notes",
            versionName: "2.1",
            versionCode: 21,
            installedAt: "2026-09-01T12:00:00.000Z",
            updatedAt: "2026-09-10T12:00:00.000Z",
          }],
        },
      },
    });
    assert.equal(appResultResponse.statusCode, 200);

    const deviceActionResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/actions",
      headers: { authorization: `Bearer ${token}` },
      payload: { type: "collectTelemetry" },
    });
    assert.equal(deviceActionResponse.statusCode, 201);
    assert.equal(deviceActionResponse.json().action.origin, "device");
    assert.equal(deviceActionResponse.json().action.status, "delivered");

    const historyResponse = await server.inject({ method: "GET", url: "/api/devices/device-1/history" });
    assert.equal(historyResponse.statusCode, 200);
    assert.equal(historyResponse.json().actions[0].origin, "device");

    const detailResponse = await server.inject({ method: "GET", url: "/devices/device-1" });
    assert.equal(detailResponse.statusCode, 200);
    assert.match(detailResponse.body, /Storage summary collected/);
    assert.match(detailResponse.body, /60 B of 100 B/);
    assert.match(detailResponse.body, /Update storage/);
    assert.match(detailResponse.body, /Notes/);
    assert.match(detailResponse.body, /com\.example\.notes/);
    assert.match(detailResponse.body, /Update apps/);
    assert.match(detailResponse.body, /Origin device/);

    const unauthorizedResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/telemetry",
      payload: telemetry,
    });
    assert.equal(unauthorizedResponse.statusCode, 401);
  } finally {
    await server.close();
  }
});
