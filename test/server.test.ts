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
  capabilities: ["collectTelemetry", "collectStorageSummary"],
  batteryPercentage: 50,
  isCharging: false,
  capturedAt: "2026-09-19T12:00:00.000Z",
};

test("accepts telemetry and creates a collection command", async () => {
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

    const commandResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/commands",
      payload: { type: "collectTelemetry" },
    });
    assert.equal(commandResponse.statusCode, 201);

    const storageCommandResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/commands",
      payload: { type: "collectStorageSummary" },
    });
    assert.equal(storageCommandResponse.statusCode, 201);
    const storageCommandId = storageCommandResponse.json().command.id as string;

    const commandsResponse = await server.inject({
      method: "GET",
      url: "/api/devices/device-1/commands",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.deepEqual(
      commandsResponse.json().commands.map((command: { type: string }) => command.type),
      ["collectTelemetry", "collectStorageSummary"],
    );

    const resultResponse = await server.inject({
      method: "POST",
      url: `/api/commands/${storageCommandId}/result`,
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
    assert.equal(resultResponse.json().command.result.availableBytes, 40);

    const detailResponse = await server.inject({ method: "GET", url: "/devices/device-1" });
    assert.equal(detailResponse.statusCode, 200);
    assert.match(detailResponse.body, /Storage summary collected/);
    assert.match(detailResponse.body, /60 B of 100 B/);
    assert.match(detailResponse.body, /Update storage/);

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
