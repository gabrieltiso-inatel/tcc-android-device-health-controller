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
  capabilities: ["collectTelemetry", "collectStorageSummary", "collectAppInventory", "removeApplication"],
  batteryPercentage: 50,
  isCharging: false,
  capturedAt: "2026-09-19T12:00:00.000Z",
};

async function pairDevice(server: ReturnType<typeof createControllerServer>): Promise<string> {
  const pairingCodeResponse = await server.inject({ method: "POST", url: "/api/pairing-codes" });
  const code = pairingCodeResponse.json().pairingCode.code as string;
  const pairingResponse = await server.inject({
    method: "POST",
    url: "/api/devices/pair",
    payload: { code, deviceId: "device-1", deviceName: "Pixel" },
  });
  const token = pairingResponse.json().token as string;
  await server.inject({
    method: "POST",
    url: "/api/devices/device-1/telemetry",
    headers: { authorization: `Bearer ${token}` },
    payload: telemetry,
  });
  return token;
}

test("keeps the first final result of an application removal", async () => {
  const store = new DeviceStore(":memory:");
  const server = createControllerServer(store);
  await server.ready();

  try {
    const token = await pairDevice(server);
    await server.inject({
      method: "POST",
      url: "/api/devices/device-1/apps",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        capturedAt: "2026-09-19T12:00:02.000Z",
        apps: [{
          applicationId: "com.example.notes",
          name: "Notes",
          canRemove: true,
          versionName: "2.1",
          versionCode: 21,
          installedAt: "2026-09-01T12:00:00.000Z",
          updatedAt: "2026-09-10T12:00:00.000Z",
        }],
      },
    });
    const removalResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/actions",
      payload: { type: "removeApplication", payload: { applicationId: "com.example.notes", expectedVersionCode: 21 } },
    });
    const actionId = removalResponse.json().action.id as string;
    const cancelledResult = {
      succeeded: false,
      status: "cancelled",
      message: "Application removal cancelled",
      errorCode: "approval_declined",
    };

    const firstResponse = await server.inject({
      method: "POST",
      url: `/api/actions/${actionId}/result`,
      headers: { authorization: `Bearer ${token}` },
      payload: cancelledResult,
    });
    const repeatedResponse = await server.inject({
      method: "POST",
      url: `/api/actions/${actionId}/result`,
      headers: { authorization: `Bearer ${token}` },
      payload: cancelledResult,
    });
    const conflictingResponse = await server.inject({
      method: "POST",
      url: `/api/actions/${actionId}/result`,
      headers: { authorization: `Bearer ${token}` },
      payload: { succeeded: true, status: "completed", message: "Application removed", errorCode: "application_removed" },
    });
    const detailResponse = await server.inject({ method: "GET", url: "/devices/device-1" });

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(repeatedResponse.statusCode, 200);
    assert.equal(repeatedResponse.json().action.status, "cancelled");
    assert.equal(conflictingResponse.statusCode, 409);
    assert.match(detailResponse.body, /Application removal cancelled/);
    assert.match(detailResponse.body, /com\.example\.notes/);
  } finally {
    await server.close();
  }
});

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

    const storageResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/storage",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        totalBytes: 100,
        usedBytes: 60,
        availableBytes: 40,
        capturedAt: "2026-09-19T12:00:01.000Z",
      },
    });
    assert.equal(storageResponse.statusCode, 200);
    assert.equal(storageResponse.json().storage.availableBytes, 40);

    const appsResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/apps",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        capturedAt: "2026-09-19T12:00:02.000Z",
        apps: [{
          applicationId: "com.example.notes",
          name: "Notes",
          canRemove: true,
          versionName: "2.1",
          versionCode: 21,
          installedAt: "2026-09-01T12:00:00.000Z",
          updatedAt: "2026-09-10T12:00:00.000Z",
        }],
      },
    });
    assert.equal(appsResponse.statusCode, 200);
  assert.equal(appsResponse.json().apps.apps[0].applicationId, "com.example.notes");

    const actionResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/actions",
      payload: { type: "collectTelemetry" },
    });
    assert.equal(actionResponse.statusCode, 201);
    assert.equal(actionResponse.json().action.origin, "controller");

    const removeApplicationResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/actions",
      payload: { type: "removeApplication", payload: { applicationId: "application.notes" } },
    });
    assert.equal(removeApplicationResponse.statusCode, 201);
    assert.deepEqual(removeApplicationResponse.json().action.payload, { applicationId: "application.notes" });

    const missingPayloadResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/actions",
      payload: { type: "removeApplication" },
    });
    assert.equal(missingPayloadResponse.statusCode, 400);

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
      ["collectTelemetry", "removeApplication", "collectStorageSummary"],
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
          applicationId: "com.example.notes",
          name: "Notes",
          canRemove: true,
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
    assert.equal(historyResponse.json().actions.some((action: { origin: string }) => action.origin === "device"), true);

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
