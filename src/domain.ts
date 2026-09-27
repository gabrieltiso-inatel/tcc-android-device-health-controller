export type ActionType = "collectTelemetry" | "collectStorageSummary" | "collectAppInventory" | "collectFileInventory" | "removeApplication" | "removeFile";
export type ActionOrigin = "controller" | "device";
export type ActionStatus = "pending" | "delivered" | "awaiting_approval" | "completed" | "cancelled" | "failed" | "expired";
export type ActionResultStatus = "awaiting_approval" | "completed" | "cancelled" | "failed";

export type ApplicationTarget = {
  applicationId: string;
  expectedVersionCode?: number;
};

export type FileTarget = {
  fileId: string;
  expectedRevision?: string;
};

export type ActionPayload = ApplicationTarget | FileTarget;

export type Telemetry = {
  deviceName: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  apiLevel: number;
  agentVersion: string;
  capabilities: ActionType[];
  batteryPercentage: number;
  isCharging: boolean;
  capturedAt: string;
};

export type Device = Telemetry & { id: string; lastSeenAt: string };

export type StorageSummary = {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  capturedAt: string;
};

export type StorageSnapshot = StorageSummary & {
  receivedAt: string;
};

export function isValidStorageSummary(summary: StorageSummary): boolean {
  const valuesAreValid = [summary.totalBytes, summary.usedBytes, summary.availableBytes]
    .every((value) => Number.isSafeInteger(value) && value >= 0);
  return valuesAreValid &&
    summary.usedBytes <= summary.totalBytes &&
    summary.availableBytes <= summary.totalBytes &&
    summary.usedBytes + summary.availableBytes <= summary.totalBytes;
}

export type InstalledApp = {
  applicationId: string;
  name: string;
  canRemove: boolean;
  versionName: string;
  versionCode: number;
  installedAt: string;
  updatedAt: string;
};

export type AppInventory = {
  apps: InstalledApp[];
  capturedAt: string;
};

export type AppInventorySnapshot = AppInventory & {
  receivedAt: string;
};

export type FileSourceKind = "media" | "downloads" | "documents" | "selected_folder";
export type FileKind = "image" | "video" | "audio" | "document" | "other";

export type FileSource = {
  sourceId: string;
  label: string;
  kind: FileSourceKind;
  authorization: "available" | "requires_consent" | "unavailable";
  itemCount?: number;
};

export type FileItem = {
  fileId: string;
  sourceId: string;
  name: string;
  kind: FileKind;
  mimeType?: string;
  sizeBytes: number;
  modifiedAt?: string;
  displayPath?: string;
  canRemove: boolean;
  revision: string;
};

export type FileInventory = {
  capturedAt: string;
  sources: FileSource[];
  files: FileItem[];
};

export type FileInventorySnapshot = FileInventory & {
  receivedAt: string;
};

export function isValidFileInventory(inventory: FileInventory): boolean {
  const sourceIds = inventory.sources.map((source) => source.sourceId);
  const fileIds = inventory.files.map((file) => file.fileId);
  const sourceIdSet = new Set(sourceIds);
  return new Set(sourceIds).size === sourceIds.length &&
    new Set(fileIds).size === fileIds.length &&
    inventory.files.every((file) => sourceIdSet.has(file.sourceId) && Number.isSafeInteger(file.sizeBytes) && file.sizeBytes >= 0 && file.name.length > 0 && file.revision.length > 0);
}

export function isValidAppInventory(inventory: AppInventory): boolean {
  const applicationIds = inventory.apps.map((app) => app.applicationId);
  return new Set(applicationIds).size === applicationIds.length &&
    inventory.apps.every((app) => typeof app.canRemove === "boolean" && Number.isSafeInteger(app.versionCode) && app.versionCode >= 0);
}

export type ActionResult = StorageSummary | AppInventory | FileInventory;

export type Action = {
  id: string;
  deviceId: string;
  type: ActionType;
  payload?: ActionPayload;
  origin: ActionOrigin;
  status: ActionStatus;
  requestedAt: string;
  attemptCount: number;
  deliveredAt?: string;
  completedAt?: string;
  resultCode?: string;
  resultMessage?: string;
  result?: ActionResult;
};

export type PairingCode = {
  code: string;
  expiresAt: string;
};

export type DeviceCredential = {
  deviceId: string;
  token: string;
};
