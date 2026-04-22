import { describe, expect, it, vi } from "vitest";

import {
  cameraAdapterFromCamera,
  cameraAdaptersFromCameras,
  toRingCameraPath,
} from "../adapters/from-camera";
import type { Camera } from "@shared/schema";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function camera(overrides: Partial<Camera> = {}): Camera {
  // Drizzle's `Camera` row type — fully populate so the factory has every
  // field it needs. Tests override the fields they care about.
  return {
    id: "cam-1",
    name: "Front Door",
    type: "generic",
    ipAddress: "10.0.0.50",
    port: "554",
    streamUrl: "",
    username: null,
    password: null,
    location: "front_door",
    resolution: "1080p",
    isOnline: true,
    wifiStrength: 100,
    aiDetectionEnabled: true,
    detectPeople: true,
    detectPets: true,
    detectVehicles: false,
    isRecording: true,
    createdAt: new Date(),
    ...overrides,
  } as Camera;
}

// ---------------------------------------------------------------------------
// toRingCameraPath
// ---------------------------------------------------------------------------

describe("toRingCameraPath", () => {
  it("normalises mixed case + punctuation to underscores", () => {
    expect(toRingCameraPath("Front Door")).toBe("front_door");
    expect(toRingCameraPath("  Side-Yard 02!  ")).toBe("side_yard_02");
  });
  it("falls back to a sane default for empty/garbage names", () => {
    expect(toRingCameraPath("   ")).toBe("front_door");
    expect(toRingCameraPath("!!!")).toBe("front_door");
  });
});

// ---------------------------------------------------------------------------
// cameraAdapterFromCamera
// ---------------------------------------------------------------------------

describe("cameraAdapterFromCamera", () => {
  it("builds a generic adapter from ipAddress when streamUrl is blank", async () => {
    const adapter = cameraAdapterFromCamera(camera({ username: "u", password: "p@1" }), {
      env: {},
      warn: vi.fn(),
    });
    expect(adapter).not.toBeNull();
    const main = await adapter!.getStream("main");
    // Credentials must be percent-encoded so an `@` in the password doesn't
    // corrupt the authority section of the URL.
    expect(main.url).toBe("rtsp://u:p%401@10.0.0.50:554/live");
    expect(main.protocol).toBe("rtsp");
  });

  it("uses the explicit streamUrl when it's an rtsp:// URL", async () => {
    const adapter = cameraAdapterFromCamera(
      camera({ streamUrl: "rtsp://10.0.0.99/custom" }),
      { env: {}, warn: vi.fn() },
    );
    const main = await adapter!.getStream("main");
    expect(main.url).toBe("rtsp://10.0.0.99/custom");
  });

  it("uses the eSeeCloud channel path when type=esee", async () => {
    const adapter = cameraAdapterFromCamera(
      camera({ type: "esee", username: "admin", password: "x" }),
      { env: {}, warn: vi.fn() },
    );
    const main = await adapter!.getStream("main");
    expect(main.url).toBe("rtsp://admin:x@10.0.0.50:554/cam/realmonitor?channel=1&subtype=0");
    expect((await adapter!.describe()).source).toBe("esee");
  });

  it("builds the Ring URL from RING_RTSP_BASE_URL + slug", async () => {
    const adapter = cameraAdapterFromCamera(
      camera({ type: "ring", name: "Side Yard" }),
      { env: { RING_RTSP_BASE_URL: "rtsp://192.168.1.10:8554/" }, warn: vi.fn() },
    );
    const main = await adapter!.getStream("main");
    expect(main.url).toBe("rtsp://192.168.1.10:8554/side_yard");
    expect((await adapter!.describe()).capabilities.doorbell).toBe(true);
  });

  it("RING_RTSP_URL fully overrides the computed Ring URL", async () => {
    const adapter = cameraAdapterFromCamera(
      camera({ type: "ring", name: "Side Yard" }),
      {
        env: {
          RING_RTSP_BASE_URL: "rtsp://ignored:1234",
          RING_RTSP_URL: "rtsp://override/exact",
        },
        warn: vi.fn(),
      },
    );
    const main = await adapter!.getStream("main");
    expect(main.url).toBe("rtsp://override/exact");
  });

  it("defaults Ring base URL to the local Ring-MQTT bridge", async () => {
    const adapter = cameraAdapterFromCamera(
      camera({ type: "ring", name: "Front Door" }),
      { env: {}, warn: vi.fn() },
    );
    const main = await adapter!.getStream("main");
    expect(main.url).toBe("rtsp://127.0.0.1:8554/front_door");
  });

  it("translates well-known resolution strings to width/height", async () => {
    for (const [resolution, expected] of [
      ["4k", { width: 3840, height: 2160 }],
      ["1440p", { width: 2560, height: 1440 }],
      ["1080p", { width: 1920, height: 1080 }],
      ["720p", { width: 1280, height: 720 }],
      ["480p", { width: 854, height: 480 }],
    ] as const) {
      const a = cameraAdapterFromCamera(camera({ resolution }), { env: {}, warn: vi.fn() });
      const m = await a!.getStream("main");
      expect({ width: m.width, height: m.height }).toEqual(expected);
    }
  });

  it("leaves width/height undefined for unknown resolution strings", async () => {
    const a = cameraAdapterFromCamera(camera({ resolution: "potato" }), {
      env: {},
      warn: vi.fn(),
    });
    const m = await a!.getStream("main");
    expect(m.width).toBeUndefined();
    expect(m.height).toBeUndefined();
  });

  it("returns null and warns when ipAddress is missing AND streamUrl is unusable", () => {
    const warn = vi.fn();
    const a = cameraAdapterFromCamera(
      camera({ ipAddress: "", streamUrl: "http://not-rtsp/" }),
      { env: {}, warn },
    );
    expect(a).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/no rtsp streamUrl and no ipAddress/));
  });

  it("returns null and warns when GenericRtspAdapter rejects the URL", () => {
    const warn = vi.fn();
    const a = cameraAdapterFromCamera(
      camera({ streamUrl: "rtsp://bad:99999/x", ipAddress: "" }),
      { env: {}, warn },
    );
    expect(a).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("skipping camera cam-1"));
  });

  it("warns and downgrades to generic for unknown camera types", async () => {
    const warn = vi.fn();
    const a = cameraAdapterFromCamera(camera({ type: "weird" }), { env: {}, warn });
    expect((await a!.describe()).source).toBe("generic");
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/unknown camera\.type/));
  });

  it("flags motionEvents capability from aiDetectionEnabled", async () => {
    const on = cameraAdapterFromCamera(camera({ aiDetectionEnabled: true }), {
      env: {},
      warn: vi.fn(),
    });
    const off = cameraAdapterFromCamera(camera({ aiDetectionEnabled: false }), {
      env: {},
      warn: vi.fn(),
    });
    expect((await on!.describe()).capabilities.motionEvents).toBe(true);
    expect((await off!.describe()).capabilities.motionEvents).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cameraAdaptersFromCameras (bulk)
// ---------------------------------------------------------------------------

describe("cameraAdaptersFromCameras", () => {
  it("drops invalid rows but keeps the rest", () => {
    const warn = vi.fn();
    const list = cameraAdaptersFromCameras(
      [
        camera({ id: "ok-1" }),
        camera({ id: "bad", ipAddress: "", streamUrl: "" }),
        camera({ id: "ok-2", type: "ring", name: "Back" }),
      ],
      { env: {}, warn },
    );
    expect(list.map((a) => a.cameraId).sort()).toEqual(["ok-1", "ok-2"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array for an empty input", () => {
    expect(cameraAdaptersFromCameras([], { env: {}, warn: vi.fn() })).toEqual([]);
  });
});
