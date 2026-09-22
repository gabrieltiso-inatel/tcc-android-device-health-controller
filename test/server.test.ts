import assert from "node:assert/strict";
import test from "node:test";
import { DeviceStore } from "../src/device-store.js";
import { createControllerServer } from "../src/server.js";

test("accepts telemetry and creates a collection command", async () => {
  const store = new DeviceStore(":memory:");
  const server = createControllerServer(store);
  await server.ready();

  try {
    const telemetryResponse = await server.inject({
      method: "POST",
      url: "/api/devices/device-1/telemetry",
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

    const commandsResponse = await server.inject({ method: "GET", url: "/api/devices/device-1/commands" });
    assert.deepEqual(commandsResponse.json().commands.map((command: { type: string }) => command.type), ["collectTelemetry"]);
  } finally {
    await server.close();
  }
});
