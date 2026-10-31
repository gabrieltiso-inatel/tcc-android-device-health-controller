import assert from "node:assert/strict";
import test from "node:test";
import type { Device, FileInventorySnapshot } from "../src/domain.js";
import { renderDeviceDetail } from "../src/web-renderer.js";

const device: Device = {
  id: "device", deviceName: "Phone", manufacturer: "Google", model: "Pixel", androidVersion: "14", apiLevel: 34,
  agentVersion: "0.1", capabilities: ["collectTelemetry", "collectStorageSummary", "collectAppInventory", "collectFileInventory", "removeFile", "removeApplication"],
  batteryPercentage: 80, isCharging: false, capturedAt: "2026-10-31T12:00:00Z", lastSeenAt: "2026-10-31T12:00:00Z",
};

test("escapes inventory labels and exposes removal only for removable files", () => {
  const inventory: FileInventorySnapshot = {
    capturedAt: device.capturedAt, receivedAt: device.capturedAt,
    sources: [{ sourceId: "opaque-source", label: "Downloads", kind: "selected_folder", authorization: "available" }],
    files: [
      { fileId: "removable", sourceId: "opaque-source", name: '<img src=x onerror="alert(1)">', kind: "document", sizeBytes: 10, canRemove: true, revision: "rev" },
      { fileId: "read-only", sourceId: "opaque-source", name: "Photo.jpg", kind: "image", sizeBytes: 20, canRemove: false, revision: "rev" },
    ],
  };
  const html = renderDeviceDetail(device, [], undefined, undefined, inventory);
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /data-action="removeFile" data-target="removable"/);
  assert.ok(!html.includes('data-target="read-only"'));
  assert.match(html, /Downloads/);
  assert.ok(!html.includes(">opaque-source<"));
});

test("keeps existing removals disabled while awaiting approval and offers the whole file inventory", () => {
  const files = Array.from({ length: 25 }, (_,index) => ({ fileId: `file-${index}`, sourceId: "source", name: `File ${index}`, kind: "document" as const, sizeBytes: index, canRemove: true, revision: "rev" }));
  const html = renderDeviceDetail(device, [{
    id: "action", deviceId: device.id, type: "removeFile", payload: { fileId: "file-0", expectedRevision: "rev" },
    origin: "controller", status: "awaiting_approval", requestedAt: device.capturedAt, attemptCount: 1,
  }], undefined, undefined, { capturedAt: device.capturedAt, receivedAt: device.capturedAt, sources: [], files });
  assert.match(html, /data-target="file-0"[^>]+ disabled>Awaiting approval/);
  assert.match(html, /File 24/);
  assert.match(html, /data-status-filter/);
});
