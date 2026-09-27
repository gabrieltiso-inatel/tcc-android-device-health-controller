export const telemetrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["deviceName", "manufacturer", "model", "androidVersion", "apiLevel", "agentVersion", "capabilities", "batteryPercentage", "isCharging", "capturedAt"],
  properties: {
    deviceName: { type: "string", minLength: 1, maxLength: 120 },
    manufacturer: { type: "string", minLength: 1, maxLength: 120 },
    model: { type: "string", minLength: 1, maxLength: 120 },
    androidVersion: { type: "string", minLength: 1, maxLength: 40 },
    apiLevel: { type: "integer", minimum: 26 },
    agentVersion: { type: "string", minLength: 1, maxLength: 40 },
    capabilities: { type: "array", uniqueItems: true, items: { type: "string", enum: ["collectTelemetry", "collectStorageSummary", "collectAppInventory", "removeApplication"] } },
    batteryPercentage: { type: "integer", minimum: 0, maximum: 100 },
    isCharging: { type: "boolean" },
    capturedAt: { type: "string", format: "date-time" },
  },
} as const;

export const pairingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "deviceId", "deviceName"],
  properties: {
    code: { type: "string", pattern: "^[0-9]{6}$" },
    deviceId: { type: "string", minLength: 1, maxLength: 120 },
    deviceName: { type: "string", minLength: 1, maxLength: 120 },
  },
} as const;

export const actionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type"],
  properties: {
    type: { type: "string", enum: ["collectTelemetry", "collectStorageSummary", "collectAppInventory", "removeApplication"] },
    payload: {
      type: "object",
      additionalProperties: false,
      required: ["applicationId"],
      properties: {
        applicationId: { type: "string", minLength: 1, maxLength: 255 },
        expectedVersionCode: { type: "integer", minimum: 0 },
      },
    },
  },
} as const;

export const storageSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["totalBytes", "usedBytes", "availableBytes", "capturedAt"],
  properties: {
    totalBytes: { type: "integer", minimum: 0 },
    usedBytes: { type: "integer", minimum: 0 },
    availableBytes: { type: "integer", minimum: 0 },
    capturedAt: { type: "string", format: "date-time" },
  },
} as const;

export const appInventorySchema = {
  type: "object",
  additionalProperties: false,
  required: ["apps", "capturedAt"],
  properties: {
    capturedAt: { type: "string", format: "date-time" },
    apps: {
      type: "array",
      maxItems: 1000,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["applicationId", "name", "versionName", "versionCode", "installedAt", "updatedAt"],
        properties: {
          applicationId: { type: "string", minLength: 1, maxLength: 255 },
          name: { type: "string", minLength: 1, maxLength: 255 },
          versionName: { type: "string", maxLength: 120 },
          versionCode: { type: "integer", minimum: 0 },
          installedAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
} as const;

export const actionResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["succeeded", "message"],
  properties: {
    succeeded: { type: "boolean" },
    status: { type: "string", enum: ["awaiting_approval", "completed", "cancelled", "failed"] },
    message: { type: "string", minLength: 1, maxLength: 500 },
    errorCode: { type: "string", enum: ["approval_required", "unsupported_action", "execution_failed", "application_removed", "application_not_found", "application_changed", "approval_declined", "not_allowed", "already_absent"] },
    result: { oneOf: [storageSummarySchema, appInventorySchema] },
  },
} as const;
