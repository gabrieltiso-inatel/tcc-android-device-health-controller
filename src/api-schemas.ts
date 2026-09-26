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
    capabilities: { type: "array", uniqueItems: true, items: { type: "string", enum: ["collectTelemetry", "collectStorageSummary", "collectAppInventory"] } },
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
  properties: { type: { type: "string", enum: ["collectTelemetry", "collectStorageSummary", "collectAppInventory"] } },
} as const;

const storageSummarySchema = {
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

const appInventorySchema = {
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
        required: ["packageName", "name", "versionName", "versionCode", "installedAt", "updatedAt"],
        properties: {
          packageName: { type: "string", minLength: 1, maxLength: 255 },
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
    message: { type: "string", minLength: 1, maxLength: 500 },
    errorCode: { type: "string", enum: ["unsupported_action", "execution_failed"] },
    result: { oneOf: [storageSummarySchema, appInventorySchema] },
  },
} as const;
