export type ActionType = "collectTelemetry" | "collectStorageSummary" | "collectAppInventory";
export type ActionOrigin = "controller" | "device";
export type ActionStatus = "pending" | "delivered" | "completed" | "failed" | "expired";

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

export type InstalledApp = {
  packageName: string;
  name: string;
  versionName: string;
  versionCode: number;
  installedAt: string;
  updatedAt: string;
};

export type AppInventory = {
  apps: InstalledApp[];
  capturedAt: string;
};

export type ActionResult = StorageSummary | AppInventory;

export type Action = {
  id: string;
  deviceId: string;
  type: ActionType;
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
