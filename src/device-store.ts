export type Telemetry = {
  deviceName: string;
  batteryPercentage: number;
  isCharging: boolean;
  capturedAt: string;
};

export type Device = Telemetry & {
  id: string;
  lastSeenAt: string;
};

export type CommandType = "collectTelemetry";

export type Command = {
  id: string;
  deviceId: string;
  type: CommandType;
  status: "pending" | "completed" | "failed";
  requestedAt: string;
  completedAt?: string;
  resultMessage?: string;
};

type Clock = () => string;
type IdentifierFactory = () => string;

export class DeviceStore {
  private readonly devices = new Map<string, Device>();
  private readonly commands = new Map<string, Command>();

  constructor(
    private readonly now: Clock = () => new Date().toISOString(),
    private readonly createIdentifier: IdentifierFactory = randomUUID,
  ) {}

  receiveTelemetry(deviceId: string, telemetry: Telemetry): Device {
    const device = {
      id: deviceId,
      ...telemetry,
      lastSeenAt: this.now(),
    };

    this.devices.set(deviceId, device);
    return device;
  }

  listDevices(): Device[] {
    return [...this.devices.values()].sort((left, right) =>
      right.lastSeenAt.localeCompare(left.lastSeenAt),
    );
  }

  createCommand(deviceId: string, type: CommandType): Command | undefined {
    if (!this.devices.has(deviceId)) {
      return undefined;
    }

    const command: Command = {
      id: this.createIdentifier(),
      deviceId,
      type,
      status: "pending",
      requestedAt: this.now(),
    };

    this.commands.set(command.id, command);
    return command;
  }

  getPendingCommands(deviceId: string): Command[] {
    return [...this.commands.values()].filter(
      (command) => command.deviceId === deviceId && command.status === "pending",
    );
  }

  completeCommand(commandId: string, succeeded: boolean, message: string): Command | undefined {
    const command = this.commands.get(commandId);
    if (!command || command.status !== "pending") {
      return undefined;
    }

    const completedCommand: Command = {
      ...command,
      status: succeeded ? "completed" : "failed",
      completedAt: this.now(),
      resultMessage: message,
    };

    this.commands.set(commandId, completedCommand);
    return completedCommand;
  }
}
import { randomUUID } from "node:crypto";
