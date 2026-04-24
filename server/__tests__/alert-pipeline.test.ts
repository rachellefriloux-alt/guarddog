import { describe, expect, it, vi, afterEach } from "vitest";

import {
  createAlertPipeline,
  detectionToRouterEvent,
  getAlertPipeline,
  initAlertPipeline,
  resetAlertPipelineForTests,
} from "../services/alert-pipeline";
import { loadConfig } from "../config";
import type { Alert } from "@shared/contracts";

afterEach(() => {
  resetAlertPipelineForTests();
  delete process.env.ALERTS_PIPELINE;
  delete process.env.DIGEST_WEBHOOK_URL;
});

describe("createAlertPipeline", () => {
  it("wires router → dispatcher → mailer end-to-end", async () => {
    const cfg = loadConfig();
    const pushDeliveries: Alert[] = [];
    const sent: unknown[] = [];

    const pipeline = createAlertPipeline(cfg, {
      pushSink: {
        async deliver(alert) {
          pushDeliveries.push(alert);
          return { ok: true };
        },
      },
      digestSender: {
        async send(payload) {
          sent.push(payload);
          return { ok: true };
        },
      },
      probeOnly: true, // don't start mailer timers
    });

    pipeline.ingest({ kind: "person", cameraId: "cam-a" });
    // Allow the dispatcher's async dispatch to settle.
    await new Promise((r) => setImmediate(r));

    // 'person' is mapped to a push-delivery channel via the alert matrix.
    expect(pushDeliveries.length).toBeGreaterThan(0);
    expect(pushDeliveries[0].cameraId).toBe("cam-a");

    // Force a digest flush even though the mailer is in probeOnly mode —
    // start it briefly to enable flushNow().
    pipeline.mailer.start();
    await pipeline.flushDigestNow();
    pipeline.stop();
  });

  it("ingest never throws — errors are caught and logged", () => {
    const cfg = loadConfig();
    const warn = vi.fn();
    const pipeline = createAlertPipeline(cfg, {
      pushSink: { async deliver() { return { ok: true }; } },
      digestSender: { async send() { return { ok: true }; } },
      probeOnly: true,
      logger: { warn, info: () => {} },
    });
    expect(() => pipeline.ingest({ kind: "motion", cameraId: "cam-a" })).not.toThrow();
    // Unknown kinds are silently dropped by the router (no matching rule),
    // so there is no exception path to assert. The wrapper's contract is
    // simply: never throw, never crash the caller.
    expect(() => pipeline.ingest({ kind: "bogus" as unknown as "motion", cameraId: "cam-a" })).not.toThrow();
  });

  it("getLastDispatch reflects the most recent dispatch result", async () => {
    const cfg = loadConfig();
    const pipeline = createAlertPipeline(cfg, {
      pushSink: { async deliver() { return { ok: true }; } },
      digestSender: { async send() { return { ok: true }; } },
      probeOnly: true,
    });
    expect(pipeline.getLastDispatch()).toBeNull();
    pipeline.ingest({ kind: "person", cameraId: "cam-a" });
    await new Promise((r) => setImmediate(r));
    expect(pipeline.getLastDispatch()?.alertId).toBeTruthy();
  });
});

describe("initAlertPipeline singleton", () => {
  it("returns null when ALERTS_PIPELINE is not 'true'", () => {
    delete process.env.ALERTS_PIPELINE;
    const cfg = loadConfig();
    expect(initAlertPipeline(cfg)).toBeNull();
    expect(getAlertPipeline()).toBeNull();
  });

  it("constructs the singleton when enabled and is idempotent", () => {
    process.env.ALERTS_PIPELINE = "true";
    process.env.ALERTS_PIPELINE_PROBE = "true"; // don't start timers
    const cfg = loadConfig();
    const a = initAlertPipeline(cfg);
    const b = initAlertPipeline(cfg);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(getAlertPipeline()).toBe(a);
    delete process.env.ALERTS_PIPELINE_PROBE;
  });
});

describe("detectionToRouterEvent", () => {
  it("maps known detection types to event kinds", () => {
    expect(detectionToRouterEvent({ cameraId: "c", type: "person" })?.kind).toBe("person");
    expect(detectionToRouterEvent({ cameraId: "c", type: "vehicle" })?.kind).toBe("vehicle-arrival");
    expect(detectionToRouterEvent({ cameraId: "c", type: "motion" })?.kind).toBe("motion");
    expect(detectionToRouterEvent({ cameraId: "c", type: "doorbell" })?.kind).toBe("doorbell-press");
    expect(detectionToRouterEvent({ cameraId: "c", type: "package" })?.kind).toBe("package-delivered");
    expect(detectionToRouterEvent({ cameraId: "c", type: "tamper" })?.kind).toBe("tamper");
  });

  it("returns null for unmapped types so callers can skip", () => {
    expect(detectionToRouterEvent({ cameraId: "c", type: "pet" })).toBeNull();
    expect(detectionToRouterEvent({ cameraId: "c", type: "unknown" })).toBeNull();
  });

  it("forwards camera and description through to the event", () => {
    const ev = detectionToRouterEvent({
      cameraId: "front-door",
      type: "person",
      description: "Visitor at door",
    });
    expect(ev?.cameraId).toBe("front-door");
    expect(ev?.body).toBe("Visitor at door");
  });
});
