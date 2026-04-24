import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import {
  isCameraAdapter,
  type CameraAdapter,
} from "../adapters/camera-adapter";
import {
  cameraContractSchema,
  cameraHealthSchema,
  pushEnvelopeSchema,
  retentionPolicySchema,
  segmentSchema,
} from "../../shared/contracts";

class StubAdapter implements CameraAdapter {
  readonly cameraId = "cam-1";
  readonly source = "esee" as const;
  readonly capabilities = {
    twoWayAudio: true,
    ptz: false,
    doorbell: false,
    motionEvents: true,
    nightVision: true,
    substream: true,
    snapshot: true,
  };
  private readonly events = new EventEmitter();
  async connect() {}
  async describe() {
    return {
      id: this.cameraId,
      name: "Front Door",
      source: this.source,
      location: "front",
      capabilities: this.capabilities,
      streams: [],
    };
  }
  async getStream() {
    return {
      id: "s-1",
      cameraId: this.cameraId,
      quality: "sub" as const,
      protocol: "rtsp" as const,
      url: "rtsp://127.0.0.1/stream",
    };
  }
  subscribeEvents() {
    return this.events;
  }
  async health() {
    return {
      cameraId: this.cameraId,
      state: "online" as const,
      lastSeenAt: new Date().toISOString(),
      reconnectAttempts: 0,
    };
  }
  async reconnect() {}
  async dispose() {}
}

describe("CameraAdapter contract", () => {
  it("isCameraAdapter accepts a fully implemented adapter", () => {
    expect(isCameraAdapter(new StubAdapter())).toBe(true);
  });

  it("isCameraAdapter rejects partial implementations", () => {
    expect(isCameraAdapter({})).toBe(false);
    expect(isCameraAdapter(null)).toBe(false);
    expect(isCameraAdapter({ cameraId: "x" })).toBe(false);
  });

  it("describe() and health() emit shapes that match the canonical schemas", async () => {
    const a = new StubAdapter();
    const desc = await a.describe();
    expect(() => cameraContractSchema.parse(desc)).not.toThrow();
    const h = await a.health();
    expect(() => cameraHealthSchema.parse(h)).not.toThrow();
  });
});

describe("canonical contracts", () => {
  it("retentionPolicySchema applies the confirmed defaults", () => {
    const policy = retentionPolicySchema.parse({});
    expect(policy.fullFootageDays).toBe(200);
    expect(policy.motionClipDays).toBe(180);
    expect(policy.storageUrgentPct).toBe(10);
    expect(policy.storageWarnPct).toBe(25);
  });

  it("segmentSchema requires positive duration and non-negative size", () => {
    expect(() =>
      segmentSchema.parse({
        id: "seg-1",
        cameraId: "cam-1",
        kind: "continuous",
        path: "/data/seg-1.mp4",
        startedAt: "2026-04-22T01:00:00.000Z",
        endedAt: "2026-04-22T01:10:00.000Z",
        durationSec: 600,
        sizeBytes: 1234,
      }),
    ).not.toThrow();
    expect(() =>
      segmentSchema.parse({
        id: "seg-1",
        cameraId: "cam-1",
        kind: "continuous",
        path: "/data/seg-1.mp4",
        startedAt: "2026-04-22T01:00:00.000Z",
        endedAt: "2026-04-22T01:10:00.000Z",
        durationSec: -1,
        sizeBytes: 1234,
      }),
    ).toThrow();
  });

  it("pushEnvelopeSchema is v1 and round-trips a typical urgent payload", () => {
    const env = pushEnvelopeSchema.parse({
      v: 1,
      id: "alert-1",
      urgency: "urgent",
      title: "Doorbell",
      body: "Front door doorbell pressed",
      cameraId: "cam-1",
      eventId: "evt-1",
      issuedAt: "2026-04-22T01:00:00.000Z",
      critical: true,
    });
    expect(env.v).toBe(1);
    expect(env.urgency).toBe("urgent");
  });
});
