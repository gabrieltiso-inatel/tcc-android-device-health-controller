import assert from "node:assert/strict";
import test from "node:test";
import { DeviceStore } from "../src/device-store.js";
import { createControllerServer } from "../src/server.js";

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
      payload: {
        deviceName: "Pixel",
        batteryPercentage: 50,
        isCharging: false,
        capturedAt: "2026-09-19T12:00:00.000Z",
      },
    });
    assert.equal(telemetryResponse.statusCode, 200);

    const commandResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/commands",
      payload: { type: "collectTelemetry" },
    });
    assert.equal(commandResponse.statusCode, 201);

    const commandsResponse = await server.inject({
      method: "GET",
      url: "/api/devices/device-1/commands",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.deepEqual(commandsResponse.json().commands.map((command: { type: string }) => command.type), ["collectTelemetry"]);

    const unauthorizedResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/telemetry",
      payload: {
        deviceName: "Pixel",
        batteryPercentage: 50,
        isCharging: false,
        capturedAt: "2026-09-19T12:00:00.000Z",
      },
    });
    assert.equal(unauthorizedResponse.statusCode, 401);
  } finally {
    await server.close();
  }
});
