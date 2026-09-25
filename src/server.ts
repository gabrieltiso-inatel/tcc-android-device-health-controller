import Fastify, { type FastifyReply } from "fastify";
import { DeviceStore, type CommandType, type StorageSummary, type Telemetry } from "./device-store.js";

const port = Number(process.env.PORT ?? 3000);

export function createControllerServer(store = new DeviceStore()) {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/devices", async () => ({ devices: store.listDevices().map(withConnectionStatus) }));

  app.post("/api/pairing-codes", async (_request, reply) =>
    reply.code(201).send({ pairingCode: store.createPairingCode() }),
  );

  app.post<{ Body: { code: string; deviceId: string; deviceName: string } }>(
    "/api/devices/pair",
    { schema: { body: pairingSchema } },
    async (request, reply) => {
      const credential = store.pairDevice(request.body.code, request.body.deviceId, request.body.deviceName.trim());
      return credential
        ? reply.code(201).send({ token: credential.token })
        : reply.code(400).send({ message: "Pairing code is invalid or expired" });
    },
  );

  app.get<{ Params: { deviceId: string } }>("/devices/:deviceId", async (request, reply) => {
    const device = store.getDevice(request.params.deviceId);
    if (!device) {
      return reply.code(404).type("text/html; charset=utf-8").send("<h1>Device not found</h1>");
    }
    return reply.type("text/html; charset=utf-8").send(renderDeviceDetail(device, store.getCommandHistory(device.id)));
  });

  app.post<{ Params: { deviceId: string }; Body: Telemetry }>(
    "/api/devices/:deviceId/telemetry",
    { schema: { body: telemetrySchema } },
    async (request, reply) => {
      if (!authenticateDeviceRequest(request.headers.authorization, request.params.deviceId, store)) {
        return unauthorized(reply);
      }
      return { device: store.receiveTelemetry(request.params.deviceId, request.body) };
    },
  );

  app.get<{ Params: { deviceId: string } }>("/api/devices/:deviceId/commands", async (request, reply) => {
    if (!authenticateDeviceRequest(request.headers.authorization, request.params.deviceId, store)) {
      return unauthorized(reply);
    }
    store.recordDeviceContact(request.params.deviceId);
    return { commands: store.getPendingCommands(request.params.deviceId) };
  });

  app.get<{ Params: { deviceId: string } }>("/api/devices/:deviceId/history", async (request) => ({
    commands: store.getCommandHistory(request.params.deviceId),
  }));

  app.post<{ Params: { deviceId: string }; Body: { type: CommandType } }>(
    "/api/devices/:deviceId/commands",
    { schema: { body: commandSchema } },
    async (request, reply) => {
      if (!store.getDevice(request.params.deviceId)) {
        return reply.code(404).send({ message: "Device not found" });
      }
      if (!store.supportsCommand(request.params.deviceId, request.body.type)) {
        return reply.code(409).send({ message: "Command is not supported by this device" });
      }
      const command = store.createCommand(request.params.deviceId, request.body.type);
      return reply.code(201).send({ command });
    },
  );

  app.post<{ Params: { commandId: string }; Body: { succeeded: boolean; message: string; errorCode?: string; result?: StorageSummary } }>(
    "/api/commands/:commandId/result",
    { schema: { body: commandResultSchema } },
    async (request, reply) => {
      const token = readBearerToken(request.headers.authorization);
      if (!token || !store.authenticateCommand(request.params.commandId, token)) {
        return unauthorized(reply);
      }
      const command = store.completeCommand(
        request.params.commandId,
        request.body.succeeded,
        request.body.message,
        request.body.errorCode,
        request.body.result,
      );
      return command ? { command } : reply.code(404).send({ message: "Pending command not found" });
    },
  );

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return renderDashboard(store.listDevices().map(withConnectionStatus));
  });

  app.addHook("onClose", () => store.close());
  return app;
}

const telemetrySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "deviceName",
    "manufacturer",
    "model",
    "androidVersion",
    "apiLevel",
    "agentVersion",
    "capabilities",
    "batteryPercentage",
    "isCharging",
    "capturedAt",
  ],
  properties: {
    deviceName: { type: "string", minLength: 1, maxLength: 120 },
    manufacturer: { type: "string", minLength: 1, maxLength: 120 },
    model: { type: "string", minLength: 1, maxLength: 120 },
    androidVersion: { type: "string", minLength: 1, maxLength: 40 },
    apiLevel: { type: "integer", minimum: 26 },
    agentVersion: { type: "string", minLength: 1, maxLength: 40 },
    capabilities: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", enum: ["collectTelemetry", "collectStorageSummary"] },
    },
    batteryPercentage: { type: "integer", minimum: 0, maximum: 100 },
    isCharging: { type: "boolean" },
    capturedAt: { type: "string", format: "date-time" },
  },
} as const;

const pairingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "deviceId", "deviceName"],
  properties: {
    code: { type: "string", pattern: "^[0-9]{6}$" },
    deviceId: { type: "string", minLength: 1, maxLength: 120 },
    deviceName: { type: "string", minLength: 1, maxLength: 120 },
  },
} as const;

const commandSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type"],
  properties: { type: { type: "string", enum: ["collectTelemetry", "collectStorageSummary"] } },
} as const;

const commandResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["succeeded", "message"],
  properties: {
    succeeded: { type: "boolean" },
    message: { type: "string", minLength: 1, maxLength: 500 },
    errorCode: {
      type: "string",
      enum: ["unsupported_command", "execution_failed"],
    },
    result: {
      type: "object",
      additionalProperties: false,
      required: ["totalBytes", "usedBytes", "availableBytes", "capturedAt"],
      properties: {
        totalBytes: { type: "integer", minimum: 0 },
        usedBytes: { type: "integer", minimum: 0 },
        availableBytes: { type: "integer", minimum: 0 },
        capturedAt: { type: "string", format: "date-time" },
      },
    },
  },
} as const;

function withConnectionStatus(device: ReturnType<DeviceStore["listDevices"]>[number]) {
  const ageInMilliseconds = Date.now() - Date.parse(device.lastSeenAt);
  return { ...device, status: ageInMilliseconds <= 60_000 ? "online" : "stale" } as const;
}

function readBearerToken(authorization: string | undefined): string | undefined {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9._~+\/-]+=*)$/);
  return match?.[1];
}

function authenticateDeviceRequest(authorization: string | undefined, deviceId: string, store: DeviceStore) {
  const token = readBearerToken(authorization);
  return token ? store.authenticateDevice(deviceId, token) : false;
}

function unauthorized(reply: FastifyReply) {
  return reply
    .header("www-authenticate", "Bearer")
    .code(401)
    .send({ message: "Device authentication required" });
}

function renderDashboard(devices: ReturnType<typeof withConnectionStatus>[]) {
  const rows = devices.length
    ? devices.map((device) => `<tr><td><a href="/devices/${encodeURIComponent(device.id)}">${escapeHtml(device.deviceName)}</a></td><td>${device.batteryPercentage}% ${device.isCharging ? "charging" : "discharging"}</td><td>${escapeHtml(device.lastSeenAt)}</td><td>${escapeHtml(device.capturedAt)}</td></tr>`).join("")
    : '<tr><td colspan="4">No device has reported telemetry yet.</td></tr>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Device Health Controller</title><style>${styles()}</style></head><body><main><h1>Devices</h1><p class="hint">Select a device to view details and action history.</p><section class="card"><button type="button" onclick="createPairingCode()">Add device</button><p id="pairing-code" class="hint"></p></section><table><thead><tr><th>Device</th><th>Battery</th><th>Last contact</th><th>Telemetry captured</th></tr></thead><tbody>${rows}</tbody></table></main><script>async function createPairingCode(){const response=await fetch('/api/pairing-codes',{method:'POST'});const body=await response.json();document.getElementById('pairing-code').textContent='Pairing code: '+body.pairingCode.code+' (expires in 5 minutes)'}</script></body></html>`;
}

function renderDeviceDetail(device: ReturnType<DeviceStore["listDevices"]>[number], commands: ReturnType<DeviceStore["getCommandHistory"]>) {
  const storageCommands = commands.filter((command) => command.type === "collectStorageSummary");
  const latestStorage = storageCommands.find((command) => command.status === "completed" && command.result)?.result;
  const activeStorageCommand = storageCommands.find(
    (command) => command.status === "pending" || command.status === "delivered",
  );
  const supportsStorageSummary = device.capabilities.includes("collectStorageSummary");
  const storageContent = latestStorage
    ? `<dl><div><dt>Used</dt><dd>${formatBytes(latestStorage.usedBytes)} of ${formatBytes(latestStorage.totalBytes)}</dd></div><div><dt>Available</dt><dd>${formatBytes(latestStorage.availableBytes)}</dd></div></dl><p class="hint">Updated ${escapeHtml(latestStorage.capturedAt)}</p>`
    : '<p class="hint">No storage summary collected yet.</p>';
  const storageAction = supportsStorageSummary
    ? `<button id="storage-action" type="button"${activeStorageCommand ? " disabled" : ""}>${activeStorageCommand ? "Update in progress…" : "Update storage"}</button><p id="storage-status" class="hint" role="status">${activeStorageCommand ? "Waiting for the device to respond." : ""}</p>`
    : '<p class="hint">This agent does not support storage collection.</p>';
  const history = commands.length
    ? commands.map((command) => `<li><strong>${escapeHtml(command.type)}</strong> — ${escapeHtml(command.status)}<br><span class="hint">Requested ${escapeHtml(command.requestedAt)} · Attempts ${command.attemptCount}${command.completedAt ? ` · Completed ${escapeHtml(command.completedAt)}` : ""}</span>${command.resultMessage ? `<br>${escapeHtml(command.resultMessage)}` : ""}</li>`).join("")
    : "<li>No actions recorded yet.</li>";
  const deviceId = JSON.stringify(device.id).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(device.deviceName)} — Device Health</title><style>${styles()}</style></head><body><main><a href="/">← All devices</a><h1>${escapeHtml(device.deviceName)}</h1><section class="card"><h2>Current state</h2><p><strong>Battery:</strong> ${device.batteryPercentage}% (${device.isCharging ? "charging" : "discharging"})</p><p><strong>Last contact:</strong> ${escapeHtml(device.lastSeenAt)}</p><p><strong>Telemetry captured:</strong> ${escapeHtml(device.capturedAt)}</p><p><strong>Device ID:</strong> ${escapeHtml(device.id)}</p></section><section class="card"><h2>Storage</h2>${storageContent}${storageAction}</section><section class="card"><h2>Action history</h2><ul>${history}</ul></section></main><script>const deviceId=${deviceId};const button=document.getElementById('storage-action');const status=document.getElementById('storage-status');let polling=${Boolean(activeStorageCommand)};async function checkStorageCommand(){try{const response=await fetch('/api/devices/'+encodeURIComponent(deviceId)+'/history');if(!response.ok)throw new Error();const commands=(await response.json()).commands;const command=commands.find(command=>command.type==='collectStorageSummary');if(command&&['completed','failed','expired'].includes(command.status)){location.reload();return}setTimeout(checkStorageCommand,2000)}catch{status.textContent='Could not check the update. Try again.';button.disabled=false;button.textContent='Update storage';polling=false}}async function updateStorage(){button.disabled=true;button.textContent='Update in progress…';status.textContent='Waiting for the device to respond.';try{const response=await fetch('/api/devices/'+encodeURIComponent(deviceId)+'/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'collectStorageSummary'})});if(!response.ok)throw new Error();if(!polling){polling=true;checkStorageCommand()}}catch{status.textContent='Could not request the update. Try again.';button.disabled=false;button.textContent='Update storage'}}button?.addEventListener('click',updateStorage);if(polling)checkStorageCommand();</script></body></html>`;
}

function styles() {
  return "body{font-family:system-ui,sans-serif;max-width:960px;margin:48px auto;padding:0 20px;color:#172033}main{display:grid;gap:20px}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #d7ddea;padding:14px 8px}a{color:#255fdb;text-decoration:none}a:hover{text-decoration:underline}.card{border:1px solid #d7ddea;border-radius:8px;padding:20px}button{background:#255fdb;color:white;border:0;border-radius:6px;padding:10px 14px;font-weight:600;cursor:pointer}button:disabled{cursor:wait;opacity:.65}.hint{color:#5b6575}dl{display:flex;gap:32px}dt{color:#5b6575}dd{font-size:1.25rem;font-weight:600;margin:4px 0}ul{padding-left:20px}li{margin:12px 0}";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = "B";
  for (const nextUnit of units) {
    value /= 1024;
    unit = nextUnit;
    if (value < 1024) {
      break;
    }
  }
  return `${value.toFixed(1)} ${unit}`;
}

function escapeHtml(value: string) {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
  return value.replace(/[&<>'"]/g, (character) => replacements[character] ?? character);
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  createControllerServer().listen({ port, host: "0.0.0.0" });
}
