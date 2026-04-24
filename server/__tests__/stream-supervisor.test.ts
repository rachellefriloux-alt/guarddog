import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import {
  StreamSupervisor,
  computeBackoffMs,
} from "../adapters/stream-supervisor";
import type { CameraAdapter } from "../adapters/camera-adapter";
import type { CameraHealth, CameraSource } from "../../shared/contracts";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface PendingTimer {
  fn: () => void;
  due: number;
}

/** Deterministic clock + scheduler so we can drive the supervisor synchronously. */
class FakeClock {
  now = 0;
  private nextHandle = 1;
  private readonly timers = new Map<number, PendingTimer>();

  setTimeout = (fn: () => void, ms: number): unknown => {
    const handle = this.nextHandle++;
    this.timers.set(handle, { fn, due: this.now + Math.max(0, ms) });
    return handle;
  };

  clearTimeout = (handle: unknown): void => {
    if (typeof handle === "number") this.timers.delete(handle);
  };

  /** Advance the clock; flush every due timer (in due-time order). */
  async advance(ms: number): Promise<void> {
    const target = this.now + ms;
    const flushMicrotasks = async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    };
    // Settle any in-flight async work scheduled before the call.
    await flushMicrotasks();
    while (true) {
      let nextHandle: number | undefined;
      let nextTimer: PendingTimer | undefined;
      for (const [h, t] of Array.from(this.timers.entries())) {
        if (t.due <= target && (!nextTimer || t.due < nextTimer.due)) {
          nextHandle = h;
          nextTimer = t;
        }
      }
      if (!nextTimer || nextHandle === undefined) {
        // Microtask might have scheduled a new timer just now — re-flush + re-scan once.
        await flushMicrotasks();
        let raceHandle: number | undefined;
        let raceTimer: PendingTimer | undefined;
        for (const [h, t] of Array.from(this.timers.entries())) {
          if (t.due <= target && (!raceTimer || t.due < raceTimer.due)) {
            raceHandle = h;
            raceTimer = t;
          }
        }
        if (!raceTimer || raceHandle === undefined) break;
        nextHandle = raceHandle;
        nextTimer = raceTimer;
      }
      this.timers.delete(nextHandle);
      this.now = nextTimer.due;
      nextTimer.fn();
      await flushMicrotasks();
    }
    this.now = target;
  }
}

class FakeAdapter implements CameraAdapter {
  readonly capabilities = {
    twoWayAudio: false,
    ptz: false,
    doorbell: false,
    motionEvents: true,
    nightVision: false,
    substream: true,
    snapshot: true,
  };
  private readonly events = new EventEmitter();
  /** Sequence of behaviors for connect/reconnect: "ok" or "fail:<reason>". */
  script: Array<"ok" | string> = [];
  /** Sequence for health(): same encoding. Defaults to "ok". */
  healthScript: Array<"ok" | string> = [];
  connectCalls = 0;
  reconnectCalls = 0;
  healthCalls = 0;

  constructor(
    public readonly cameraId: string,
    public readonly source: CameraSource = "esee",
  ) {}

  private nextScripted(stack: Array<"ok" | string>, fallback: "ok" | string): "ok" | string {
    return stack.length > 0 ? stack.shift()! : fallback;
  }

  async connect(): Promise<void> {
    this.connectCalls++;
    const r = this.nextScripted(this.script, "ok");
    if (r !== "ok") throw new Error(r.replace(/^fail:/, "") || "fail");
  }
  async reconnect(): Promise<void> {
    this.reconnectCalls++;
    const r = this.nextScripted(this.script, "ok");
    if (r !== "ok") throw new Error(r.replace(/^fail:/, "") || "fail");
  }
  async describe() {
    return {
      id: this.cameraId,
      name: this.cameraId,
      source: this.source,
      location: "test",
      capabilities: this.capabilities,
      streams: [],
    };
  }
  async getStream() {
    return {
      id: `${this.cameraId}-s`,
      cameraId: this.cameraId,
      quality: "sub" as const,
      protocol: "rtsp" as const,
      url: "rtsp://127.0.0.1/x",
    };
  }
  subscribeEvents() {
    return this.events;
  }
  async health(): Promise<CameraHealth> {
    this.healthCalls++;
    const r = this.nextScripted(this.healthScript, "ok");
    if (r !== "ok") {
      if (r.startsWith("offline:")) {
        return {
          cameraId: this.cameraId,
          state: "offline",
          lastSeenAt: null,
          reconnectAttempts: 0,
          message: r.replace(/^offline:/, ""),
        };
      }
      throw new Error(r.replace(/^fail:/, "") || "fail");
    }
    return {
      cameraId: this.cameraId,
      state: "online",
      lastSeenAt: new Date().toISOString(),
      reconnectAttempts: 0,
    };
  }
  async dispose() {}
}

// ---------------------------------------------------------------------------
// computeBackoffMs
// ---------------------------------------------------------------------------

describe("computeBackoffMs", () => {
  it("never exceeds the cap", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const v = computeBackoffMs(attempt, {
        initialBackoffMs: 1_000,
        maxBackoffMs: 60_000,
        random: () => 0.999,
      });
      expect(v).toBeLessThanOrEqual(60_000);
      expect(v).toBeGreaterThanOrEqual(1);
    }
  });

  it("doubles the ceiling on each attempt until the cap", () => {
    // With random = 1 (clamped to 0.999... in practice we use 0.5 here)
    const lo = computeBackoffMs(0, {
      initialBackoffMs: 1_000,
      maxBackoffMs: 60_000,
      random: () => 0.5,
    });
    const hi = computeBackoffMs(3, {
      initialBackoffMs: 1_000,
      maxBackoffMs: 60_000,
      random: () => 0.5,
    });
    // 0.5 * 1000 = 500 vs 0.5 * 8000 = 4000
    expect(lo).toBe(500);
    expect(hi).toBe(4_000);
  });

  it("guards against giant attempt numbers (no Infinity)", () => {
    const v = computeBackoffMs(1_000_000, {
      initialBackoffMs: 1_000,
      maxBackoffMs: 60_000,
      random: () => 0.5,
    });
    expect(v).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
// StreamSupervisor
// ---------------------------------------------------------------------------

function makeSupervisor(clock: FakeClock, overrides = {}) {
  return new StreamSupervisor({
    initialBackoffMs: 1_000,
    maxBackoffMs: 4_000,
    offlineThresholdMs: 10_000,
    circuitBreakerThreshold: 3,
    healthPollIntervalMs: 5_000,
    now: () => clock.now,
    random: () => 0.5,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    ...overrides,
  });
}

describe("StreamSupervisor", () => {
  it("connects an adapter and emits a healthy snapshot", async () => {
    const clock = new FakeClock();
    const sup = makeSupervisor(clock);
    const adapter = new FakeAdapter("cam-1");
    const healthEvents: CameraHealth[] = [];
    sup.on("camera.health", (h) => healthEvents.push(h));

    sup.register(adapter);
    await Promise.resolve();
    await Promise.resolve();

    expect(adapter.connectCalls).toBe(1);
    expect(sup.list()[0].state).toBe("online");
    expect(healthEvents.at(-1)?.state).toBe("online");
    sup.dispose();
  });

  it("retries with backoff after a failure", async () => {
    const clock = new FakeClock();
    const sup = makeSupervisor(clock);
    const adapter = new FakeAdapter("cam-1");
    adapter.script = ["fail:boom", "ok"];

    sup.register(adapter);
    await Promise.resolve();
    await Promise.resolve();

    expect(adapter.connectCalls).toBe(1);
    expect(sup.list()[0].state).not.toBe("online");

    // Backoff (random=0.5, attempt=1) → floor(0.5 * min(2000, 4000)) = 1000ms
    await clock.advance(1_000);
    expect(adapter.reconnectCalls).toBe(1);
    expect(sup.list()[0].state).toBe("online");
    sup.dispose();
  });

  it("does not emit camera.offline before the threshold elapses", async () => {
    const clock = new FakeClock();
    const sup = makeSupervisor(clock);
    const adapter = new FakeAdapter("cam-1");
    adapter.script = Array(20).fill("fail:nope");
    let offlineEmits = 0;
    sup.on("camera.offline", () => offlineEmits++);

    sup.register(adapter);
    await clock.advance(5_000);
    expect(offlineEmits).toBe(0);
    sup.dispose();
  });

  it("emits camera.offline once after the offline threshold passes", async () => {
    const clock = new FakeClock();
    const sup = makeSupervisor(clock);
    const adapter = new FakeAdapter("cam-1");
    adapter.script = Array(50).fill("fail:nope");
    const offlineEvents: Array<[string, string]> = [];
    sup.on("camera.offline", (id, reason) => offlineEvents.push([id, reason]));

    sup.register(adapter);
    await clock.advance(15_000);
    expect(offlineEvents.length).toBe(1);
    expect(offlineEvents[0][0]).toBe("cam-1");

    await clock.advance(10_000);
    // Still only one — supervisor must dedupe until recovery.
    expect(offlineEvents.length).toBe(1);
    sup.dispose();
  });

  it("emits camera.online when an offline adapter recovers", async () => {
    const clock = new FakeClock();
    const sup = makeSupervisor(clock);
    const adapter = new FakeAdapter("cam-1");
    adapter.script = [...Array(5).fill("fail:nope"), "ok"];
    const onlineEvents: string[] = [];
    sup.on("camera.online", (id) => onlineEvents.push(id));

    sup.register(adapter);
    await clock.advance(60_000);
    expect(onlineEvents).toContain("cam-1");
    expect(sup.list()[0].state).toBe("online");
    sup.dispose();
  });

  it("trips the circuit breaker after the configured failure threshold", async () => {
    const clock = new FakeClock();
    const sup = makeSupervisor(clock);
    const adapter = new FakeAdapter("cam-1");
    adapter.script = Array(100).fill("fail:nope");

    sup.register(adapter);
    await clock.advance(20_000);
    const snap = sup.list()[0];
    expect(snap.failures).toBeGreaterThanOrEqual(3);
    // Once tripped the circuit must end up in either "open" or "half-open"
    // (half-open is the transient state after the cooldown fires).
    expect(["open", "half-open"]).toContain(snap.circuit);
    sup.dispose();
  });

  it("treats health() reporting offline as a failure", async () => {
    const clock = new FakeClock();
    const sup = makeSupervisor(clock);
    const adapter = new FakeAdapter("cam-1");
    adapter.healthScript = ["offline:link down"];

    sup.register(adapter);
    await Promise.resolve();
    await Promise.resolve();
    // Wait one health-poll interval.
    await clock.advance(5_000);
    expect(sup.list()[0].failures).toBeGreaterThanOrEqual(1);
    sup.dispose();
  });

  it("unregister cancels timers and removes the entry", async () => {
    const clock = new FakeClock();
    const sup = makeSupervisor(clock);
    const adapter = new FakeAdapter("cam-1");
    adapter.script = ["fail:x"];
    sup.register(adapter);
    await Promise.resolve();
    await Promise.resolve();
    sup.unregister("cam-1");
    expect(sup.list()).toHaveLength(0);

    // Advance well past the retry — adapter must not be touched again.
    const calls = adapter.reconnectCalls;
    await clock.advance(60_000);
    expect(adapter.reconnectCalls).toBe(calls);
    sup.dispose();
  });

  it("dispose() prevents further work", async () => {
    const clock = new FakeClock();
    const sup = makeSupervisor(clock);
    const adapter = new FakeAdapter("cam-1");
    sup.register(adapter);
    await Promise.resolve();
    sup.dispose();
    const before = adapter.healthCalls;
    await clock.advance(60_000);
    expect(adapter.healthCalls).toBe(before);
  });
});
