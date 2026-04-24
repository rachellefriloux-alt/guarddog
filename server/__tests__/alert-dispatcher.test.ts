import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { AlertRouter } from "../services/alert-router";
import {
  AlertDispatcher,
  createNotificationServicePushSink,
  wireSupervisorToRouter,
  type PushSink,
} from "../services/alert-dispatcher";
import type { Alert } from "../../shared/contracts";

function makeRouter(localHHMM = "12:00"): AlertRouter {
  let id = 0;
  return new AlertRouter({
    now: () => 1_700_000_000_000,
    generateId: () => `alert-${++id}`,
    localClock: () => localHHMM,
  });
}

describe("AlertDispatcher", () => {
  it("delivers urgent alerts to the push sink", async () => {
    const deliver = vi.fn(async () => ({ ok: true }));
    const sink: PushSink = { deliver };
    const router = makeRouter();
    const dispatcher = new AlertDispatcher({ pushSink: sink });
    const dispatched: unknown[] = [];
    dispatcher.on("dispatched", (r) => dispatched.push(r));
    dispatcher.attach(router);

    router.ingest({ kind: "doorbell-press", cameraId: "cam-front" });
    // Allow the queued microtask in `attach` to run.
    await new Promise((r) => setImmediate(r));

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(dispatched).toHaveLength(1);
  });

  it("queues non-urgent alerts into the digest buffer instead of pushing", async () => {
    const deliver = vi.fn(async () => ({ ok: true }));
    const router = makeRouter();
    const dispatcher = new AlertDispatcher({ pushSink: { deliver } });
    dispatcher.attach(router);

    router.ingest({ kind: "motion", cameraId: "cam-back" });
    await new Promise((r) => setImmediate(r));

    expect(deliver).not.toHaveBeenCalled();
    const snap = dispatcher.getDigestSnapshot();
    expect(snap.total).toBe(1);
    expect(snap.byCamera["cam-back"]).toHaveLength(1);
  });

  it("drainDigest empties the buffer and returns chronological order", async () => {
    const router = makeRouter();
    const dispatcher = new AlertDispatcher();
    dispatcher.attach(router);

    router.ingest({ kind: "motion", cameraId: "cam-a" });
    router.ingest({ kind: "motion", cameraId: "cam-b" });
    router.ingest({ kind: "system-health" });
    await new Promise((r) => setImmediate(r));

    const drained = dispatcher.drainDigest();
    expect(drained).toHaveLength(3);
    // Monotonic queuedAt
    for (let i = 1; i < drained.length; i++) {
      expect(drained[i].queuedAt).toBeGreaterThanOrEqual(drained[i - 1].queuedAt);
    }
    expect(dispatcher.getDigestSnapshot().total).toBe(0);
  });

  it("emits delivery.error when the push sink throws but does not crash", async () => {
    const sink: PushSink = {
      deliver: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const errors: unknown[] = [];
    const router = makeRouter();
    const dispatcher = new AlertDispatcher({ pushSink: sink });
    dispatcher.on("delivery.error", (e) => errors.push(e));
    dispatcher.attach(router);

    router.ingest({ kind: "doorbell-press", cameraId: "cam-front" });
    await new Promise((r) => setImmediate(r));

    expect(errors).toHaveLength(1);
  });

  it("respects digest capacity by trimming oldest entries", async () => {
    const router = makeRouter();
    const dispatcher = new AlertDispatcher({ digestCapacity: 3 });
    dispatcher.attach(router);

    for (let i = 0; i < 10; i++) {
      router.ingest({ kind: "motion", cameraId: "cam-a" });
    }
    await new Promise((r) => setImmediate(r));

    expect(dispatcher.getDigestSnapshot().byCamera["cam-a"]).toHaveLength(3);
  });

  it("attach returns an unsubscribe function", async () => {
    const deliver = vi.fn(async () => ({ ok: true }));
    const router = makeRouter();
    const dispatcher = new AlertDispatcher({ pushSink: { deliver } });
    const off = dispatcher.attach(router);

    off();
    router.ingest({ kind: "doorbell-press", cameraId: "cam-front" });
    await new Promise((r) => setImmediate(r));

    expect(deliver).not.toHaveBeenCalled();
  });
});

describe("createNotificationServicePushSink", () => {
  it("maps urgent alerts to the 'critical' notification level", async () => {
    const send = vi.fn(async () => [{ ok: true }]);
    const sink = createNotificationServicePushSink({ send });
    const alert: Alert = {
      id: "a-1",
      ruleId: "urgent.doorbell",
      urgency: "urgent",
      title: "Doorbell",
      body: "Front door",
      channels: ["push"],
      cameraId: "cam-front",
      createdAt: new Date().toISOString(),
      suppressed: false,
    };
    const out = await sink.deliver(alert);
    expect(out.ok).toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Doorbell",
        level: "critical",
        meta: expect.objectContaining({ ruleId: "urgent.doorbell" }),
      }),
    );
  });

  it("reports ok=false when no underlying sink succeeded", async () => {
    const send = vi.fn(async () => [{ ok: false }, { ok: false }]);
    const sink = createNotificationServicePushSink({ send });
    const out = await sink.deliver({
      id: "a-2",
      ruleId: "urgent.doorbell",
      urgency: "urgent",
      title: "x",
      body: "y",
      channels: ["push"],
      createdAt: new Date().toISOString(),
      suppressed: false,
    });
    expect(out.ok).toBe(false);
  });
});

describe("wireSupervisorToRouter", () => {
  it("forwards camera.offline / camera.online into the router", () => {
    const supervisor = new EventEmitter() as unknown as Parameters<
      typeof wireSupervisorToRouter
    >[0];
    const router = makeRouter();
    const alerts: Alert[] = [];
    router.on("alert", (a) => alerts.push(a));
    const off = wireSupervisorToRouter(supervisor, router);

    (supervisor as unknown as EventEmitter).emit(
      "camera.offline",
      "cam-front",
      "no rtsp",
    );
    (supervisor as unknown as EventEmitter).emit("camera.online", "cam-front");

    expect(alerts.map((a) => a.ruleId)).toEqual([
      "urgent.camera-offline",
      "digest.camera-recovered",
    ]);

    off();
    (supervisor as unknown as EventEmitter).emit("camera.offline", "cam-front");
    expect(alerts).toHaveLength(2);
  });
});
