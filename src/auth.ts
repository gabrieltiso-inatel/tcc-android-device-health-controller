import type { FastifyReply } from "fastify";
import type { DeviceStore } from "./device-store.js";

export function readBearerToken(authorization: string | undefined): string | undefined {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9._~+\/-]+=*)$/);
  return match?.[1];
}

export function authenticateDeviceRequest(
  authorization: string | undefined,
  deviceId: string,
  store: DeviceStore,
): boolean {
  const token = readBearerToken(authorization);
  return token ? store.authenticateDevice(deviceId, token) : false;
}

export function unauthorized(reply: FastifyReply) {
  return reply
    .header("www-authenticate", "Bearer")
    .code(401)
    .send({ message: "Device authentication required" });
}
