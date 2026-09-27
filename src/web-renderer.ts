import type { Action, ActionResult, AppInventory, AppInventorySnapshot, Device, FileInventorySnapshot, StorageSnapshot, StorageSummary } from "./domain.js";

export type DeviceWithConnectionStatus = Device & { status: "online" | "stale" };

export function withConnectionStatus(device: Device): DeviceWithConnectionStatus {
  const ageInMilliseconds = Date.now() - Date.parse(device.lastSeenAt);
  return { ...device, status: ageInMilliseconds <= 60_000 ? "online" : "stale" };
}

export function renderDashboard(devices: DeviceWithConnectionStatus[]): string {
  const rows = devices.length
    ? devices.map((device) => `<tr><td><a href="/devices/${encodeURIComponent(device.id)}">${escapeHtml(device.deviceName)}</a></td><td>${device.batteryPercentage}% ${device.isCharging ? "charging" : "discharging"}</td><td>${renderRelativeTime(device.lastSeenAt)}</td><td>${renderRelativeTime(device.capturedAt)}</td></tr>`).join("")
    : '<tr><td colspan="4">No device has reported telemetry yet.</td></tr>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Device Health Controller</title><style>${styles()}</style></head><body><main><header class="page-header"><div><p class="eyebrow">Device Health</p><h1>Devices</h1><p class="hint">Monitor device health and manage connected devices.</p></div><button type="button" onclick="createPairingCode()">Add device</button></header><section class="card pairing-card"><p class="eyebrow">New connection</p><p class="hint">Create a temporary code for an Android agent.</p><p id="pairing-code" class="pairing-code"></p></section><section class="card table-card"><table><thead><tr><th>Device</th><th>Battery</th><th>Last contact</th><th>Telemetry captured</th></tr></thead><tbody>${rows}</tbody></table></section></main><script>async function createPairingCode(){const response=await fetch('/api/pairing-codes',{method:'POST'});const body=await response.json();document.getElementById('pairing-code').textContent='Pairing code: '+body.pairingCode.code+' (expires in 5 minutes)'}</script></body></html>`;
}

export function renderDeviceDetail(
  device: Device,
  actions: Action[],
  storageSnapshot?: StorageSnapshot,
  appInventorySnapshot?: AppInventorySnapshot,
  fileInventorySnapshot?: FileInventorySnapshot,
): string {
  const connectionStatus = withConnectionStatus(device).status;
  const storageActions = actions.filter((action) => action.type === "collectStorageSummary");
  const latestActionStorage = storageActions
    .find((action) => action.status === "completed" && isStorageSummary(action.result))?.result as StorageSummary | undefined;
  const latestStorage = storageSnapshot ?? latestActionStorage;
  const activeStorageAction = storageActions.find((action) => ["pending", "delivered"].includes(action.status));
  const supportsStorageSummary = device.capabilities.includes("collectStorageSummary");
  const storageContent = latestStorage
    ? `<dl><div><dt>Used</dt><dd>${formatBytes(latestStorage.usedBytes)} of ${formatBytes(latestStorage.totalBytes)}</dd></div><div><dt>Available</dt><dd>${formatBytes(latestStorage.availableBytes)}</dd></div></dl><p class="hint">Updated ${renderRelativeTime(latestStorage.capturedAt)}</p>`
    : '<p class="empty-state">No storage summary collected yet.</p>';
  const storageAction = supportsStorageSummary
    ? `<button id="storage-action" type="button"${activeStorageAction ? " disabled" : ""}>${activeStorageAction ? "Update in progress…" : "Update storage"}</button><p id="storage-status" class="hint" role="status">${activeStorageAction ? "Waiting for the device to respond." : ""}</p>`
    : '<p class="hint">This agent does not support storage collection.</p>';

  const appActions = actions.filter((action) => action.type === "collectAppInventory");
  const latestActionAppInventory = appActions
    .find((action) => action.status === "completed" && isAppInventory(action.result))?.result as AppInventory | undefined;
  const latestAppInventory = appInventorySnapshot ?? latestActionAppInventory;
  const activeAppAction = appActions.find((action) => ["pending", "delivered"].includes(action.status));
  const supportsAppInventory = device.capabilities.includes("collectAppInventory");
  const supportsApplicationRemoval = device.capabilities.includes("removeApplication");
  const applicationActions = actions.filter((action) => action.type === "removeApplication");
  const appRows = latestAppInventory?.apps.length
    ? latestAppInventory.apps.map((app) => renderAppRow(app, applicationActions, supportsApplicationRemoval)).join("")
    : '<tr><td colspan="5">No app inventory collected yet.</td></tr>';
  const appAction = supportsAppInventory
    ? `<button id="apps-action" type="button"${activeAppAction ? " disabled" : ""}>${activeAppAction ? "Update in progress…" : "Update apps"}</button><p id="apps-status" class="hint" role="status">${activeAppAction ? "Waiting for the device to respond." : ""}</p>`
    : '<p class="hint">This agent does not support app inventory.</p>';
  const appUpdatedAt = latestAppInventory
    ? `<p class="hint">${latestAppInventory.apps.length} user-installed apps · Updated ${renderRelativeTime(latestAppInventory.capturedAt)}</p>`
    : "";
  const activeActions = actions.filter((action) => ["pending", "delivered", "awaiting_approval"].includes(action.status));
  const history = actions.length
    ? actions.map(renderHistoryItem).join("")
    : '<li class="empty-state">No actions recorded yet.</li>';
  const pendingContent = activeActions.length
    ? `<p class="metric">${activeActions.length}</p><p class="hint">Action(s) need attention or are still in progress.</p>`
    : '<p class="empty-state">No pending actions.</p>';
  const fileActions = actions.filter((action) => action.type === "collectFileInventory");
  const activeFileAction = fileActions.find((action) => ["pending", "delivered"].includes(action.status));
  const supportsFileInventory = device.capabilities.includes("collectFileInventory");
  const fileAction = supportsFileInventory
    ? `<button id="files-action" type="button"${activeFileAction ? " disabled" : ""}>${activeFileAction ? "Collecting files…" : "Collect file inventory"}</button><p id="files-status" class="hint" role="status">${activeFileAction ? "Waiting for the device to respond." : ""}</p>`
    : '<p class="hint">This agent does not support file inventory.</p>';
  const supportsFileRemoval = device.capabilities.includes("removeFile");
  const fileContent = fileInventorySnapshot
    ? `<p class="hint">${fileInventorySnapshot.files.length} files · Updated ${renderRelativeTime(fileInventorySnapshot.capturedAt)}</p><div class="table-scroll"><table><thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Source</th><th>Action</th></tr></thead><tbody>${fileInventorySnapshot.files.slice(0, 20).map((file) => renderFileRow(file, actions, supportsFileRemoval)).join("") || '<tr><td colspan="5">No files found.</td></tr>'}</tbody></table></div>${fileInventorySnapshot.files.length > 20 ? '<p class="hint">Showing the 20 largest files.</p>' : ""}<script>async function requestFileRemoval(fileId,revision,button){if(!window.confirm('Remove this file?'))return;button.disabled=true;button.textContent='Requesting…';try{const response=await fetch('/api/devices/'+encodeURIComponent(deviceId)+'/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'removeFile',payload:{fileId,expectedRevision:revision}})});if(!response.ok)throw new Error();const action=(await response.json()).action;checkRemoval(action.id,button)}catch{button.disabled=false;button.textContent='Remove'}}document.querySelectorAll('[data-remove-file]').forEach(button=>button.addEventListener('click',()=>requestFileRemoval(button.dataset.fileId,button.dataset.expectedRevision,button)));</script>`
    : '<p class="empty-state">No file inventory collected yet.</p>';
  const deviceId = JSON.stringify(device.id).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(device.deviceName)} — Device Health</title><style>${styles()}</style></head><body><main><a class="back-link" href="/">← All devices</a><header class="page-header"><div><p class="eyebrow">Device details</p><h1>${escapeHtml(device.deviceName)}</h1><p class="hint">${connectionStatus === "online" ? "Online" : "Last contact was more than a minute ago"}</p></div><span class="status-pill ${connectionStatus}">${escapeHtml(connectionStatus)}</span></header><section class="dashboard-grid"><section class="card overview-card"><p class="eyebrow">Overview</p><h2>${device.batteryPercentage}% battery</h2><p>${device.isCharging ? "Charging" : "Not charging"}</p><dl class="details-list"><div><dt>Last contact</dt><dd>${renderRelativeTime(device.lastSeenAt)}</dd></div><div><dt>Telemetry</dt><dd>${renderRelativeTime(device.capturedAt)}</dd></div><div><dt>Device ID</dt><dd class="small-value">${escapeHtml(device.id)}</dd></div></dl></section><section class="card action-card"><p class="eyebrow">Attention</p><h2>Pending actions</h2>${pendingContent}</section><section class="card"><div class="section-heading"><div><p class="eyebrow">Storage</p><h2>Device storage</h2></div></div>${storageContent}${storageAction}</section><section class="card apps-card"><div class="section-heading"><div><p class="eyebrow">Applications</p><h2>Installed apps</h2></div></div>${appUpdatedAt}<div class="table-scroll"><table><thead><tr><th>App</th><th>Application ID</th><th>Version</th><th>Updated</th><th>Action</th></tr></thead><tbody>${appRows}</tbody></table></div>${appAction}</section><section class="card files-card"><div class="section-heading"><div><p class="eyebrow">Files</p><h2>File inventory</h2></div></div>${fileContent}${fileAction}</section><section class="card history-card"><div class="section-heading"><div><p class="eyebrow">Activity</p><h2>Action history</h2></div><span class="count-pill">${actions.length}</span></div><ol class="history-list">${history}</ol></section></section></main><script>const deviceId=${deviceId};async function checkAction(type){try{const response=await fetch('/api/devices/'+encodeURIComponent(deviceId)+'/history');if(!response.ok)throw new Error();const action=(await response.json()).actions.find(action=>action.type===type);if(action&&['completed','failed','cancelled','expired'].includes(action.status)){location.reload();return}setTimeout(()=>checkAction(type),2000)}catch{showRequestError(type)}}async function checkRemoval(actionId,button){try{const response=await fetch('/api/devices/'+encodeURIComponent(deviceId)+'/history');if(!response.ok)throw new Error();const action=(await response.json()).actions.find(action=>action.id===actionId);if(action&&['completed','failed','cancelled','expired'].includes(action.status)){location.reload();return}if(action?.status==='awaiting_approval')button.textContent='Waiting for approval…';setTimeout(()=>checkRemoval(actionId,button),2000)}catch{button.disabled=false;button.textContent='Remove'}}function controls(type){if(type==='collectStorageSummary')return{button:document.getElementById('storage-action'),status:document.getElementById('storage-status'),label:'Update storage'};if(type==='collectAppInventory')return{button:document.getElementById('apps-action'),status:document.getElementById('apps-status'),label:'Update apps'};return{button:document.getElementById('files-action'),status:document.getElementById('files-status'),label:'Collect file inventory'}}function showRequestError(type){const {button,status,label}=controls(type);if(status)status.textContent='Could not request the update. Try again.';if(button){button.disabled=false;button.textContent=label}}async function requestCollection(type){const {button,status}=controls(type);button.disabled=true;button.textContent='Update in progress…';status.textContent='Waiting for the device to respond.';try{const response=await fetch('/api/devices/'+encodeURIComponent(deviceId)+'/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type})});if(!response.ok)throw new Error();checkAction(type)}catch{showRequestError(type)}}async function requestRemoval(applicationId,versionCode,button){button.disabled=true;button.textContent='Requesting…';try{const response=await fetch('/api/devices/'+encodeURIComponent(deviceId)+'/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'removeApplication',payload:{applicationId,expectedVersionCode:versionCode}})});if(!response.ok)throw new Error();const action=(await response.json()).action;checkRemoval(action.id,button)}catch{button.disabled=false;button.textContent='Remove'}}document.getElementById('storage-action')?.addEventListener('click',()=>requestCollection('collectStorageSummary'));document.getElementById('apps-action')?.addEventListener('click',()=>requestCollection('collectAppInventory'));document.getElementById('files-action')?.addEventListener('click',()=>requestCollection('collectFileInventory'));document.querySelectorAll('[data-remove-application]').forEach(button=>button.addEventListener('click',()=>requestRemoval(button.dataset.applicationId,Number(button.dataset.versionCode),button)));${activeStorageAction ? "checkAction('collectStorageSummary');" : ""}${activeAppAction ? "checkAction('collectAppInventory');" : ""}${activeFileAction ? "checkAction('collectFileInventory');" : ""}</script></body></html>`;
}

function renderHistoryItem(action: Action): string {
  return `<li><div class="history-title"><strong>${escapeHtml(action.type)}</strong><span class="status-pill ${escapeHtml(action.status)}">${escapeHtml(action.status)}</span></div><span class="hint">Origin ${escapeHtml(action.origin)} · ${renderRelativeTime(action.requestedAt)} · ${action.attemptCount} attempt(s)</span>${action.resultMessage ? `<p>${escapeHtml(action.resultMessage)}</p>` : ""}</li>`;
}

function renderAppRow(app: AppInventory["apps"][number], actions: Action[], supportsRemoval: boolean): string {
  const activeAction = actions.find((action) =>
    action.payload && "applicationId" in action.payload && action.payload.applicationId === app.applicationId &&
    ["pending", "delivered", "awaiting_approval"].includes(action.status),
  );
  const actionCell = supportsRemoval && app.canRemove
    ? `<button type="button" data-remove-application data-application-id="${escapeHtml(app.applicationId)}" data-version-code="${app.versionCode}"${activeAction ? " disabled" : ""}>${activeAction ? (activeAction.status === "awaiting_approval" ? "Waiting for approval…" : "Removal in progress…") : "Remove"}</button>`
    : "";
  return `<tr><td>${escapeHtml(app.name)}</td><td>${escapeHtml(app.applicationId)}</td><td>${escapeHtml(app.versionName || String(app.versionCode))}</td><td>${renderRelativeTime(app.updatedAt)}</td><td>${actionCell}</td></tr>`;
}

function renderFileRow(file: FileInventorySnapshot["files"][number], actions: Action[], supportsRemoval: boolean): string {
  const activeAction = actions.find((action) =>
    action.payload && "fileId" in action.payload && action.payload.fileId === file.fileId &&
    ["pending", "delivered", "awaiting_approval"].includes(action.status),
  );
  const actionCell = supportsRemoval && file.canRemove
    ? `<button type="button" data-remove-file data-file-id="${escapeHtml(file.fileId)}" data-expected-revision="${escapeHtml(file.revision)}"${activeAction ? " disabled" : ""}>${activeAction ? (activeAction.status === "awaiting_approval" ? "Waiting for approval…" : "Removal in progress…") : "Remove"}</button>`
    : "";
  return `<tr><td>${escapeHtml(file.name)}</td><td>${escapeHtml(file.kind)}</td><td>${formatBytes(file.sizeBytes)}</td><td>${escapeHtml(file.sourceId)}</td><td>${actionCell}</td></tr>`;
}

function isStorageSummary(result: ActionResult | undefined): result is StorageSummary {
  return Boolean(result && "totalBytes" in result);
}

function isAppInventory(result: ActionResult | undefined): result is AppInventory {
  return Boolean(result && "apps" in result);
}

function renderRelativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return escapeHtml(value);
  }
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  const label = seconds < 60 ? "just now" : seconds < 3_600 ? `${Math.floor(seconds / 60)}m ago` : seconds < 86_400 ? `${Math.floor(seconds / 3_600)}h ago` : seconds < 2_592_000 ? `${Math.floor(seconds / 86_400)}d ago` : `${Math.floor(seconds / 2_592_000)}mo ago`;
  return `<time datetime="${escapeHtml(value)}" title="${escapeHtml(value)}">${label}</time>`;
}

function styles(): string {
  return "body{font-family:system-ui,sans-serif;max-width:1180px;margin:0 auto;padding:32px 20px;color:#172033;background:#f6f8fb}main{display:grid;gap:24px}.page-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.eyebrow{margin:0 0 6px;color:#61708a;text-transform:uppercase;letter-spacing:.08em;font-size:.72rem;font-weight:700}h1,h2,p{margin-top:0}h1{margin-bottom:6px}h2{margin-bottom:12px;font-size:1.15rem}.hint{color:#5b6575}.card{border:1px solid #dce3ee;border-radius:14px;padding:22px;background:#fff;box-shadow:0 4px 18px rgba(24,42,74,.04)}.pairing-card{display:flex;align-items:center;gap:18px}.pairing-card p{margin-bottom:0}.pairing-card .pairing-code{margin-left:auto;font-weight:700}.dashboard-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.overview-card,.action-card,.history-card{grid-column:span 1}.apps-card,.history-card{grid-column:1/-1}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.status-pill,.count-pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;background:#e9eef6;color:#41516b;font-size:.76rem;font-weight:700}.status-pill.online,.status-pill.completed{background:#e5f6ed;color:#17633a}.status-pill.awaiting_approval,.status-pill.pending,.status-pill.delivered{background:#fff3d6;color:#825b00}.status-pill.failed,.status-pill.cancelled,.status-pill.expired,.status-pill.stale{background:#fde9e7;color:#9a2c22}.metric{font-size:2rem;font-weight:750;margin-bottom:0}.count-pill{background:#edf2fb}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #e5eaf1;padding:13px 8px}th{color:#61708a;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em}a{color:#255fdb;text-decoration:none}a:hover{text-decoration:underline}.back-link{font-size:.9rem}.table-scroll{overflow-x:auto}dl{display:flex;gap:28px;flex-wrap:wrap}.details-list{margin-top:22px}.details-list dd{font-size:1rem}.details-list dt{color:#61708a;font-size:.78rem}.details-list dd,.details-list dt{margin:3px 0}.small-value{word-break:break-all}.metric+ .hint{margin-top:4px}.empty-state{color:#68758a}.history-list{display:grid;gap:0;padding-left:0;margin:0;list-style:none}.history-list li{padding:15px 0;border-bottom:1px solid #e5eaf1}.history-list li:last-child{border-bottom:0}.history-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:5px}.history-list p{margin:7px 0 0}.history-list .status-pill{font-weight:600}button{background:#255fdb;color:white;border:0;border-radius:8px;padding:10px 14px;font-weight:650;cursor:pointer;margin-top:16px}button:disabled{cursor:wait;opacity:.65}.apps-card button{margin-top:14px}@media(max-width:720px){body{padding:22px 14px}.dashboard-grid{grid-template-columns:1fr}.apps-card,.history-card{grid-column:auto}.page-header,.pairing-card{display:block}.pairing-card .pairing-code{margin-top:12px}.pairing-card button{margin-top:0}}";
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
