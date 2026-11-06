import type { Action, ActionType, AppInventorySnapshot, Device, FileInventorySnapshot, InstalledApp, StorageSnapshot } from "./domain.js";
import { webClientScript } from "./web-client.js";
import { webStyles } from "./web-styles.js";

export type DeviceWithConnectionStatus = Device & { status: "online" | "stale" };

const activeStatuses = ["pending", "delivered", "awaiting_approval"];

export function withConnectionStatus(device: Device): DeviceWithConnectionStatus {
  return { ...device, status: Date.now() - Date.parse(device.lastSeenAt) <= 60_000 ? "online" : "stale" };
}

export function renderDashboard(devices: DeviceWithConnectionStatus[]): string {
  const rows = devices.map((device) => `<tr>
    <td data-label="Device"><a class="device-link" href="/devices/${encodeURIComponent(device.id)}">${escapeHtml(device.deviceName)}</a><span class="subtext">${escapeHtml(device.manufacturer)} ${escapeHtml(device.model)}</span></td>
    <td data-label="Status">${statusBadge(device.status)}</td>
    <td data-label="Battery"><strong>${device.batteryPercentage}%</strong><span class="subtext">${device.isCharging ? "Charging" : "Not charging"}</span></td>
    <td data-label="Last contact">${relativeTime(device.lastSeenAt)}</td>
    </tr>`).join("");
  return page("Devices", `<header class="page-header"><div><p class="eyebrow">Your devices</p><h1>Devices</h1><p class="hint">Health, storage and actions in one place.</p></div><span class="count-pill">${devices.length} device(s)</span></header>
    <section class="card"><div class="section-heading"><h2>Device overview</h2><span class="hint">Updates automatically</span></div>
    ${rows ? `<table><thead><tr><th>Device</th><th>Status</th><th>Battery</th><th>Last contact</th></tr></thead><tbody>${rows}</tbody></table>` : emptyState("No devices yet", "Use Add device to create a pairing code, then connect your Android agent.")}</section>`, true);
}

export function renderDeviceDetail(device: Device, actions: Action[], storage?: StorageSnapshot, apps?: AppInventorySnapshot, files?: FileInventorySnapshot): string {
  const active = actions.filter((action) => activeStatuses.includes(action.status));
  return page(device.deviceName, `<a class="back-link" href="/">← All devices</a>
    <header class="page-header"><div><p class="eyebrow">Device details</p><h1>${escapeHtml(device.deviceName)}</h1><p class="hint">${escapeHtml(device.manufacturer)} ${escapeHtml(device.model)} · Android ${escapeHtml(device.androidVersion)}</p></div>${statusBadge(withConnectionStatus(device).status)}</header>
    <nav class="section-nav" aria-label="Device sections"><a href="#overview">Overview</a><a href="#apps">Apps</a><a href="#files">Files</a><a href="#pending">Pending (${active.length})</a><a href="#history">History</a></nav>
    <div class="dashboard-grid">
      <section class="card" id="overview"><p class="eyebrow">Overview</p><h2>Device health</h2><p class="metric">${device.batteryPercentage}<span>% battery</span></p><p>${device.isCharging ? "Charging" : "Not charging"}</p>
      <dl><div><dt>Last contact</dt><dd>${relativeTime(device.lastSeenAt)}</dd></div><div><dt>Reading captured</dt><dd>${relativeTime(device.capturedAt)}</dd></div></dl>${collectionButton(device, actions, "collectTelemetry", "Update device")}</section>
      <section class="card"><p class="eyebrow">Storage</p><h2>Device storage</h2>${storage ? `<p class="metric compact">${formatBytes(storage.usedBytes)}</p><p>${formatBytes(storage.usedBytes)} of ${formatBytes(storage.totalBytes)}</p><progress aria-label="Storage used" max="${Math.max(1, storage.totalBytes)}" value="${storage.usedBytes}"></progress><p class="hint">${formatBytes(storage.availableBytes)} available · Updated ${relativeTime(storage.capturedAt)}</p>` : emptyState("No storage reading yet", "A reading will appear after the agent synchronizes.")}${collectionButton(device, actions, "collectStorageSummary", "Update storage")}</section>
      <section class="card wide" id="pending"><div class="section-heading"><div><p class="eyebrow">Attention</p><h2>Pending actions</h2></div><span class="count-pill">${active.length}</span></div>
      ${active.length ? `<ul class="pending-list">${active.map((action) => `<li><strong>${actionLabel(action.type)}</strong>${statusBadge(action.status)}<span class="hint">${escapeHtml(actionTarget(action, apps, files))}</span></li>`).join("")}</ul><p class="hint">Approvals are reviewed on the Android device.</p>` : emptyState("You're all caught up", "No actions are waiting for a device response or approval.")}</section>
      ${appsSection(device, actions, apps)}
      ${filesSection(device, actions, files)}
      ${historySection(actions, apps, files)}
    </div>`, false, device.id);
}

function appsSection(device: Device, actions: Action[], inventory?: AppInventorySnapshot): string {
  const rows = inventory?.apps.map((app) => appRow(device, actions, app)).join("") ?? "";
  return `<section class="card wide" id="apps" data-list="apps"><div class="section-heading"><div><p class="eyebrow">Applications</p><h2>Installed apps</h2></div>${collectionButton(device, actions, "collectAppInventory", "Update apps")}</div>
    <p class="hint">User-installed applications. Removal requires approval on the device.${inventory ? ` ${inventory.apps.length} apps · Updated ${relativeTime(inventory.capturedAt)}` : ""}</p>
    ${listSearch("apps", "Search apps")}
    <table><thead><tr><th>Application</th><th>Version</th><th>Updated</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>${listFooter()}
    ${!inventory ? emptyState("No apps collected yet", "Wait for the first synchronization or request an update.") : ""}</section>`;
}

function appRow(device: Device, actions: Action[], app: InstalledApp): string {
  const removals = actions.filter((action) => action.type === "removeApplication" && action.payload && "applicationId" in action.payload && action.payload.applicationId === app.applicationId);
  const active = removals.find((action) => activeStatuses.includes(action.status));
  const latest = removals[0];
  const latestResult = !active && latest?.resultMessage
    ? `<span class="subtext">${escapeHtml(latest.resultMessage)} · ${relativeTime(latest.completedAt ?? latest.requestedAt)}</span>`
    : "";
  return `<tr data-entry data-search="${escapeHtml(`${app.name} ${app.applicationId}`.toLowerCase())}"><td data-label="Application"><strong>${escapeHtml(app.name)}</strong><span class="subtext">${escapeHtml(app.applicationId)}</span></td><td data-label="Version">${escapeHtml(app.versionName || String(app.versionCode))}</td><td data-label="Updated">${relativeTime(app.updatedAt)}</td><td data-label="Action">${app.canRemove && device.capabilities.includes("removeApplication") ? removalButton("removeApplication", app.applicationId, app.name, String(app.versionCode), active) : '<span class="hint">Removal unavailable</span>'}${latestResult}</td></tr>`;
}

function filesSection(device: Device, actions: Action[], inventory?: FileInventorySnapshot): string {
  const rows = inventory?.files.map((file) => {
    const active = actions.find((action) => action.type === "removeFile" && action.payload && "fileId" in action.payload && action.payload.fileId === file.fileId && activeStatuses.includes(action.status));
    const source = inventory.sources.find((source) => source.sourceId === file.sourceId)?.label ?? "Authorized source";
    return `<tr data-entry data-search="${escapeHtml(file.name.toLowerCase())}"><td data-label="File"><strong>${escapeHtml(file.name)}</strong><span class="subtext">${escapeHtml(source)}</span></td><td data-label="Type">${escapeHtml(file.kind)}</td><td data-label="Size">${formatBytes(file.sizeBytes)}</td><td data-label="Action">${file.canRemove && device.capabilities.includes("removeFile") ? removalButton("removeFile", file.fileId, file.name, file.revision, active) : '<span class="hint">Read only</span>'}</td></tr>`;
  }).join("") ?? "";
  return `<section class="card wide" id="files" data-list="files"><div class="section-heading"><div><p class="eyebrow">Files</p><h2>File inventory</h2></div>${collectionButton(device, actions, "collectFileInventory", "Update files")}</div>
    <p class="hint">${inventory ? `${inventory.files.length} files · Updated ${relativeTime(inventory.capturedAt)}` : "Authorize media or folders in the Android agent, then request an inventory."}</p>
    ${inventory?.sources.length ? `<div class="source-list">${inventory.sources.map((source) => `<span class="source-label">${escapeHtml(source.label)} · ${escapeHtml(source.authorization.replaceAll("_", " "))}</span>`).join("")}</div>` : ""}
    ${listSearch("files", "Search files")}<table><thead><tr><th>File</th><th>Type</th><th>Size</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>${listFooter()}</section>`;
}

function historySection(actions: Action[], apps?: AppInventorySnapshot, files?: FileInventorySnapshot): string {
  return `<section class="card wide" id="history" data-list="history"><div class="section-heading"><div><p class="eyebrow">Activity</p><h2>Action history</h2></div><span class="count-pill">${actions.length}</span></div>
    <div class="list-toolbar"><label for="history-status">Status</label><select id="history-status" data-status-filter><option value="all">All actions</option><option value="active">In progress</option><option value="awaiting_approval">Awaiting approval</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="failed">Failed</option><option value="expired">Expired</option></select></div>
    <ol class="history-list">${actions.map((action) => `<li data-entry data-status="${escapeHtml(action.status)}"><div class="history-title"><strong>${actionLabel(action.type)}</strong>${statusBadge(action.status)}</div><p class="hint">${action.origin === "device" ? "Origin device · Agent" : "Origin controller · Controller"} · ${relativeTime(action.requestedAt)} · ${action.attemptCount} attempt(s)</p>${actionTarget(action, apps, files) ? `<p class="target-name">${escapeHtml(actionTarget(action, apps, files))}</p>` : ""}${action.resultMessage ? `<p>${escapeHtml(action.resultMessage)}</p>` : ""}</li>`).join("")}</ol>${listFooter()}</section>`;
}

function actionTarget(action: Action, apps?: AppInventorySnapshot, files?: FileInventorySnapshot): string {
  if (action.payload && "applicationId" in action.payload) {
    const id = action.payload.applicationId;
    return apps?.apps.find((app) => app.applicationId === id)?.name ?? id;
  }
  if (action.payload && "fileId" in action.payload) {
    const id = action.payload.fileId;
    return files?.files.find((file) => file.fileId === id)?.name ?? "File selected on device";
  }
  return "";
}

function collectionButton(device: Device, actions: Action[], type: ActionType, label: string): string {
  if (!device.capabilities.includes(type)) return '<span class="hint">Update unavailable on this agent.</span>';
  const active = actions.some((action) => action.type === type && activeStatuses.includes(action.status));
  return `<button class="secondary" type="button" data-action="${type}"${active ? " disabled" : ""}>${active ? "Update in progress…" : label}</button>`;
}

function removalButton(type: ActionType, target: string, name: string, revision: string, active?: Action): string {
  return `<button class="danger" type="button" data-action="${type}" data-target="${escapeHtml(target)}" data-name="${escapeHtml(name)}" data-revision="${escapeHtml(revision)}"${active ? " disabled" : ""}>${active ? (active.status === "awaiting_approval" ? "Awaiting approval" : "Removal in progress…") : "Remove"}</button>`;
}

function listSearch(id: string, label: string): string {
  return `<div class="list-toolbar"><label for="${id}-search">${label}</label><input id="${id}-search" type="search" data-search-filter placeholder="Type a name…" autocomplete="off"></div>`;
}

function listFooter(): string {
  return '<p data-list-empty class="empty-state" hidden>No matching entries.</p><div class="pagination"><button class="secondary" type="button" data-page="previous">Previous</button><span data-page-label class="hint"></span><button class="secondary" type="button" data-page="next">Next</button></div>';
}

function page(title: string, content: string, pairing = false, deviceId = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — Device Health</title><style>${webStyles}</style></head>
    <body data-device-id="${escapeHtml(deviceId)}"><main><div class="app-bar"><a href="/" class="brand"><span class="brand-mark">DH</span> Device Health</a><span class="hint">Controller</span>${pairing ? '<button type="button" data-pair>Add device</button>' : ""}</div>
    <p id="request-status" role="status" aria-live="polite" hidden></p><p id="connection-status" role="status" hidden></p>
    ${pairing ? '<section class="card pairing-card" id="pairing-card" hidden><p class="eyebrow">Connect your Android agent</p><p id="pairing-code" class="pairing-code"></p><p class="hint">Enter this code in the agent. It expires in 5 minutes.</p></section>' : ""}
    <div id="live-content">${content}</div><footer class="hint">Device Health · Readings reflect the last successful collection.</footer></main><script>${webClientScript}</script></body></html>`;
}

function statusBadge(status: string): string {
  const labels: Record<string, string> = { awaiting_approval: "Awaiting approval", stale: "No recent contact", online: "Online" };
  return `<span class="status-pill ${escapeHtml(status)}">${labels[status] ?? escapeHtml(status.charAt(0).toUpperCase() + status.slice(1))}</span>`;
}

function actionLabel(type: ActionType): string {
  return ({ collectTelemetry: "Update device", collectStorageSummary: "Update storage", collectAppInventory: "Update apps", collectFileInventory: "Update files", removeApplication: "Remove application", removeFile: "Remove file" })[type];
}

function emptyState(title: string, message: string): string {
  return `<div class="empty-state"><strong>${title}</strong><p>${message}</p></div>`;
}

function relativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return escapeHtml(value);
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  const label = seconds < 60 ? "just now" : seconds < 3_600 ? `${Math.floor(seconds / 60)}m ago` : seconds < 86_400 ? `${Math.floor(seconds / 3_600)}h ago` : `${Math.floor(seconds / 86_400)}d ago`;
  return `<time datetime="${escapeHtml(value)}" title="${escapeHtml(value)}">${label}</time>`;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
  return unit === 0 ? `${bytes} B` : `${size.toFixed(1)} ${units[unit]}`;
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
  return value.replace(/[&<>'"]/g, (character) => replacements[character] ?? character);
}
