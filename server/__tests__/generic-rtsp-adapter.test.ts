import { describe, expect, it, vi } from "vitest";

import {
  GenericRtspAdapter,
  parseRtspHostPort,
  redact,
} from "../adapters/generic-rtsp-adapter";
import type { CameraHealth } from "@shared/contracts";

// ---------------------------------------------------------------------------
// parseRtspHostPort / redact
// ---------------------------------------------------------------------------

describe("parseRtspHostPort", () => {
  it("parses host + explicit port", () => {
    expect(parseRtspHostPort("rtsp://10.0.0.1:8554/live")).toEqual({
      host: "10.0.0.1",
      port: 8554,
    });
  });

  it("defaults to port 554 when omitted", () => {
    expect(parseRtspHostPort("rtsp://cam.local/stream")).toEqual({
      host: "cam.local",
      port: 554,
    });
  });

  it("strips userinfo before extracting host:port", () => {
    expect(parseRtspHostPort("rtsp://user:p%40ss@10.0.0.1:1554/x")).toEqual({
      host: "10.0.0.1",
      port: 1554,
    });
  });

  it("supports bracketed IPv6", () => {
    expect(parseRtspHostPort("rtsp://[fe80::1]:1234/x")).toEqual({
      host: "fe80::1",
      port: 1234,
    });
  });

  it("rejects non-rtsp URLs", () => {
    expect(() => parseRtspHostPort("http://10.0.0.1/live")).toThrow(/rtsp/);
  });

  it("rejects invalid ports", () => {
    expect(() => parseRtspHostPort("rtsp://10.0.0.1:abc/x")).toThrow();
    expect(() => parseRtspHostPort("rtsp://10.0.0.1:99999/x")).toThrow();
  });

  it("redact masks credentials", () => {
    expect(redact("rtsp://user:secret@10.0.0.1/x")).toBe("rtsp://***@10.0.0.1/x");
    expect(redact("rtsps://u:p@h/x")).toBe("rtsps://***@h/x");
    expect(redact("rtsp://no-auth/x")).toBe("rtsp://no-auth/x");
  });
});

// ---------------------------------------------------------------------------
// GenericRtspAdapter
// ---------------------------------------------------------------------------

interface ProbeScript {
  ok: () => Promise<void>;
  fail: (msg: string) => Promise<void>;
}

function buildAdapter(probeImpl: (host: string, port: number, timeoutMs: number) => Promise<void>) {
  const events: Array<[string, ...unknown[]]> = [];
  const adapter = new GenericRtspAdapter({
    cameraId: "front",
    name: "Front door",
    location: "front_door",
    streams: {
      main: { url: "rtsp://user:pw@10.0.0.10:554/main", width: 1920, height: 1080 },
      sub: { url: "rtsp://user:pw@10.0.0.10:554/sub", width: 640, height: 360 },
    },
    capabilities: { ptz: true, motionEvents: true },
    probeTimeoutMs: 250,
    offlineAfterConsecutiveFailures: 2,
    now: () => 1_700_000_000_000,
    probe: probeImpl,
  });
  const ev = adapter.subscribeEvents();
  for (const name of ["camera.online", "camera.offline", "camera.health"] as const) {
    ev.on(name, (...args: unknown[]) => events.push([name, ...args]));
  }
  return { adapter, events };
}

describe("GenericRtspAdapter", () => {
  it("connect() probes the parsed host:port from the main stream", async () => {
    const probe = vi.fn(async () => {});
    const { adapter } = buildAdapter(probe);
    await adapter.connect();
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith("10.0.0.10", 554, 250);
  });

  it("connect() is idempotent", async () => {
    const probe = vi.fn(async () => {});
    const { adapter } = buildAdapter(probe);
    await adapter.connect();
    await adapter.connect();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("connect() rejects when probe fails and surfaces a helpful message", async () => {
    const probe = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const { adapter } = buildAdapter(probe);
    await expect(adapter.connect()).rejects.toThrow(/RTSP probe to 10\.0\.0\.10:554 failed: ECONNREFUSED/);
  });

  it("emits camera.online once on first success and camera.offline on failure threshold", async () => {
    let mode: "ok" | "fail" = "ok";
    const probe = vi.fn(async () => {
      if (mode === "fail") throw new Error("timeout");
    });
    const { adapter, events } = buildAdapter(probe);
    await adapter.connect();
    // No second online edge from a successful health poll.
    const h1 = await adapter.health();
    expect(h1.state).toBe("online");
    expect(events.filter((e) => e[0] === "camera.online")).toHaveLength(1);

    // First failure → degraded, no offline edge yet.
    mode = "fail";
    const h2 = await adapter.health();
    expect(h2.state).toBe("degraded");
    expect(h2.message).toMatch(/timeout/);
    expect(events.filter((e) => e[0] === "camera.offline")).toHaveLength(0);

    // Second failure crosses offlineAfterConsecutiveFailures=2.
    const h3 = await adapter.health();
    expect(h3.state).toBe("offline");
    const offlineEvents = events.filter((e) => e[0] === "camera.offline");
    expect(offlineEvents).toHaveLength(1);
    expect(offlineEvents[0][1]).toBe("front");
    expect(offlineEvents[0][2]).toMatch(/timeout/);

    // Recovery emits a fresh camera.online edge.
    mode = "ok";
    const h4 = await adapter.health();
    expect(h4.state).toBe("online");
    expect(h4.reconnectAttempts).toBe(0);
    expect(events.filter((e) => e[0] === "camera.online")).toHaveLength(2);
  });

  it("reconnect() bumps reconnectAttempts and resets on success", async () => {
    const probe = vi.fn(async () => {});
    const { adapter } = buildAdapter(probe);
    await adapter.connect();
    await adapter.reconnect();
    const h = await adapter.health();
    // reconnect succeeded → markOnline reset attempts to 0
    expect(h.reconnectAttempts).toBe(0);
    expect(h.state).toBe("online");
  });

  it("describe() includes both main and sub streams with rtsp protocol", async () => {
    const { adapter } = buildAdapter(async () => {});
    const c = await adapter.describe();
    expect(c.id).toBe("front");
    expect(c.source).toBe("generic");
    expect(c.streams.map((s) => s.quality).sort()).toEqual(["main", "sub"]);
    for (const s of c.streams) expect(s.protocol).toBe("rtsp");
    expect(c.capabilities.substream).toBe(true); // auto-flagged from sub stream
    expect(c.capabilities.ptz).toBe(true);
  });

  it("getStream() falls back to main when requested quality is missing", async () => {
    const { adapter } = buildAdapter(async () => {});
    const audio = await adapter.getStream("audio");
    expect(audio.quality).toBe("audio");
    expect(audio.url).toBe("rtsp://user:pw@10.0.0.10:554/main");
  });

  it("dispose() makes the adapter inert and removes listeners", async () => {
    const probe = vi.fn(async () => {});
    const { adapter } = buildAdapter(probe);
    await adapter.connect();
    await adapter.dispose();
    await adapter.dispose(); // idempotent
    const h = await adapter.health();
    expect(h.state).toBe("offline");
    expect(h.message).toBe("disposed");
    await expect(adapter.connect()).rejects.toThrow(/disposed/);
    await expect(adapter.reconnect()).rejects.toThrow(/disposed/);
  });

  it("constructor validates every stream URL up-front", () => {
    expect(
      () =>
        new GenericRtspAdapter({
          cameraId: "x",
          name: "x",
          location: "x",
          streams: {
            main: { url: "rtsp://10.0.0.1/x" },
            sub: { url: "http://nope" },
          },
        }),
    ).toThrow(/rtsp/);
  });

  it("constructor rejects missing main stream", () => {
    expect(
      () =>
        new GenericRtspAdapter({
          cameraId: "x",
          name: "x",
          location: "x",
          // @ts-expect-error -- intentional: validating runtime guard
          streams: { sub: { url: "rtsp://10.0.0.1/x" } },
        }),
    ).toThrow(/streams\.main/);
  });

  it("health() snapshot conforms to the CameraHealth contract", async () => {
    const { adapter } = buildAdapter(async () => {});
    const h: CameraHealth = await adapter.health();
    expect(h.cameraId).toBe("front");
    expect(["online", "degraded", "offline", "unknown"]).toContain(h.state);
    expect(typeof h.reconnectAttempts).toBe("number");
  });
});
