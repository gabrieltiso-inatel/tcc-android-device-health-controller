import type { Action, ActionResult, AppInventory, Device, StorageSnapshot, StorageSummary } from "./domain.js";

export type DeviceWithConnectionStatus = Device & { status: "online" | "stale" };

export function withConnectionStatus(device: Device): DeviceWithConnectionStatus {
  const ageInMilliseconds = Date.now() - Date.parse(device.lastSeenAt);
  return { ...device, status: ageInMilliseconds <= 60_000 ? "online" : "stale" };
}

export function renderDashboard(devices: DeviceWithConnectionStatus[]): string {
  const rows = devices.length
    ? devices.map((device) => `<tr><td><a href="/devices/${encodeURIComponent(device.id)}">${escapeHtml(device.deviceName)}</a></td><td>${device.batteryPercentage}% ${device.isCharging ? "charging" : "discharging"}</td><td>${escapeHtml(device.lastSeenAt)}</td><td>${escapeHtml(device.capturedAt)}</td></tr>`).join("")
    : '<tr><td colspan="4">No device has reported telemetry yet.</td></tr>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Device Health Controller</title><style>${styles()}</style></head><body><main><h1>Devices</h1><p class="hint">Select a device to view details and action history.</p><section class="card"><button type="button" onclick="createPairingCode()">Add device</button><p id="pairing-code" class="hint"></p></section><table><thead><tr><th>Device</th><th>Battery</th><th>Last contact</th><th>Telemetry captured</th></tr></thead><tbody>${rows}</tbody></table></main><script>async function createPairingCode(){const response=await fetch('/api/pairing-codes',{method:'POST'});const body=await response.json();document.getElementById('pairing-code').textContent='Pairing code: '+body.pairingCode.code+' (expires in 5 minutes)'}</script></body></html>`;
}

export function renderDeviceDetail(device: Device, actions: Action[], storageSnapshot?: StorageSnapshot): string {
  const storageActions = actions.filter((action) => action.type === "collectStorageSummary");
  const latestActionStorage = storageActions
    .find((action) => action.status === "completed" && isStorageSummary(action.result))?.result as StorageSummary | undefined;
  const latestStorage = storageSnapshot ?? latestActionStorage;
  const activeStorageAction = storageActions.find(
    (action) => action.status === "pending" || action.status === "delivered",
  );
  const supportsStorageSummary = device.capabilities.includes("collectStorageSummary");
  const storageContent = latestStorage
    ? `<dl><div><dt>Used</dt><dd>${formatBytes(latestStorage.usedBytes)} of ${formatBytes(latestStorage.totalBytes)}</dd></div><div><dt>Available</dt><dd>${formatBytes(latestStorage.availableBytes)}</dd></div></dl><p class="hint">Updated ${escapeHtml(latestStorage.capturedAt)}</p>`
    : '<p class="hint">No storage summary collected yet.</p>';
  const storageAction = supportsStorageSummary
    ? `<button id="storage-action" type="button"${activeStorageAction ? " disabled" : ""}>${activeStorageAction ? "Update in progress…" : "Update storage"}</button><p id="storage-status" class="hint" role="status">${activeStorageAction ? "Waiting for the device to respond." : ""}</p>`
    : '<p class="hint">This agent does not support storage collection.</p>';
  const appActions = actions.filter((action) => action.type === "collectAppInventory");
  const latestAppInventory = appActions
    .find((action) => action.status === "completed" && isAppInventory(action.result))?.result as AppInventory | undefined;
  const activeAppAction = appActions.find(
    (action) => action.status === "pending" || action.status === "delivered",
  );
  const supportsAppInventory = device.capabilities.includes("collectAppInventory");
  const appRows = latestAppInventory?.apps.length
    ? latestAppInventory.apps.map((app) => `<tr><td>${escapeHtml(app.name)}</td><td>${escapeHtml(app.packageName)}</td><td>${escapeHtml(app.versionName || String(app.versionCode))}</td><td>${escapeHtml(app.updatedAt)}</td></tr>`).join("")
    : '<tr><td colspan="4">No app inventory collected yet.</td></tr>';
  const appAction = supportsAppInventory
    ? `<button id="apps-action" type="button"${activeAppAction ? " disabled" : ""}>${activeAppAction ? "Update in progress…" : "Update apps"}</button><p id="apps-status" class="hint" role="status">${activeAppAction ? "Waiting for the device to respond." : ""}</p>`
    : '<p class="hint">This agent does not support app inventory.</p>';
  const appUpdatedAt = latestAppInventory
    ? `<p class="hint">${latestAppInventory.apps.length} user-installed apps · Updated ${escapeHtml(latestAppInventory.capturedAt)}</p>`
    : "";
  const history = actions.length
    ? actions.map((action) => `<li><strong>${escapeHtml(action.type)}</strong> — ${escapeHtml(action.status)}<br><span class="hint">Origin ${escapeHtml(action.origin)} · Requested ${escapeHtml(action.requestedAt)} · Attempts ${action.attemptCount}${action.completedAt ? ` · Completed ${escapeHtml(action.completedAt)}` : ""}</span>${action.resultMessage ? `<br>${escapeHtml(action.resultMessage)}` : ""}</li>`).join("")
    : "<li>No actions recorded yet.</li>";
  const deviceId = JSON.stringify(device.id).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(device.deviceName)} — Device Health</title><style>${styles()}</style></head><body><main><a href="/">← All devices</a><h1>${escapeHtml(device.deviceName)}</h1><section class="card"><h2>Current state</h2><p><strong>Battery:</strong> ${device.batteryPercentage}% (${device.isCharging ? "charging" : "discharging"})</p><p><strong>Last contact:</strong> ${escapeHtml(device.lastSeenAt)}</p><p><strong>Telemetry captured:</strong> ${escapeHtml(device.capturedAt)}</p><p><strong>Device ID:</strong> ${escapeHtml(device.id)}</p></section><section class="card"><h2>Storage</h2>${storageContent}${storageAction}</section><section class="card"><h2>Installed apps</h2>${appUpdatedAt}<div class="table-scroll"><table><thead><tr><th>App</th><th>Package</th><th>Version</th><th>Updated</th></tr></thead><tbody>${appRows}</tbody></table></div>${appAction}</section><section class="card"><h2>Action history</h2><ul>${history}</ul></section></main><script>const deviceId=${deviceId};async function checkAction(type){try{const response=await fetch('/api/devices/'+encodeURIComponent(deviceId)+'/history');if(!response.ok)throw new Error();const action=(await response.json()).actions.find(action=>action.type===type);if(action&&['completed','failed','expired'].includes(action.status)){location.reload();return}setTimeout(()=>checkAction(type),2000)}catch{showRequestError(type)}}function controls(type){return type==='collectStorageSummary'?{button:document.getElementById('storage-action'),status:document.getElementById('storage-status'),label:'Update storage'}:{button:document.getElementById('apps-action'),status:document.getElementById('apps-status'),label:'Update apps'}}function showRequestError(type){const {button,status,label}=controls(type);if(status)status.textContent='Could not request the update. Try again.';if(button){button.disabled=false;button.textContent=label}}async function requestCollection(type){const {button,status}=controls(type);button.disabled=true;button.textContent='Update in progress…';status.textContent='Waiting for the device to respond.';try{const response=await fetch('/api/devices/'+encodeURIComponent(deviceId)+'/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type})});if(!response.ok)throw new Error();checkAction(type)}catch{showRequestError(type)}}document.getElementById('storage-action')?.addEventListener('click',()=>requestCollection('collectStorageSummary'));document.getElementById('apps-action')?.addEventListener('click',()=>requestCollection('collectAppInventory'));${activeStorageAction ? "checkAction('collectStorageSummary');" : ""}${activeAppAction ? "checkAction('collectAppInventory');" : ""}</script></body></html>`;
}

function isStorageSummary(result: ActionResult | undefined): result is StorageSummary {
  return Boolean(result && "totalBytes" in result);
}

function isAppInventory(result: ActionResult | undefined): result is AppInventory {
  return Boolean(result && "apps" in result);
}

function styles(): string {
  return "body{font-family:system-ui,sans-serif;max-width:960px;margin:48px auto;padding:0 20px;color:#172033}main{display:grid;gap:20px}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #d7ddea;padding:14px 8px}a{color:#255fdb;text-decoration:none}a:hover{text-decoration:underline}.card{border:1px solid #d7ddea;border-radius:8px;padding:20px}button{background:#255fdb;color:white;border:0;border-radius:6px;padding:10px 14px;font-weight:600;cursor:pointer;margin-top:16px}button:disabled{cursor:wait;opacity:.65}.hint{color:#5b6575}.table-scroll{overflow-x:auto}dl{display:flex;gap:32px}dt{color:#5b6575}dd{font-size:1.25rem;font-weight:600;margin:4px 0}ul{padding-left:20px}li{margin:12px 0}";
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

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
  return value.replace(/[&<>'"]/g, (character) => replacements[character] ?? character);
}
