import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bootstrapCameraSupervisor,
  getCameraSupervisor,
  resetCameraSupervisorForTests,
  setCameraSupervisor,
} from "../adapters/supervisor-bootstrap";
import type { CameraAdapter } from "../adapters/camera-adapter";
import type { Camera } from "@shared/schema";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function camera(overrides: Partial<Camera> = {}): Camera {
  return {
    id: "cam-1",
    name: "Front",
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

/** Minimal `StreamSupervisor` stand-in — we only assert register/unregister + event listener wiring. */
class FakeSupervisor extends EventEmitter {
  registered: string[] = [];
  unregistered: string[] = [];
  registerThrowsFor: string | null = null;

  register(adapter: CameraAdapter): void {
    if (this.registerThrowsFor === adapter.cameraId) {
      throw new Error("simulated register failure");
    }
    this.registered.push(adapter.cameraId);
  }
  unregister(cameraId: string): void {
    this.unregistered.push(cameraId);
  }
}

/** Minimal `AlertRouter` stand-in — captures every ingested event. */
class FakeRouter {
  ingested: Array<{ kind: string; cameraId?: string; body?: string }> = [];
  ingest(event: { kind: string; cameraId?: string; body?: string }): void {
    this.ingested.push(event);
  }
}

function fakeAdapter(id: string): CameraAdapter {
  return {
    cameraId: id,
    source: "generic",
    capabilities: {
      twoWayAudio: false,
      ptz: false,
      doorbell: false,
      motionEvents: false,
      nightVision: false,
      substream: false,
      snapshot: true,
    },
    connect: async () => {},
    describe: async () => ({
      id,
      name: id,
      source: "generic",
      location: "x",
      capabilities: {
        twoWayAudio: false,
        ptz: false,
        doorbell: false,
        motionEvents: false,
        nightVision: false,
        substream: false,
        snapshot: true,
      },
      streams: [],
    }),
    getStream: async () => ({
      id: `${id}:main`,
      cameraId: id,
      quality: "main",
      protocol: "rtsp",
      url: "rtsp://x/y",
    }),
    subscribeEvents: () => new EventEmitter(),
    health: async () => ({
      cameraId: id,
      state: "online",
      lastSeenAt: null,
      reconnectAttempts: 0,
    }),
    reconnect: async () => {},
    dispose: async () => {},
  };
}

// ---------------------------------------------------------------------------
// bootstrapCameraSupervisor
// ---------------------------------------------------------------------------

describe("bootstrapCameraSupervisor", () => {
  it("registers every adapter the factory returns and reports the IDs", async () => {
    const supervisor = new FakeSupervisor();
    const store = { getCameras: async () => [camera({ id: "a" }), camera({ id: "b" })] };
    const buildAdapter = vi.fn((c: Camera) => fakeAdapter(c.id));

    const result = await bootstrapCameraSupervisor({
      store,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supervisor: supervisor as any,
      buildAdapter,
      log: vi.fn(),
    });

    expect(result.registered.sort()).toEqual(["a", "b"]);
    expect(result.skipped).toEqual([]);
    expect(supervisor.registered.sort()).toEqual(["a", "b"]);
    expect(buildAdapter).toHaveBeenCalledTimes(2);
  });

  it("forwards adapterOptions to the per-row factory", async () => {
    const supervisor = new FakeSupervisor();
    const buildAdapter = vi.fn((c: Camera) => fakeAdapter(c.id));
    const adapterOptions = { env: { RING_RTSP_BASE_URL: "rtsp://x:1" }, warn: vi.fn() };

    await bootstrapCameraSupervisor({
      store: { getCameras: async () => [camera()] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supervisor: supervisor as any,
      buildAdapter,
      adapterOptions,
      log: vi.fn(),
    });

    expect(buildAdapter).toHaveBeenCalledWith(expect.objectContaining({ id: "cam-1" }), adapterOptions);
  });

  it("skips rows when the factory returns null and continues with the rest", async () => {
    const supervisor = new FakeSupervisor();
    const buildAdapter = vi.fn((c: Camera) => (c.id === "bad" ? null : fakeAdapter(c.id)));

    const result = await bootstrapCameraSupervisor({
      store: { getCameras: async () => [camera({ id: "ok" }), camera({ id: "bad" })] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supervisor: supervisor as any,
      buildAdapter,
      log: vi.fn(),
    });

    expect(result.registered).toEqual(["ok"]);
    expect(result.skipped).toEqual(["bad"]);
    expect(supervisor.registered).toEqual(["ok"]);
  });

  it("catches factory exceptions, logs via warn, and continues", async () => {
    const supervisor = new FakeSupervisor();
    const warn = vi.fn();
    const buildAdapter = (c: Camera) => {
      if (c.id === "boom") throw new Error("factory exploded");
      return fakeAdapter(c.id);
    };

    const result = await bootstrapCameraSupervisor({
      store: { getCameras: async () => [camera({ id: "ok" }), camera({ id: "boom" })] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supervisor: supervisor as any,
      buildAdapter,
      warn,
      log: vi.fn(),
    });

    expect(result.registered).toEqual(["ok"]);
    expect(result.skipped).toEqual(["boom"]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/factory exploded/));
  });

  it("catches supervisor.register exceptions, logs via warn, and continues", async () => {
    const supervisor = new FakeSupervisor();
    supervisor.registerThrowsFor = "bad";
    const warn = vi.fn();

    const result = await bootstrapCameraSupervisor({
      store: { getCameras: async () => [camera({ id: "ok" }), camera({ id: "bad" })] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supervisor: supervisor as any,
      buildAdapter: (c) => fakeAdapter(c.id),
      warn,
      log: vi.fn(),
    });

    expect(result.registered).toEqual(["ok"]);
    expect(result.skipped).toEqual(["bad"]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/failed to register: simulated register failure/));
  });

  it("wires supervisor lifecycle events into the router when one is supplied", async () => {
    const supervisor = new FakeSupervisor();
    const router = new FakeRouter();

    await bootstrapCameraSupervisor({
      store: { getCameras: async () => [camera({ id: "a" })] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supervisor: supervisor as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router: router as any,
      buildAdapter: (c) => fakeAdapter(c.id),
      log: vi.fn(),
    });

    supervisor.emit("camera.offline", "a", "boom");
    supervisor.emit("camera.online", "a");

    expect(router.ingested).toHaveLength(2);
    expect(router.ingested[0]).toMatchObject({ kind: "camera-offline", cameraId: "a", body: "boom" });
    expect(router.ingested[1]).toMatchObject({ kind: "camera-online", cameraId: "a" });
  });

  it("does not wire the router when one isn't supplied (and no leak)", async () => {
    const supervisor = new FakeSupervisor();

    await bootstrapCameraSupervisor({
      store: { getCameras: async () => [camera({ id: "a" })] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supervisor: supervisor as any,
      buildAdapter: (c) => fakeAdapter(c.id),
      log: vi.fn(),
    });

    expect(supervisor.listenerCount("camera.offline")).toBe(0);
    expect(supervisor.listenerCount("camera.online")).toBe(0);
  });

  it("dispose() unregisters every registered camera and detaches the router", async () => {
    const supervisor = new FakeSupervisor();
    const router = new FakeRouter();

    const result = await bootstrapCameraSupervisor({
      store: { getCameras: async () => [camera({ id: "a" }), camera({ id: "b" })] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supervisor: supervisor as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router: router as any,
      buildAdapter: (c) => fakeAdapter(c.id),
      log: vi.fn(),
    });

    expect(supervisor.listenerCount("camera.offline")).toBe(1);
    result.dispose();
    expect(supervisor.unregistered.sort()).toEqual(["a", "b"]);
    expect(supervisor.listenerCount("camera.offline")).toBe(0);
    expect(supervisor.listenerCount("camera.online")).toBe(0);

    // Idempotent — second call must not double-unregister.
    result.dispose();
    expect(supervisor.unregistered.sort()).toEqual(["a", "b"]);
  });

  it("propagates store.getCameras() rejections (caller decides what to do)", async () => {
    const supervisor = new FakeSupervisor();
    await expect(
      bootstrapCameraSupervisor({
        store: {
          getCameras: async () => {
            throw new Error("db down");
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supervisor: supervisor as any,
        log: vi.fn(),
      }),
    ).rejects.toThrow(/db down/);
  });

  it("returns empty result and still logs when there are no cameras", async () => {
    const supervisor = new FakeSupervisor();
    const log = vi.fn();
    const result = await bootstrapCameraSupervisor({
      store: { getCameras: async () => [] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supervisor: supervisor as any,
      log,
    });
    expect(result.registered).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(supervisor.registered).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/registered=0 skipped=0/));
  });
});

// ---------------------------------------------------------------------------
// Singleton accessor (setCameraSupervisor / getCameraSupervisor)
// ---------------------------------------------------------------------------

describe("camera supervisor singleton", () => {
  afterEach(() => resetCameraSupervisorForTests());

  it("returns null before any registration", () => {
    expect(getCameraSupervisor()).toBeNull();
  });

  it("returns the registered instance after setCameraSupervisor", () => {
    const sup = new FakeSupervisor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCameraSupervisor(sup as any);
    expect(getCameraSupervisor()).toBe(sup);
  });

  it("first-call-wins: ignores subsequent non-null registrations", () => {
    const a = new FakeSupervisor();
    const b = new FakeSupervisor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCameraSupervisor(a as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCameraSupervisor(b as any);
    expect(getCameraSupervisor()).toBe(a);
  });

  it("setCameraSupervisor(null) clears the singleton (test escape hatch)", () => {
    const sup = new FakeSupervisor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCameraSupervisor(sup as any);
    setCameraSupervisor(null);
    expect(getCameraSupervisor()).toBeNull();
  });

  it("resetCameraSupervisorForTests clears the singleton", () => {
    const sup = new FakeSupervisor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCameraSupervisor(sup as any);
    resetCameraSupervisorForTests();
    expect(getCameraSupervisor()).toBeNull();
  });
});
