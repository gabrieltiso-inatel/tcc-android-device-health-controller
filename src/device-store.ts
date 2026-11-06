import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { toAction, toDevice, type ActionRow, type DeviceRow } from "./store-mappers.js";
import { isValidAppInventory, isValidFileInventory, isValidStorageSummary } from "./domain.js";
export type {
  Action,
  ActionPayload,
  ActionOrigin,
  ActionResult,
  ActionResultStatus,
  ActionStatus,
  ActionType,
  AppInventory,
  AppInventorySnapshot,
  FileInventory,
  FileInventorySnapshot,
  FileTarget,
  Device,
  DeviceCredential,
  InstalledApp,
  PairingCode,
  StorageSnapshot,
  StorageSummary,
  Telemetry,
} from "./domain.js";
import type {
  Action,
  ActionPayload,
  ActionOrigin,
  ActionResult,
  ActionResultStatus,
  ActionStatus,
  ActionType,
  AppInventory,
  AppInventorySnapshot,
  FileInventory,
  FileInventorySnapshot,
  FileTarget,
  Device,
  DeviceCredential,
  PairingCode,
  StorageSnapshot,
  StorageSummary,
  Telemetry,
} from "./domain.js";

type PairingCodeRow = {
  code: string;
  expires_at: string;
  used_at: string | null;
};

type StorageSnapshotRow = {
  device_id: string;
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  captured_at: string;
  received_at: string;
};

type AppInventoryRow = {
  device_id: string;
  captured_at: string;
  received_at: string;
};

type InstalledAppRow = {
  application_id: string;
  name: string;
  can_remove: number;
  version_name: string;
  version_code: number;
  installed_at: string;
  updated_at: string;
};

type FileInventoryRow = {
  device_id: string;
  captured_at: string;
  received_at: string;
  sources_json: string;
};

type FileRow = {
  file_id: string;
  source_id: string;
  name: string;
  kind: "image" | "video" | "audio" | "document" | "other";
  mime_type: string | null;
  size_bytes: number;
  modified_at: string | null;
  display_path: string | null;
  can_remove: number;
  revision: string;
};

export class DeviceStore {
  private readonly database: DatabaseSync;

  constructor(
    databasePath = "data/controller.db",
    private readonly now = () => new Date().toISOString(),
    private readonly createIdentifier = randomUUID,
    private readonly createPairingCodeValue = () => randomInt(100_000, 1_000_000).toString(),
    private readonly createToken = () => randomBytes(32).toString("base64url"),
    private readonly deliveryTimeoutMilliseconds = 60_000,
    private readonly maximumDeliveryAttempts = 3,
  ) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY, device_name TEXT NOT NULL, battery_percentage INTEGER NOT NULL,
        is_charging INTEGER NOT NULL, captured_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
        manufacturer TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
        android_version TEXT NOT NULL DEFAULT '', api_level INTEGER NOT NULL DEFAULT 0,
        agent_version TEXT NOT NULL DEFAULT '', capabilities_json TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY, device_id TEXT NOT NULL, type TEXT NOT NULL,
        origin TEXT NOT NULL, status TEXT NOT NULL,
        requested_at TEXT NOT NULL, delivered_at TEXT, completed_at TEXT, result_code TEXT, result_message TEXT,
        result_json TEXT, payload_json TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(device_id) REFERENCES devices(id)
      );
      CREATE TABLE IF NOT EXISTS pairing_codes (
        code TEXT PRIMARY KEY, expires_at TEXT NOT NULL, used_at TEXT
      );
      CREATE TABLE IF NOT EXISTS device_credentials (
        device_id TEXT PRIMARY KEY, device_name TEXT NOT NULL, token_hash TEXT NOT NULL,
        paired_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS device_storage (
        device_id TEXT PRIMARY KEY, total_bytes INTEGER NOT NULL, used_bytes INTEGER NOT NULL,
        available_bytes INTEGER NOT NULL, captured_at TEXT NOT NULL, received_at TEXT NOT NULL,
        FOREIGN KEY(device_id) REFERENCES devices(id)
      );
      CREATE TABLE IF NOT EXISTS device_app_inventories (
        device_id TEXT PRIMARY KEY, captured_at TEXT NOT NULL, received_at TEXT NOT NULL,
        FOREIGN KEY(device_id) REFERENCES devices(id)
      );
      CREATE TABLE IF NOT EXISTS device_apps (
        device_id TEXT NOT NULL, application_id TEXT NOT NULL, name TEXT NOT NULL, can_remove INTEGER NOT NULL,
        version_name TEXT NOT NULL, version_code INTEGER NOT NULL,
        installed_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (device_id, application_id),
        FOREIGN KEY(device_id) REFERENCES devices(id)
      );
      CREATE TABLE IF NOT EXISTS device_file_inventories (
        device_id TEXT PRIMARY KEY, captured_at TEXT NOT NULL, received_at TEXT NOT NULL, sources_json TEXT NOT NULL DEFAULT '[]',
        FOREIGN KEY(device_id) REFERENCES devices(id)
      );
      CREATE TABLE IF NOT EXISTS device_files (
        device_id TEXT NOT NULL, file_id TEXT NOT NULL, source_id TEXT NOT NULL, name TEXT NOT NULL,
        kind TEXT NOT NULL, mime_type TEXT, size_bytes INTEGER NOT NULL, modified_at TEXT,
        display_path TEXT, can_remove INTEGER NOT NULL, revision TEXT NOT NULL,
        PRIMARY KEY (device_id, file_id), FOREIGN KEY(device_id) REFERENCES devices(id)
      );
    `);
    const fileInventoryColumns = this.database.prepare("PRAGMA table_info(device_file_inventories)").all() as Array<{ name: string }>;
    if (!fileInventoryColumns.some((column) => column.name === "sources_json")) {
      this.database.exec("ALTER TABLE device_file_inventories ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]'");
    }
    const actionColumns = this.database.prepare("PRAGMA table_info(actions)").all() as Array<{ name: string }>;
    if (!actionColumns.some((column) => column.name === "payload_json")) {
      this.database.exec("ALTER TABLE actions ADD COLUMN payload_json TEXT");
    }
    const appColumns = this.database.prepare("PRAGMA table_info(device_apps)").all() as Array<{ name: string }>;
    if (appColumns.some((column) => column.name === "package_name") || !appColumns.some((column) => column.name === "can_remove")) {
      const applicationColumn = appColumns.some((column) => column.name === "package_name") ? "package_name" : "application_id";
      const removableColumn = appColumns.some((column) => column.name === "can_remove") ? "can_remove" : "1";
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec("ALTER TABLE device_apps RENAME TO device_apps_legacy");
        this.database.exec(`
          CREATE TABLE device_apps (
            device_id TEXT NOT NULL, application_id TEXT NOT NULL, name TEXT NOT NULL, can_remove INTEGER NOT NULL,
            version_name TEXT NOT NULL, version_code INTEGER NOT NULL,
            installed_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            PRIMARY KEY (device_id, application_id),
            FOREIGN KEY(device_id) REFERENCES devices(id)
          )
        `);
        this.database.exec(`
          INSERT INTO device_apps (device_id, application_id, name, can_remove, version_name, version_code, installed_at, updated_at)
          SELECT device_id, ${applicationColumn}, name, ${removableColumn}, version_name, version_code, installed_at, updated_at
          FROM device_apps_legacy
        `);
        this.database.exec("DROP TABLE device_apps_legacy");
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }
  }

  close() {
    this.database.close();
  }

  createPairingCode(validForMinutes = 5): PairingCode {
    const code = this.createPairingCodeValue();
    const expiresAt = new Date(Date.parse(this.now()) + validForMinutes * 60_000).toISOString();
    this.database.prepare("INSERT INTO pairing_codes (code, expires_at) VALUES (?, ?)").run(code, expiresAt);
    return { code, expiresAt };
  }

  pairDevice(code: string, deviceId: string, deviceName: string): DeviceCredential | undefined {
    const pairedAt = this.now();
    const token = this.createToken();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const pairingCode = this.database.prepare("SELECT * FROM pairing_codes WHERE code = ?")
        .get(code) as PairingCodeRow | undefined;
      if (!pairingCode || pairingCode.used_at || pairingCode.expires_at < pairedAt) {
        this.database.exec("ROLLBACK");
        return undefined;
      }
      this.database.prepare("UPDATE pairing_codes SET used_at = ? WHERE code = ? AND used_at IS NULL")
        .run(pairedAt, code);
      this.database.prepare(`
        INSERT INTO device_credentials (device_id, device_name, token_hash, paired_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET device_name = excluded.device_name,
        token_hash = excluded.token_hash, paired_at = excluded.paired_at
      `).run(deviceId, deviceName, hashToken(token), pairedAt);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return { deviceId, token };
  }

  authenticateDevice(deviceId: string, token: string): boolean {
    const row = this.database.prepare("SELECT token_hash FROM device_credentials WHERE device_id = ?")
      .get(deviceId) as { token_hash: string } | undefined;
    return row ? matchesToken(token, row.token_hash) : false;
  }

  authenticateAction(actionId: string, token: string): boolean {
    const row = this.database.prepare(`
      SELECT credentials.token_hash FROM actions
      JOIN device_credentials credentials ON credentials.device_id = actions.device_id
      WHERE actions.id = ?
    `).get(actionId) as { token_hash: string } | undefined;
    return row ? matchesToken(token, row.token_hash) : false;
  }

  receiveTelemetry(deviceId: string, telemetry: Telemetry): Device {
    const lastSeenAt = this.now();
    this.database.prepare(`
      INSERT INTO devices (
        id, device_name, battery_percentage, is_charging, captured_at, last_seen_at,
        manufacturer, model, android_version, api_level, agent_version, capabilities_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET device_name = excluded.device_name,
      battery_percentage = excluded.battery_percentage, is_charging = excluded.is_charging,
      captured_at = excluded.captured_at, last_seen_at = excluded.last_seen_at,
      manufacturer = excluded.manufacturer, model = excluded.model,
      android_version = excluded.android_version, api_level = excluded.api_level,
      agent_version = excluded.agent_version, capabilities_json = excluded.capabilities_json
    `).run(
      deviceId,
      telemetry.deviceName,
      telemetry.batteryPercentage,
      Number(telemetry.isCharging),
      telemetry.capturedAt,
      lastSeenAt,
      telemetry.manufacturer,
      telemetry.model,
      telemetry.androidVersion,
      telemetry.apiLevel,
      telemetry.agentVersion,
      JSON.stringify(telemetry.capabilities),
    );
    return { id: deviceId, ...telemetry, lastSeenAt };
  }

  listDevices(): Device[] {
    return (this.database.prepare("SELECT * FROM devices ORDER BY last_seen_at DESC").all() as DeviceRow[]).map(toDevice);
  }

  getDevice(deviceId: string): Device | undefined {
    const row = this.database.prepare("SELECT * FROM devices WHERE id = ?").get(deviceId) as DeviceRow | undefined;
    return row ? toDevice(row) : undefined;
  }

  recordDeviceContact(deviceId: string): void {
    this.database.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(this.now(), deviceId);
  }

  receiveStorageSummary(deviceId: string, summary: StorageSummary): StorageSnapshot {
    if (!isValidStorageSummary(summary)) {
      throw new RangeError("Storage summary is inconsistent");
    }
    const receivedAt = this.now();
    this.upsertStorageSnapshot(deviceId, summary, receivedAt);
    this.database.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(receivedAt, deviceId);
    return this.getStorageSnapshot(deviceId) as StorageSnapshot;
  }

  getStorageSnapshot(deviceId: string): StorageSnapshot | undefined {
    const row = this.database.prepare("SELECT * FROM device_storage WHERE device_id = ?")
      .get(deviceId) as StorageSnapshotRow | undefined;
    return row ? toStorageSnapshot(row) : undefined;
  }

  receiveAppInventory(deviceId: string, inventory: AppInventory): AppInventorySnapshot {
    if (!isValidAppInventory(inventory)) {
      throw new RangeError("App inventory is inconsistent");
    }
    const receivedAt = this.now();
    this.upsertAppInventory(deviceId, inventory, receivedAt);
    this.database.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(receivedAt, deviceId);
    return this.getAppInventorySnapshot(deviceId) ?? { ...inventory, receivedAt };
  }

  getAppInventorySnapshot(deviceId: string): AppInventorySnapshot | undefined {
    const inventoryRow = this.database.prepare("SELECT * FROM device_app_inventories WHERE device_id = ?")
      .get(deviceId) as AppInventoryRow | undefined;
    if (!inventoryRow) {
      return undefined;
    }
    const apps = this.database.prepare(`
      SELECT application_id, name, can_remove, version_name, version_code, installed_at, updated_at
      FROM device_apps WHERE device_id = ? ORDER BY name COLLATE NOCASE ASC
    `).all(deviceId) as InstalledAppRow[];
    return {
      capturedAt: inventoryRow.captured_at,
      receivedAt: inventoryRow.received_at,
      apps: apps.map(toInstalledApp),
    };
  }

  receiveFileInventory(deviceId: string, inventory: FileInventory): FileInventorySnapshot {
    if (!isValidFileInventory(inventory)) {
      throw new RangeError("File inventory is inconsistent");
    }
    const receivedAt = this.now();
    this.upsertFileInventory(deviceId, inventory, receivedAt);
    this.database.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(receivedAt, deviceId);
    return this.getFileInventorySnapshot(deviceId) ?? { ...inventory, receivedAt };
  }

  getFileInventorySnapshot(deviceId: string): FileInventorySnapshot | undefined {
    const inventoryRow = this.database.prepare("SELECT * FROM device_file_inventories WHERE device_id = ?")
      .get(deviceId) as FileInventoryRow | undefined;
    if (!inventoryRow) {
      return undefined;
    }
    const files = this.database.prepare(`
      SELECT file_id, source_id, name, kind, mime_type, size_bytes, modified_at, display_path, can_remove, revision
      FROM device_files WHERE device_id = ? ORDER BY size_bytes DESC, name COLLATE NOCASE ASC
    `).all(deviceId) as FileRow[];
    return {
      capturedAt: inventoryRow.captured_at,
      receivedAt: inventoryRow.received_at,
      sources: JSON.parse(inventoryRow.sources_json) as FileInventory["sources"],
      files: files.map(toFileItem),
    };
  }

  createAction(deviceId: string, type: ActionType, origin: ActionOrigin, payload?: ActionPayload): Action | undefined {
    if (!this.supportsAction(deviceId, type)) {
      return undefined;
    }
    const requestedAt = this.now();
    const action: Action = {
      id: this.createIdentifier(),
      deviceId,
      type,
      ...(payload ? { payload } : {}),
      origin,
      status: origin === "controller" ? "pending" : "delivered",
      requestedAt,
      attemptCount: origin === "controller" ? 0 : 1,
      ...(origin === "device" ? { deliveredAt: requestedAt } : {}),
    };
    this.database.prepare(`
      INSERT INTO actions (id, device_id, type, payload_json, origin, status, requested_at, delivered_at, attempt_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      action.id,
      action.deviceId,
      action.type,
      action.payload ? JSON.stringify(action.payload) : null,
      action.origin,
      action.status,
      action.requestedAt,
      action.deliveredAt ?? null,
      action.attemptCount,
    );
    return action;
  }

  getPendingActions(deviceId: string): Action[] {
    const deliveredAt = this.now();
    this.expireActions(deviceId, deliveredAt);
    const retryBefore = new Date(Date.parse(deliveredAt) - this.deliveryTimeoutMilliseconds).toISOString();
    const rows = this.database.prepare(`
      SELECT * FROM actions
      WHERE device_id = ? AND origin = 'controller' AND (
        status = 'pending' OR
        (status = 'delivered' AND delivered_at <= ? AND attempt_count < ?)
      )
      ORDER BY requested_at ASC
    `).all(deviceId, retryBefore, this.maximumDeliveryAttempts) as ActionRow[];
    const update = this.database.prepare(`
      UPDATE actions SET status = 'delivered', delivered_at = ?, attempt_count = attempt_count + 1
      WHERE id = ?
    `);
    for (const row of rows) {
      update.run(deliveredAt, row.id);
    }
    return rows.map((row) => toAction({
      ...row,
      status: "delivered",
      delivered_at: deliveredAt,
      attempt_count: row.attempt_count + 1,
    }));
  }

  supportsAction(deviceId: string, type: ActionType): boolean {
    return this.getDevice(deviceId)?.capabilities.includes(type) ?? false;
  }

  getActionHistory(deviceId: string): Action[] {
    this.expireActions(deviceId, this.now());
    const rows = this.database.prepare("SELECT * FROM actions WHERE device_id = ? ORDER BY requested_at DESC").all(deviceId) as ActionRow[];
    return rows.map(toAction);
  }

  getAction(actionId: string): Action | undefined {
    const row = this.database.prepare("SELECT * FROM actions WHERE id = ?").get(actionId) as ActionRow | undefined;
    return row ? toAction(row) : undefined;
  }

  private expireActions(deviceId: string, currentTime: string): void {
    const retryBefore = new Date(Date.parse(currentTime) - this.deliveryTimeoutMilliseconds).toISOString();
    this.database.prepare(`
      UPDATE actions SET status = 'expired', completed_at = ?, result_code = 'execution_timeout',
      result_message = 'Action execution timed out'
      WHERE device_id = ? AND origin = 'device' AND status = 'delivered' AND delivered_at <= ?
    `).run(currentTime, deviceId, retryBefore);
    this.database.prepare(`
      UPDATE actions SET status = 'expired', completed_at = ?, result_code = 'delivery_timeout',
      result_message = 'Action delivery timed out'
      WHERE device_id = ? AND origin = 'controller' AND status = 'delivered'
      AND delivered_at <= ? AND attempt_count >= ?
    `).run(currentTime, deviceId, retryBefore, this.maximumDeliveryAttempts);
  }

  completeAction(
    actionId: string,
    succeeded: boolean,
    message: string,
    resultCode?: string,
    result?: ActionResult,
    status: ActionResultStatus = succeeded ? "completed" : "failed",
  ): Action | undefined {
    const row = this.database.prepare("SELECT * FROM actions WHERE id = ?").get(actionId) as ActionRow | undefined;
    if (!row) {
      return undefined;
    }
    if (!openActionStatuses.includes(row.status as ActionStatus)) {
      return row.status === status ? toAction(row) : undefined;
    }
    const completedAt = this.now();
    const resultJson = status === "completed" && result ? JSON.stringify(result) : null;
    this.database.prepare("UPDATE actions SET status = ?, completed_at = ?, result_code = ?, result_message = ?, result_json = ? WHERE id = ?")
      .run(status, status === "awaiting_approval" ? null : completedAt, resultCode ?? null, message, resultJson, actionId);
    if (status === "completed" && result && isStorageSummary(result) && isValidStorageSummary(result)) {
      this.upsertStorageSnapshot(row.device_id, result, completedAt);
    }
    if (status === "completed" && result && isAppInventory(result) && isValidAppInventory(result)) {
      this.upsertAppInventory(row.device_id, result, completedAt);
    }
    if (status === "completed" && result && isFileInventory(result) && isValidFileInventory(result)) {
      this.upsertFileInventory(row.device_id, result, completedAt);
    }
    if (status === "completed") {
      this.removeTargetFromInventory(toAction(row));
    }
    return toAction({
      ...row,
      status,
      completed_at: status === "awaiting_approval" ? null : completedAt,
      result_code: resultCode ?? null,
      result_message: message,
      result_json: resultJson,
    });
  }

  private removeTargetFromInventory(action: Action): void {
    if (action.type === "removeApplication" && action.payload && "applicationId" in action.payload) {
      this.database.prepare("DELETE FROM device_apps WHERE device_id = ? AND application_id = ?")
        .run(action.deviceId, action.payload.applicationId);
    }
    if (action.type === "removeFile" && action.payload && "fileId" in action.payload) {
      this.database.prepare("DELETE FROM device_files WHERE device_id = ? AND file_id = ?")
        .run(action.deviceId, action.payload.fileId);
    }
  }

  private upsertStorageSnapshot(deviceId: string, summary: StorageSummary, receivedAt: string): void {
    this.database.prepare(`
      INSERT INTO device_storage (device_id, total_bytes, used_bytes, available_bytes, captured_at, received_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET total_bytes = excluded.total_bytes,
      used_bytes = excluded.used_bytes, available_bytes = excluded.available_bytes,
      captured_at = excluded.captured_at, received_at = excluded.received_at
      WHERE excluded.captured_at >= device_storage.captured_at
    `).run(
      deviceId,
      summary.totalBytes,
      summary.usedBytes,
      summary.availableBytes,
      summary.capturedAt,
      receivedAt,
    );
  }

  private upsertAppInventory(deviceId: string, inventory: AppInventory, receivedAt: string): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.database.prepare("SELECT captured_at FROM device_app_inventories WHERE device_id = ?")
        .get(deviceId) as { captured_at: string } | undefined;
      if (current && current.captured_at > inventory.capturedAt) {
        this.database.exec("ROLLBACK");
        return;
      }
      this.database.prepare("DELETE FROM device_apps WHERE device_id = ?").run(deviceId);
      const insertApp = this.database.prepare(`
        INSERT INTO device_apps (device_id, application_id, name, can_remove, version_name, version_code, installed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const app of inventory.apps) {
        insertApp.run(
          deviceId,
          app.applicationId,
          app.name,
          Number(app.canRemove),
          app.versionName,
          app.versionCode,
          app.installedAt,
          app.updatedAt,
        );
      }
      this.database.prepare(`
        INSERT INTO device_app_inventories (device_id, captured_at, received_at)
        VALUES (?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET captured_at = excluded.captured_at, received_at = excluded.received_at
      `).run(deviceId, inventory.capturedAt, receivedAt);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private upsertFileInventory(deviceId: string, inventory: FileInventory, receivedAt: string): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.database.prepare("SELECT captured_at FROM device_file_inventories WHERE device_id = ?")
        .get(deviceId) as { captured_at: string } | undefined;
      if (current && current.captured_at > inventory.capturedAt) {
        this.database.exec("ROLLBACK");
        return;
      }
      this.database.prepare("DELETE FROM device_files WHERE device_id = ?").run(deviceId);
      const insertFile = this.database.prepare(`
        INSERT INTO device_files (device_id, file_id, source_id, name, kind, mime_type, size_bytes, modified_at, display_path, can_remove, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const file of inventory.files) {
        insertFile.run(deviceId, file.fileId, file.sourceId, file.name, file.kind, file.mimeType ?? null, file.sizeBytes, file.modifiedAt ?? null, file.displayPath ?? null, Number(file.canRemove), file.revision);
      }
      this.database.prepare(`
        INSERT INTO device_file_inventories (device_id, captured_at, received_at, sources_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET captured_at = excluded.captured_at, received_at = excluded.received_at, sources_json = excluded.sources_json
      `).run(deviceId, inventory.capturedAt, receivedAt, JSON.stringify(inventory.sources));
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

const openActionStatuses: ActionStatus[] = ["pending", "delivered", "awaiting_approval"];

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function matchesToken(token: string, expectedHash: string): boolean {
  const receivedHash = Buffer.from(hashToken(token), "hex");
  const storedHash = Buffer.from(expectedHash, "hex");
  return receivedHash.length === storedHash.length && timingSafeEqual(receivedHash, storedHash);
}

function isStorageSummary(result: ActionResult): result is StorageSummary {
  return "totalBytes" in result;
}

function isAppInventory(result: ActionResult): result is AppInventory {
  return "apps" in result;
}

function isFileInventory(result: ActionResult): result is FileInventory {
  return "files" in result;
}

function toStorageSnapshot(row: StorageSnapshotRow): StorageSnapshot {
  return {
    totalBytes: row.total_bytes,
    usedBytes: row.used_bytes,
    availableBytes: row.available_bytes,
    capturedAt: row.captured_at,
    receivedAt: row.received_at,
  };
}

function toInstalledApp(row: InstalledAppRow): AppInventory["apps"][number] {
  return {
    applicationId: row.application_id,
    name: row.name,
    canRemove: Boolean(row.can_remove),
    versionName: row.version_name,
    versionCode: row.version_code,
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
  };
}

function toFileItem(row: FileRow): FileInventory["files"][number] {
  return {
    fileId: row.file_id,
    sourceId: row.source_id,
    name: row.name,
    kind: row.kind,
    ...(row.mime_type ? { mimeType: row.mime_type } : {}),
    sizeBytes: row.size_bytes,
    ...(row.modified_at ? { modifiedAt: row.modified_at } : {}),
    ...(row.display_path ? { displayPath: row.display_path } : {}),
    canRemove: Boolean(row.can_remove),
    revision: row.revision,
  };
}
