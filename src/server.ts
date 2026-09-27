import Fastify from "fastify";
import { registerApiRoutes } from "./api-routes.js";
import { DeviceStore } from "./device-store.js";
import { renderDashboard, renderDeviceDetail, withConnectionStatus } from "./web-renderer.js";

const port = Number(process.env.PORT ?? 3000);

export function createControllerServer(store = new DeviceStore()) {
  const app = Fastify({ logger: true });
  registerApiRoutes(app, store);

  app.get<{ Params: { deviceId: string } }>("/devices/:deviceId", async (request, reply) => {
    const device = store.getDevice(request.params.deviceId);
    if (!device) {
      return reply.code(404).type("text/html; charset=utf-8").send("<h1>Device not found</h1>");
    }
    return reply.type("text/html; charset=utf-8").send(
      renderDeviceDetail(
        device,
        store.getActionHistory(device.id),
        store.getStorageSnapshot(device.id),
        store.getAppInventorySnapshot(device.id),
      ),
    );
  });

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return renderDashboard(store.listDevices().map(withConnectionStatus));
  });

  app.addHook("onClose", () => store.close());
  return app;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  createControllerServer().listen({ port, host: "0.0.0.0" });
}
