import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Telemetry = {
  deviceName: string;
  batteryPercentage: number;
  isCharging: boolean;
  capturedAt: string;
};

export type Device = Telemetry & { id: string; lastSeenAt: string };
export type CommandType = "collectTelemetry";
export type CommandStatus = "pending" | "delivered" | "completed" | "failed";
export type Command = {
  id: string;
  deviceId: string;
  type: CommandType;
  status: CommandStatus;
  requestedAt: string;
  deliveredAt?: string;
  completedAt?: string;
  resultMessage?: string;
};

type DeviceRow = {
  id: string;
  device_name: string;
  battery_percentage: number;
  is_charging: number;
  captured_at: string;
  last_seen_at: string;
};

type CommandRow = {
  id: string;
  device_id: string;
  type: CommandType;
  status: CommandStatus;
  requested_at: string;
  delivered_at: string | null;
  completed_at: string | null;
  result_message: string | null;
};

export class DeviceStore {
  private readonly database: DatabaseSync;

  constructor(
    databasePath = "data/controller.db",
    private readonly now = () => new Date().toISOString(),
    private readonly createIdentifier = randomUUID,
  ) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY, device_name TEXT NOT NULL, battery_percentage INTEGER NOT NULL,
        is_charging INTEGER NOT NULL, captured_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY, device_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
        requested_at TEXT NOT NULL, delivered_at TEXT, completed_at TEXT, result_message TEXT,
        FOREIGN KEY(device_id) REFERENCES devices(id)
      );
    `);
  }

  close() {
    this.database.close();
  }

  receiveTelemetry(deviceId: string, telemetry: Telemetry): Device {
    const lastSeenAt = this.now();
    this.database.prepare(`
      INSERT INTO devices (id, device_name, battery_percentage, is_charging, captured_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET device_name = excluded.device_name,
      battery_percentage = excluded.battery_percentage, is_charging = excluded.is_charging,
      captured_at = excluded.captured_at, last_seen_at = excluded.last_seen_at
    `).run(deviceId, telemetry.deviceName, telemetry.batteryPercentage, Number(telemetry.isCharging), telemetry.capturedAt, lastSeenAt);
    return { id: deviceId, ...telemetry, lastSeenAt };
  }

  listDevices(): Device[] {
    return (this.database.prepare("SELECT * FROM devices ORDER BY last_seen_at DESC").all() as DeviceRow[]).map(toDevice);
  }

  getDevice(deviceId: string): Device | undefined {
    const row = this.database.prepare("SELECT * FROM devices WHERE id = ?").get(deviceId) as DeviceRow | undefined;
    return row ? toDevice(row) : undefined;
  }

  createCommand(deviceId: string, type: CommandType): Command | undefined {
    if (!this.database.prepare("SELECT id FROM devices WHERE id = ?").get(deviceId)) {
      return undefined;
    }
    const command: Command = { id: this.createIdentifier(), deviceId, type, status: "pending", requestedAt: this.now() };
    this.database.prepare("INSERT INTO commands (id, device_id, type, status, requested_at) VALUES (?, ?, ?, ?, ?)")
      .run(command.id, command.deviceId, command.type, command.status, command.requestedAt);
    return command;
  }

  getPendingCommands(deviceId: string): Command[] {
    const rows = this.database.prepare("SELECT * FROM commands WHERE device_id = ? AND status = 'pending' ORDER BY requested_at ASC")
      .all(deviceId) as CommandRow[];
    const deliveredAt = this.now();
    this.database.prepare("UPDATE commands SET status = 'delivered', delivered_at = ? WHERE device_id = ? AND status = 'pending'")
      .run(deliveredAt, deviceId);
    return rows.map((row) => toCommand(row.status === "pending" ? { ...row, status: "delivered", delivered_at: deliveredAt } : row));
  }

  getCommandHistory(deviceId: string): Command[] {
    const rows = this.database.prepare("SELECT * FROM commands WHERE device_id = ? ORDER BY requested_at DESC").all(deviceId) as CommandRow[];
    return rows.map(toCommand);
  }

  completeCommand(commandId: string, succeeded: boolean, message: string): Command | undefined {
    const row = this.database.prepare("SELECT * FROM commands WHERE id = ? AND status IN ('pending', 'delivered')")
      .get(commandId) as CommandRow | undefined;
    if (!row) {
      return undefined;
    }
    const completedAt = this.now();
    const status: CommandStatus = succeeded ? "completed" : "failed";
    this.database.prepare("UPDATE commands SET status = ?, completed_at = ?, result_message = ? WHERE id = ?")
      .run(status, completedAt, message, commandId);
    return toCommand({ ...row, status, completed_at: completedAt, result_message: message });
  }
}

function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    deviceName: row.device_name,
    batteryPercentage: row.battery_percentage,
    isCharging: Boolean(row.is_charging),
    capturedAt: row.captured_at,
    lastSeenAt: row.last_seen_at,
  };
}

function toCommand(row: CommandRow): Command {
  return {
    id: row.id,
    deviceId: row.device_id,
    type: row.type,
    status: row.status,
    requestedAt: row.requested_at,
    ...(row.delivered_at ? { deliveredAt: row.delivered_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.result_message ? { resultMessage: row.result_message } : {}),
  };
}
