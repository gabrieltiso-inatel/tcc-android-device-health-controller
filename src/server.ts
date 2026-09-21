import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { DeviceStore, type CommandType, type Telemetry } from "./device-store.js";

const port = Number(process.env.PORT ?? 3000);

export function createControllerServer(store = new DeviceStore()) {
  return createServer(async (request, response) => {
    try {
      await route(request, response, store);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      if (error instanceof RequestValidationError) {
        sendJson(response, 400, { message });
        return;
      }
      log("request_failed", { message });
      sendJson(response, 500, { message: "Unexpected server error" });
    }
  });
}

async function route(request: IncomingMessage, response: ServerResponse, store: DeviceStore) {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const deviceMatch = url.pathname.match(/^\/api\/devices\/([^/]+)\/telemetry$/);
  const commandMatch = url.pathname.match(/^\/api\/devices\/([^/]+)\/commands$/);
  const resultMatch = url.pathname.match(/^\/api\/commands\/([^/]+)\/result$/);

  if (method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, { status: "ok" });
  }

  if (method === "GET" && url.pathname === "/api/devices") {
    return sendJson(response, 200, { devices: store.listDevices() });
  }

  if (method === "POST" && deviceMatch) {
    const telemetry = validateTelemetry(await readJson(request));
    const device = store.receiveTelemetry(decodeURIComponent(deviceMatch[1]), telemetry);
    return sendJson(response, 200, { device });
  }

  if (method === "GET" && commandMatch) {
    const deviceId = decodeURIComponent(commandMatch[1]);
    return sendJson(response, 200, { commands: store.getPendingCommands(deviceId) });
  }

  if (method === "POST" && commandMatch) {
    const commandType = validateCommandType(await readJson(request));
    const command = store.createCommand(decodeURIComponent(commandMatch[1]), commandType);
    if (!command) {
      return sendJson(response, 404, { message: "Device not found" });
    }
    return sendJson(response, 201, { command });
  }

  if (method === "POST" && resultMatch) {
    const result = validateCommandResult(await readJson(request));
    const command = store.completeCommand(decodeURIComponent(resultMatch[1]), result.succeeded, result.message);
    if (!command) {
      return sendJson(response, 404, { message: "Pending command not found" });
    }
    return sendJson(response, 200, { command });
  }

  if (method === "GET" && url.pathname === "/") {
    return sendHtml(response, renderDashboard(store.listDevices()));
  }

  sendJson(response, 404, { message: "Route not found" });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestValidationError("Request body must be valid JSON");
  }
}

function validateTelemetry(value: unknown): Telemetry {
  if (!isRecord(value)) {
    throw new RequestValidationError("Telemetry must be an object");
  }

  const { deviceName, batteryPercentage, isCharging, capturedAt } = value;
  if (
    typeof deviceName !== "string" ||
    !deviceName.trim() ||
    typeof batteryPercentage !== "number" ||
    !Number.isInteger(batteryPercentage) ||
    batteryPercentage < 0 ||
    batteryPercentage > 100 ||
    typeof isCharging !== "boolean" ||
    typeof capturedAt !== "string" ||
    Number.isNaN(Date.parse(capturedAt))
  ) {
    throw new RequestValidationError("Telemetry fields are invalid");
  }

  return { deviceName: deviceName.trim(), batteryPercentage, isCharging, capturedAt };
}

function validateCommandType(value: unknown): CommandType {
  if (!isRecord(value) || value.type !== "collectTelemetry") {
    throw new RequestValidationError("Unsupported command type");
  }
  return value.type;
}

function validateCommandResult(value: unknown): { succeeded: boolean; message: string } {
  if (!isRecord(value) || typeof value.succeeded !== "boolean" || typeof value.message !== "string") {
    throw new RequestValidationError("Command result fields are invalid");
  }
  return { succeeded: value.succeeded, message: value.message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, body: string) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

function renderDashboard(devices: ReturnType<DeviceStore["listDevices"]>) {
  const rows = devices.length
    ? devices
        .map(
          (device) => `<tr><td>${escapeHtml(device.deviceName)}</td><td>${device.batteryPercentage}% ${device.isCharging ? "charging" : "discharging"}</td><td>${escapeHtml(device.lastSeenAt)}</td><td><button type="button" data-device-id="${escapeAttribute(device.id)}" onclick="requestTelemetry(this.dataset.deviceId)">Collect telemetry</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="4">No device has reported telemetry yet.</td></tr>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Device Health Controller</title><style>body{font-family:system-ui,sans-serif;max-width:960px;margin:48px auto;padding:0 20px;color:#172033}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #d7ddea;padding:14px 8px}button{background:#255fdb;color:white;border:0;border-radius:6px;padding:8px 12px;font-weight:600;cursor:pointer}.hint{color:#5b6575}</style></head><body><h1>Device Health Controller</h1><p class="hint">The page refreshes every five seconds.</p><table><thead><tr><th>Device</th><th>Battery</th><th>Last seen</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table><script>async function requestTelemetry(id){const response=await fetch('/api/devices/'+encodeURIComponent(id)+'/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'collectTelemetry'})});if(!response.ok){alert('Could not queue command');return}location.reload()}setTimeout(()=>location.reload(),5000)</script></body></html>`;
}

function escapeHtml(value: string) {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  };
  return value.replace(/[&<>'"]/g, (character) => replacements[character] ?? character);
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

class RequestValidationError extends Error {}

function log(event: string, fields: Record<string, string | number>) {
  process.stdout.write(`${JSON.stringify({ event, ...fields })}\n`);
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  createControllerServer().listen(port, "0.0.0.0", () => {
    log("controller_started", { port });
  });
}
