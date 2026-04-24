import { describe, it, expect, beforeEach } from "vitest";

import {
  ringCameraSlug,
  ringCameraId,
  eseeCameraId,
  syncRingCameras,
  syncEseeCameras,
  type RingClientLike,
  type RingDeviceLike,
  type EseeClientLike,
  type EseeCameraLike,
} from "../services/vendor-sync";
import { MemStorage } from "../storage";

describe("vendor-sync helpers", () => {
  it("ringCameraSlug normalises to lowercase snake_case", () => {
    expect(ringCameraSlug("Front Door")).toBe("front_door");
    expect(ringCameraSlug("  Backyard-Cam #2  ")).toBe("backyard_cam_2");
    expect(ringCameraSlug("___")).toBe("front_door"); // empty fallback
    expect(ringCameraSlug("")).toBe("front_door");
  });

  it("vendor IDs are deterministic and namespaced", () => {
    expect(ringCameraId("12345")).toBe("ring_12345");
    expect(eseeCameraId("esee_192_168_1_42_80")).toBe("esee_esee_192_168_1_42_80");
  });
});

describe("syncRingCameras", () => {
  let storage: MemStorage;
  beforeEach(() => {
    storage = new MemStorage();
    // The MemStorage constructor seeds dev-fixture cameras; clear them so
    // the test only sees what sync writes.
    for (const c of (storage as unknown as { cameras: Map<string, unknown> }).cameras.keys()) {
      (storage as unknown as { cameras: Map<string, unknown> }).cameras.delete(c);
    }
  });

  function client(devices: RingDeviceLike[], ready = true): RingClientLike {
    return {
      isConnected: () => ready,
      getDevices: async () => devices,
    };
  }

  it("returns vendorReady=false when Ring is not authenticated", async () => {
    const report = await syncRingCameras(client([], false), storage);
    expect(report.vendorReady).toBe(false);
    expect(report.imported).toEqual([]);
    expect(report.advisory).toMatch(/not connected/i);
    expect(await storage.getCameras()).toHaveLength(0);
  });

  it("imports cameras with deterministic ids and bridge stream URLs", async () => {
    const report = await syncRingCameras(
      client([
        { id: "111", name: "Front Door", location: "Home", isOnline: true, hasLiveStream: true },
        { id: "222", name: "Backyard", location: "Home", isOnline: false, hasLiveStream: true },
      ]),
      storage,
      { ringRtspBaseUrl: "rtsp://10.0.0.5:8554/" },
    );

    expect(report.imported).toEqual(["ring_111", "ring_222"]);
    const cams = await storage.getCameras();
    expect(cams).toHaveLength(2);
    const front = cams.find((c) => c.id === "ring_111")!;
    expect(front.type).toBe("ring");
    expect(front.streamUrl).toBe("rtsp://10.0.0.5:8554/front_door");
    expect(front.ipAddress).toBe("10.0.0.5");
    expect(front.port).toBe("8554");
    expect(front.location).toBe("Home");
  });

  it("skips chimes and other devices that do not have a live stream", async () => {
    const report = await syncRingCameras(
      client([
        { id: "1", name: "Doorbell", hasLiveStream: true },
        { id: "2", name: "Chime", hasLiveStream: false },
      ]),
      storage,
    );
    expect(report.imported).toEqual(["ring_1"]);
    expect(report.skipped).toEqual([{ id: "2", reason: expect.stringMatching(/no live stream/i) }]);
  });

  it("is idempotent: re-running updates existing rows in place", async () => {
    await syncRingCameras(
      client([{ id: "1", name: "Front Door", hasLiveStream: true, isOnline: true }]),
      storage,
      { ringRtspBaseUrl: "rtsp://1.1.1.1:8554" },
    );
    const before = (await storage.getCameras())[0];

    // Operator turned the camera off in the user toggle.
    await storage.updateCamera(before.id, { isRecording: false });

    // Run again with a renamed device and a different bridge.
    const report = await syncRingCameras(
      client([{ id: "1", name: "Front Door 2", hasLiveStream: true, isOnline: true }]),
      storage,
      { ringRtspBaseUrl: "rtsp://2.2.2.2:8554" },
    );

    expect(report.imported).toEqual(["ring_1"]);
    const after = (await storage.getCameras())[0];
    expect(after.id).toBe(before.id); // same row
    expect(after.createdAt).toEqual(before.createdAt); // not churned
    expect(after.name).toBe("Front Door 2"); // vendor field updated
    expect(after.streamUrl).toBe("rtsp://2.2.2.2:8554/front_door_2");
    // CRITICAL: vendor sync did not silently flip user setting back to default.
    expect(after.isRecording).toBe(false);
  });

  it("surfaces an advisory when no Ring bridge URL is configured", async () => {
    const prev = process.env.RING_RTSP_BASE_URL;
    delete process.env.RING_RTSP_BASE_URL;
    try {
      const report = await syncRingCameras(
        client([{ id: "1", name: "Doorbell", hasLiveStream: true }]),
        storage,
      );
      expect(report.advisory).toMatch(/RING_RTSP_BASE_URL/);
    } finally {
      if (prev !== undefined) process.env.RING_RTSP_BASE_URL = prev;
    }
  });
});

describe("syncEseeCameras", () => {
  let storage: MemStorage;
  beforeEach(() => {
    storage = new MemStorage();
    for (const c of (storage as unknown as { cameras: Map<string, unknown> }).cameras.keys()) {
      (storage as unknown as { cameras: Map<string, unknown> }).cameras.delete(c);
    }
  });

  function client(cameras: EseeCameraLike[], connected = true): EseeClientLike {
    return {
      isConnected: () => connected,
      getCameras: async () => cameras,
    };
  }

  it("returns vendorReady=false when no eSee cameras are configured", async () => {
    const report = await syncEseeCameras(client([], false), storage);
    expect(report.vendorReady).toBe(false);
    expect(report.imported).toEqual([]);
    expect(report.advisory).toMatch(/Add one/i);
  });

  it("uses the first enabled RTSP channel as streamUrl and copies credentials", async () => {
    const report = await syncEseeCameras(
      client([
        {
          id: "esee_192_168_1_42_80",
          name: "Garage",
          ip: "192.168.1.42",
          port: 80,
          username: "admin",
          password: "p@ss",
          status: "online",
          channels: [
            { rtspUrl: "rtsp://admin:p%40ss@192.168.1.42:554/ch0_0.264", enabled: true },
            { rtspUrl: "rtsp://admin:p%40ss@192.168.1.42:554/ch0_1.264", enabled: true },
          ],
        },
      ]),
      storage,
    );

    expect(report.imported).toEqual(["esee_esee_192_168_1_42_80"]);
    const cam = (await storage.getCameras())[0];
    expect(cam.type).toBe("esee");
    expect(cam.streamUrl).toBe("rtsp://admin:p%40ss@192.168.1.42:554/ch0_0.264");
    expect(cam.username).toBe("admin");
    expect(cam.password).toBe("p@ss");
    expect(cam.isOnline).toBe(true);
  });

  it("skips eSee cameras that have no usable channel", async () => {
    const report = await syncEseeCameras(
      client([
        {
          id: "broken",
          name: "broken",
          ip: "x",
          port: 0,
          username: "u",
          password: "p",
          channels: [{ rtspUrl: "", enabled: true }],
        },
      ]),
      storage,
    );
    expect(report.imported).toEqual([]);
    expect(report.skipped).toEqual([{ id: "broken", reason: expect.stringMatching(/no usable/i) }]);
  });
});

describe("MemStorage.upsertCamera", () => {
  let storage: MemStorage;
  beforeEach(() => {
    storage = new MemStorage();
    for (const c of (storage as unknown as { cameras: Map<string, unknown> }).cameras.keys()) {
      (storage as unknown as { cameras: Map<string, unknown> }).cameras.delete(c);
    }
  });

  it("creates a row with the explicit id when none exists", async () => {
    const cam = await storage.upsertCamera("ring_99", {
      type: "ring",
      name: "Doorbell",
      ipAddress: "127.0.0.1",
      streamUrl: "rtsp://127.0.0.1:8554/doorbell",
      location: "front",
    });
    expect(cam.id).toBe("ring_99");
    expect(cam.createdAt).toBeInstanceOf(Date);
    expect((await storage.getCamera("ring_99"))?.name).toBe("Doorbell");
  });

  it("preserves user toggles on update", async () => {
    await storage.upsertCamera("esee_1", {
      type: "esee",
      name: "Cam 1",
      ipAddress: "10.0.0.1",
      streamUrl: "rtsp://10.0.0.1/x",
      location: "back",
      isRecording: true,
    });
    await storage.updateCamera("esee_1", { isRecording: false, aiDetectionEnabled: false });
    await storage.upsertCamera("esee_1", {
      type: "esee",
      name: "Cam 1 renamed",
      ipAddress: "10.0.0.2",
      streamUrl: "rtsp://10.0.0.2/x",
      location: "back",
    });
    const cam = (await storage.getCamera("esee_1"))!;
    expect(cam.name).toBe("Cam 1 renamed");
    expect(cam.ipAddress).toBe("10.0.0.2");
    expect(cam.isRecording).toBe(false);
    expect(cam.aiDetectionEnabled).toBe(false);
  });
});
