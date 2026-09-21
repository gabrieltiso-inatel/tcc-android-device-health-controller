import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createControllerServer } from "../src/server.js";

test("accepts telemetry and creates a collection command", async () => {
  const server = createControllerServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const telemetryResponse = await fetch(`${baseUrl}/api/devices/device-1/telemetry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceName: "Pixel",
        batteryPercentage: 50,
        isCharging: false,
        capturedAt: "2026-09-19T12:00:00.000Z",
      }),
    });
    assert.equal(telemetryResponse.status, 200);

    const commandResponse = await fetch(`${baseUrl}/api/devices/device-1/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "collectTelemetry" }),
    });
    assert.equal(commandResponse.status, 201);

    const commandsResponse = await fetch(`${baseUrl}/api/devices/device-1/commands`);
    const commands = (await commandsResponse.json()) as { commands: Array<{ type: string }> };
    assert.deepEqual(commands.commands.map((command) => command.type), ["collectTelemetry"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
