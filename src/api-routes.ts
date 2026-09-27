import type { FastifyInstance } from "fastify";
import {
  DeviceStore,
  type ActionPayload,
  type ActionResult,
  type ActionType,
  type AppInventory,
  type StorageSummary,
  type Telemetry,
} from "./device-store.js";
import {
  actionResultSchema,
  actionSchema,
  appInventorySchema,
  pairingSchema,
  storageSummarySchema,
  telemetrySchema,
} from "./api-schemas.js";
import { authenticateDeviceRequest, readBearerToken, unauthorized } from "./auth.js";
import { withConnectionStatus } from "./web-renderer.js";
import { isValidAppInventory, isValidStorageSummary } from "./domain.js";

type PairingRequest = {
  code: string;
  deviceId: string;
  deviceName: string;
};

type ActionResultRequest = {
  succeeded: boolean;
  status?: "awaiting_approval" | "completed" | "cancelled" | "failed";
  message: string;
  errorCode?: string;
  result?: ActionResult;
};

type ActionRequest = {
  type: ActionType;
  payload?: ActionPayload;
};

export function registerApiRoutes(app: FastifyInstance, store: DeviceStore): void {
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/devices", async () => ({ devices: store.listDevices().map(withConnectionStatus) }));

  app.post("/api/pairing-codes", async (_request, reply) =>
    reply.code(201).send({ pairingCode: store.createPairingCode() }),
  );

  app.post<{ Body: PairingRequest }>(
    "/api/devices/pair",
    { schema: { body: pairingSchema } },
    async (request, reply) => {
      const credential = store.pairDevice(request.body.code, request.body.deviceId, request.body.deviceName.trim());
      return credential
        ? reply.code(201).send({ token: credential.token })
        : reply.code(400).send({ message: "Pairing code is invalid or expired" });
    },
  );

  app.post<{ Params: { deviceId: string }; Body: Telemetry }>(
    "/api/devices/:deviceId/telemetry",
    { schema: { body: telemetrySchema } },
    async (request, reply) => {
      if (!authenticateDeviceRequest(request.headers.authorization, request.params.deviceId, store)) {
        return unauthorized(reply);
      }
      return { device: store.receiveTelemetry(request.params.deviceId, request.body) };
    },
  );

  app.post<{ Params: { deviceId: string }; Body: StorageSummary }>(
    "/api/devices/:deviceId/storage",
    { schema: { body: storageSummarySchema } },
    async (request, reply) => {
      if (!authenticateDeviceRequest(request.headers.authorization, request.params.deviceId, store)) {
        return unauthorized(reply);
      }
      if (!isValidStorageSummary(request.body)) {
        return reply.code(400).send({ message: "Storage summary is inconsistent" });
      }
      return { storage: store.receiveStorageSummary(request.params.deviceId, request.body) };
    },
  );

  app.post<{ Params: { deviceId: string }; Body: AppInventory }>(
    "/api/devices/:deviceId/apps",
    { schema: { body: appInventorySchema } },
    async (request, reply) => {
      if (!authenticateDeviceRequest(request.headers.authorization, request.params.deviceId, store)) {
        return unauthorized(reply);
      }
      if (!isValidAppInventory(request.body)) {
        return reply.code(400).send({ message: "App inventory is inconsistent" });
      }
      return { apps: store.receiveAppInventory(request.params.deviceId, request.body) };
    },
  );

  app.get<{ Params: { deviceId: string } }>("/api/devices/:deviceId/actions", async (request, reply) => {
    if (!authenticateDeviceRequest(request.headers.authorization, request.params.deviceId, store)) {
      return unauthorized(reply);
    }
    store.recordDeviceContact(request.params.deviceId);
    return { actions: store.getPendingActions(request.params.deviceId) };
  });

  app.get<{ Params: { deviceId: string } }>("/api/devices/:deviceId/history", async (request, reply) => {
    if (
      request.headers.authorization &&
      !authenticateDeviceRequest(request.headers.authorization, request.params.deviceId, store)
    ) {
      return unauthorized(reply);
    }
    return { actions: store.getActionHistory(request.params.deviceId) };
  });

  app.post<{ Params: { deviceId: string }; Body: ActionRequest }>(
    "/api/devices/:deviceId/actions",
    { schema: { body: actionSchema } },
    async (request, reply) => {
      if (!store.getDevice(request.params.deviceId)) {
        return reply.code(404).send({ message: "Device not found" });
      }
      const authorization = request.headers.authorization;
      const origin = authorization ? "device" : "controller";
      if (authorization && !authenticateDeviceRequest(authorization, request.params.deviceId, store)) {
        return unauthorized(reply);
      }
      const hasPayload = request.body.payload !== undefined;
      const requiresPayload = request.body.type === "removeApplication";
      if (hasPayload !== requiresPayload) {
        return reply.code(400).send({ message: "Action payload is invalid" });
      }
      if (!store.supportsAction(request.params.deviceId, request.body.type)) {
        return reply.code(409).send({ message: "Action is not supported by this device" });
      }
      const action = store.createAction(request.params.deviceId, request.body.type, origin, request.body.payload);
      return reply.code(201).send({ action });
    },
  );

  app.post<{ Params: { actionId: string }; Body: ActionResultRequest }>(
    "/api/actions/:actionId/result",
    { schema: { body: actionResultSchema } },
    async (request, reply) => {
      const token = readBearerToken(request.headers.authorization);
      if (!token || !store.authenticateAction(request.params.actionId, token)) {
        return unauthorized(reply);
      }
      if (request.body.succeeded && request.body.result && "totalBytes" in request.body.result && !isValidStorageSummary(request.body.result)) {
        return reply.code(400).send({ message: "Storage summary is inconsistent" });
      }
      if (request.body.succeeded && request.body.result && "apps" in request.body.result && !isValidAppInventory(request.body.result)) {
        return reply.code(400).send({ message: "App inventory is inconsistent" });
      }
      const status = request.body.status ?? (request.body.succeeded ? "completed" : "failed");
      if (status === "completed" && !request.body.succeeded) {
        return reply.code(400).send({ message: "Completed action must succeed" });
      }
      if (status !== "completed" && request.body.succeeded) {
        return reply.code(400).send({ message: "Non-completed action cannot succeed" });
      }
      const action = store.completeAction(
        request.params.actionId,
        request.body.succeeded,
        request.body.message,
        request.body.errorCode,
        request.body.result,
        status,
      );
      return action ? { action } : reply.code(404).send({ message: "Pending action not found" });
    },
  );
}
