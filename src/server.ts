import Fastify from "fastify";
import { DeviceStore, type CommandType, type Telemetry } from "./device-store.js";

const port = Number(process.env.PORT ?? 3000);

export function createControllerServer(store = new DeviceStore()) {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/devices", async () => ({ devices: store.listDevices() }));

  app.post<{ Params: { deviceId: string }; Body: Telemetry }>(
    "/api/devices/:deviceId/telemetry",
    { schema: { body: telemetrySchema } },
    async (request) => ({ device: store.receiveTelemetry(request.params.deviceId, request.body) }),
  );

  app.get<{ Params: { deviceId: string } }>("/api/devices/:deviceId/commands", async (request) => ({
    commands: store.getPendingCommands(request.params.deviceId),
  }));

  app.post<{ Params: { deviceId: string }; Body: { type: CommandType } }>(
    "/api/devices/:deviceId/commands",
    { schema: { body: commandSchema } },
    async (request, reply) => {
      const command = store.createCommand(request.params.deviceId, request.body.type);
      return command ? reply.code(201).send({ command }) : reply.code(404).send({ message: "Device not found" });
    },
  );

  app.post<{ Params: { commandId: string }; Body: { succeeded: boolean; message: string } }>(
    "/api/commands/:commandId/result",
    { schema: { body: commandResultSchema } },
    async (request, reply) => {
      const command = store.completeCommand(request.params.commandId, request.body.succeeded, request.body.message);
      return command ? { command } : reply.code(404).send({ message: "Pending command not found" });
    },
  );

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return renderDashboard(store.listDevices());
  });

  app.addHook("onClose", () => store.close());
  return app;
}

const telemetrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["deviceName", "batteryPercentage", "isCharging", "capturedAt"],
  properties: {
    deviceName: { type: "string", minLength: 1, maxLength: 120 },
    batteryPercentage: { type: "integer", minimum: 0, maximum: 100 },
    isCharging: { type: "boolean" },
    capturedAt: { type: "string", format: "date-time" },
  },
} as const;

const commandSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type"],
  properties: { type: { type: "string", enum: ["collectTelemetry"] } },
} as const;

const commandResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["succeeded", "message"],
  properties: {
    succeeded: { type: "boolean" },
    message: { type: "string", minLength: 1, maxLength: 500 },
  },
} as const;

function renderDashboard(devices: ReturnType<DeviceStore["listDevices"]>) {
  const rows = devices.length
    ? devices.map((device) => `<tr><td>${escapeHtml(device.deviceName)}</td><td>${device.batteryPercentage}% ${device.isCharging ? "charging" : "discharging"}</td><td>${escapeHtml(device.lastSeenAt)}</td><td><button data-device-id="${escapeHtml(device.id)}" onclick="requestTelemetry(this.dataset.deviceId)">Collect telemetry</button></td></tr>`).join("")
    : '<tr><td colspan="4">No device has reported telemetry yet.</td></tr>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Device Health Controller</title><style>body{font-family:system-ui,sans-serif;max-width:960px;margin:48px auto;padding:0 20px;color:#172033}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #d7ddea;padding:14px 8px}button{background:#255fdb;color:white;border:0;border-radius:6px;padding:8px 12px;font-weight:600;cursor:pointer}.hint{color:#5b6575}</style></head><body><h1>Device Health Controller</h1><p class="hint">The page refreshes every five seconds.</p><table><thead><tr><th>Device</th><th>Battery</th><th>Last seen</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table><script>async function requestTelemetry(id){const response=await fetch('/api/devices/'+encodeURIComponent(id)+'/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'collectTelemetry'})});if(!response.ok){alert('Could not queue command');return}location.reload()}setTimeout(()=>location.reload(),5000)</script></body></html>`;
}

function escapeHtml(value: string) {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
  return value.replace(/[&<>'"]/g, (character) => replacements[character] ?? character);
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  createControllerServer().listen({ port, host: "0.0.0.0" });
}
