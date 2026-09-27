import type { Action, ActionPayload, ActionResult, ActionType, Device } from "./domain.js";

export type DeviceRow = {
  id: string;
  device_name: string;
  battery_percentage: number;
  is_charging: number;
  captured_at: string;
  last_seen_at: string;
  manufacturer: string;
  model: string;
  android_version: string;
  api_level: number;
  agent_version: string;
  capabilities_json: string;
};

export type ActionRow = {
  id: string;
  device_id: string;
  type: ActionType;
  payload_json: string | null;
  origin: "controller" | "device";
  status: "pending" | "delivered" | "awaiting_approval" | "completed" | "cancelled" | "failed" | "expired";
  requested_at: string;
  delivered_at: string | null;
  completed_at: string | null;
  result_message: string | null;
  result_code: string | null;
  result_json: string | null;
  attempt_count: number;
};

export function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    deviceName: row.device_name,
    manufacturer: row.manufacturer,
    model: row.model,
    androidVersion: row.android_version,
    apiLevel: row.api_level,
    agentVersion: row.agent_version,
    capabilities: JSON.parse(row.capabilities_json) as ActionType[],
    batteryPercentage: row.battery_percentage,
    isCharging: Boolean(row.is_charging),
    capturedAt: row.captured_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function toAction(row: ActionRow): Action {
  return {
    id: row.id,
    deviceId: row.device_id,
    type: row.type,
    ...(row.payload_json ? { payload: JSON.parse(row.payload_json) as ActionPayload } : {}),
    origin: row.origin,
    status: row.status,
    requestedAt: row.requested_at,
    attemptCount: row.attempt_count,
    ...(row.delivered_at ? { deliveredAt: row.delivered_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.result_code ? { resultCode: row.result_code } : {}),
    ...(row.result_message ? { resultMessage: row.result_message } : {}),
    ...(row.result_json ? { result: JSON.parse(row.result_json) as ActionResult } : {}),
  };
}
