import assert from "node:assert/strict";
import test from "node:test";
import { DeviceStore } from "../src/device-store.js";

test("stores the latest file inventory as a separate snapshot", () => {
  const store = new DeviceStore(":memory:");
  const device = store.receiveTelemetry("device-1", {
    deviceName: "Pixel",
    manufacturer: "Google",
    model: "Pixel 8",
    androidVersion: "14",
    apiLevel: 34,
    agentVersion: "0.1.0",
    capabilities: ["collectFileInventory", "removeFile"],
    batteryPercentage: 80,
    isCharging: true,
    capturedAt: "2026-09-27T12:00:00.000Z",
  });
  const action = store.createAction(device.id, "collectFileInventory", "controller");
  assert.ok(action);
  store.completeAction(action.id, true, "File inventory collected", undefined, {
    capturedAt: "2026-09-27T12:01:00.000Z",
    sources: [{ sourceId: "media-images", label: "Images", kind: "media", authorization: "available", itemCount: 1 }],
    files: [{
      fileId: "opaque-file-id",
      sourceId: "media-images",
      name: "photo.jpg",
      kind: "image",
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      modifiedAt: "2026-09-27T11:00:00.000Z",
      displayPath: "photo.jpg",
      canRemove: true,
      revision: "opaque-revision",
    }],
  });

  const snapshot = store.getFileInventorySnapshot(device.id);
  assert.equal(snapshot?.files[0]?.fileId, "opaque-file-id");
  assert.equal(snapshot?.files[0]?.sizeBytes, 2048);
  assert.equal(store.getActionHistory(device.id)[0]?.type, "collectFileInventory");
  const removal = store.createAction(device.id, "removeFile", "controller", {
    fileId: "opaque-file-id",
    expectedRevision: "opaque-revision",
  });
  assert.deepEqual(removal?.payload, { fileId: "opaque-file-id", expectedRevision: "opaque-revision" });
  store.close();
});
