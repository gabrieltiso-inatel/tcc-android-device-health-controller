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
    capabilities: { type: "array", uniqueItems: true, items: { type: "string", enum: ["collectTelemetry", "collectStorageSummary", "collectAppInventory", "collectFileInventory", "removeApplication", "removeFile"] } },
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
    type: { type: "string", enum: ["collectTelemetry", "collectStorageSummary", "collectAppInventory", "collectFileInventory", "removeApplication", "removeFile"] },
    payload: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["applicationId"],
          properties: {
            applicationId: { type: "string", minLength: 1, maxLength: 255 },
            expectedVersionCode: { type: "integer", minimum: 0 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["fileId"],
          properties: {
            fileId: { type: "string", minLength: 1, maxLength: 512 },
            expectedRevision: { type: "string", minLength: 1, maxLength: 255 },
          },
        },
      ],
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
        required: ["applicationId", "name", "canRemove", "versionName", "versionCode", "installedAt", "updatedAt"],
        properties: {
          applicationId: { type: "string", minLength: 1, maxLength: 255 },
          name: { type: "string", minLength: 1, maxLength: 255 },
          canRemove: { type: "boolean" },
          versionName: { type: "string", maxLength: 120 },
          versionCode: { type: "integer", minimum: 0 },
          installedAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
} as const;

export const fileInventorySchema = {
  type: "object",
  additionalProperties: false,
  required: ["sources", "files", "capturedAt"],
  properties: {
    capturedAt: { type: "string", format: "date-time" },
    sources: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "label", "kind", "authorization"],
        properties: {
          sourceId: { type: "string", minLength: 1, maxLength: 255 },
          label: { type: "string", minLength: 1, maxLength: 255 },
          kind: { type: "string", enum: ["media", "downloads", "documents", "selected_folder"] },
          authorization: { type: "string", enum: ["available", "requires_consent", "unavailable"] },
          itemCount: { type: "integer", minimum: 0 },
        },
      },
    },
    files: {
      type: "array",
      maxItems: 5000,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fileId", "sourceId", "name", "kind", "sizeBytes", "canRemove", "revision"],
        properties: {
          fileId: { type: "string", minLength: 1, maxLength: 512 },
          sourceId: { type: "string", minLength: 1, maxLength: 255 },
          name: { type: "string", minLength: 1, maxLength: 255 },
          kind: { type: "string", enum: ["image", "video", "audio", "document", "other"] },
          mimeType: { type: "string", maxLength: 120 },
          sizeBytes: { type: "integer", minimum: 0 },
          modifiedAt: { type: "string", format: "date-time" },
          displayPath: { type: "string", maxLength: 1000 },
          canRemove: { type: "boolean" },
          revision: { type: "string", minLength: 1, maxLength: 255 },
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
    errorCode: { type: "string", enum: ["approval_required", "unsupported_action", "execution_failed", "application_removed", "application_not_found", "application_changed", "approval_declined", "not_allowed", "already_absent", "file_removed", "file_not_found", "file_changed", "file_not_allowed", "file_already_absent"] },
    result: { oneOf: [storageSummarySchema, appInventorySchema, fileInventorySchema] },
  },
} as const;
