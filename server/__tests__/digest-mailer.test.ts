import { describe, expect, it, vi } from "vitest";

import { AlertRouter } from "../services/alert-router";
import { AlertDispatcher } from "../services/alert-dispatcher";
import {
  DigestMailer,
  renderDigest,
  createWebhookDigestSender,
  type DigestPayload,
  type DigestSender,
} from "../services/digest-mailer";

interface FakeClock {
  now: () => number;
  advance: (ms: number) => Promise<void>;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
}

function createFakeClock(start = 1_700_000_000_000): FakeClock {
  let t = start;
  let nextId = 1;
  const timers = new Map<number, { fireAt: number; fn: () => void }>();
  return {
    now: () => t,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fireAt: t + ms, fn });
      return id;
    },
    clearTimeout: (h) => {
      timers.delete(h as number);
    },
    advance: async (ms) => {
      const target = t + ms;
      // Fire timers in chronological order, supporting timers added during firing.
      while (true) {
        const due = Array.from(timers.entries())
          .filter(([, v]) => v.fireAt <= target)
          .sort((a, b) => a[1].fireAt - b[1].fireAt);
        if (due.length === 0) break;
        const [id, timer] = due[0];
        timers.delete(id);
        t = timer.fireAt;
        timer.fn();
        // Let any queued microtasks (async flushNow) settle.
        await new Promise((r) => setImmediate(r));
      }
      t = target;
    },
  };
}

function makeRouter(now: () => number): AlertRouter {
  let id = 0;
  return new AlertRouter({
    now,
    generateId: () => `alert-${++id}`,
    localClock: () => "12:00",
  });
}

describe("DigestMailer", () => {
  it("flushes accumulated digest entries on each tick", async () => {
    const clock = createFakeClock();
    const send = vi.fn(async () => ({ ok: true }));
    const router = makeRouter(clock.now);
    const dispatcher = new AlertDispatcher({ now: clock.now });
    dispatcher.attach(router);
    const mailer = new DigestMailer(dispatcher, { send }, {
      intervalHours: 6,
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });
    mailer.start();

    router.ingest({ kind: "motion", cameraId: "cam-a" });
    router.ingest({ kind: "motion", cameraId: "cam-b" });
    await new Promise((r) => setImmediate(r));

    await clock.advance(6 * 60 * 60 * 1000);

    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0] as DigestPayload;
    expect(payload.totalAlerts).toBe(2);
    expect(payload.byCamera.map((g) => g.cameraId)).toEqual(["cam-a", "cam-b"]);
    mailer.stop();
  });

  it("skips empty ticks without invoking the sender", async () => {
    const clock = createFakeClock();
    const send = vi.fn(async () => ({ ok: true }));
    const router = makeRouter(clock.now);
    const dispatcher = new AlertDispatcher({ now: clock.now });
    dispatcher.attach(router);
    const mailer = new DigestMailer(dispatcher, { send }, {
      intervalHours: 6,
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });
    mailer.start();

    await clock.advance(6 * 60 * 60 * 1000);
    expect(send).not.toHaveBeenCalled();
    mailer.stop();
  });

  it("clamps interval to maxIntervalHours", () => {
    const send = vi.fn(async () => ({ ok: true }));
    const dispatcher = new AlertDispatcher();
    const mailer = new DigestMailer(dispatcher, { send }, {
      intervalHours: 48,
      maxIntervalHours: 12,
    });
    expect(mailer.getIntervalMs()).toBe(12 * 60 * 60 * 1000);
  });

  it("retains the last failed payload for inspection and emits digest.failed", async () => {
    const clock = createFakeClock();
    const send = vi.fn(async () => ({ ok: false, details: "smtp down" }));
    const router = makeRouter(clock.now);
    const dispatcher = new AlertDispatcher({ now: clock.now });
    dispatcher.attach(router);
    const mailer = new DigestMailer(dispatcher, { send }, {
      intervalHours: 6,
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });
    const failures: unknown[] = [];
    mailer.on("digest.failed", (e) => failures.push(e));
    mailer.start();

    router.ingest({ kind: "motion", cameraId: "cam-a" });
    await new Promise((r) => setImmediate(r));
    await clock.advance(6 * 60 * 60 * 1000);

    expect(failures).toHaveLength(1);
    expect(mailer.lastFailure?.payload.totalAlerts).toBe(1);
    mailer.stop();
  });

  it("flushNow returns reason='stopped' when not running", async () => {
    const dispatcher = new AlertDispatcher();
    const mailer = new DigestMailer(dispatcher, { send: vi.fn(async () => ({ ok: true })) });
    const out = await mailer.flushNow();
    expect(out).toEqual({ attempted: false, ok: false, totalAlerts: 0, reason: "stopped" });
  });

  it("flushes within the immediate-debounce window when an email-flagged entry arrives", async () => {
    const clock = createFakeClock();
    const send = vi.fn(async () => ({ ok: true }));
    const dispatcher = new AlertDispatcher({ now: clock.now });
    const mailer = new DigestMailer(dispatcher, { send }, {
      intervalHours: 6,
      immediateFlushDebounceMs: 5_000,
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });
    mailer.start();

    // Bypass the router and dispatch an alert with the `email` channel directly.
    await dispatcher.dispatch({
      id: "a-1",
      ruleId: "info.motion",
      urgency: "info",
      title: "Motion",
      body: "saw something",
      channels: ["email"],
      cameraId: "cam-a",
      createdAt: new Date(clock.now()).toISOString(),
      suppressed: false,
    });

    expect(send).not.toHaveBeenCalled();
    await clock.advance(5_000);
    expect(send).toHaveBeenCalledTimes(1);
    mailer.stop();
  });

  it("stop cancels pending timers and detaches dispatcher listener", async () => {
    const clock = createFakeClock();
    const send = vi.fn(async () => ({ ok: true }));
    const router = makeRouter(clock.now);
    const dispatcher = new AlertDispatcher({ now: clock.now });
    dispatcher.attach(router);
    const mailer = new DigestMailer(dispatcher, { send }, {
      intervalHours: 6,
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });
    mailer.start();
    mailer.stop();

    router.ingest({ kind: "motion", cameraId: "cam-a" });
    await clock.advance(24 * 60 * 60 * 1000);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("renderDigest", () => {
  it("groups alerts by camera with stable ordering and _global last", () => {
    const now = 1_700_000_000_000;
    const payload = renderDigest(
      [
        {
          alert: {
            id: "1", ruleId: "r", urgency: "info", title: "T1", body: "B1",
            channels: ["email-digest"], cameraId: "cam-b",
            createdAt: new Date(now).toISOString(), suppressed: false,
          },
          immediate: false, queuedAt: now,
        },
        {
          alert: {
            id: "2", ruleId: "r", urgency: "info", title: "T2", body: "B2",
            channels: ["email-digest"],
            createdAt: new Date(now + 1).toISOString(), suppressed: false,
          },
          immediate: false, queuedAt: now + 1,
        },
        {
          alert: {
            id: "3", ruleId: "r", urgency: "info", title: "T3", body: "B3",
            channels: ["email-digest"], cameraId: "cam-a",
            createdAt: new Date(now + 2).toISOString(), suppressed: false,
          },
          immediate: false, queuedAt: now + 2,
        },
      ],
      now + 3,
    );
    expect(payload.byCamera.map((g) => g.cameraId)).toEqual(["cam-a", "cam-b", "_global"]);
    expect(payload.totalAlerts).toBe(3);
    expect(payload.bodyMarkdown).toContain("# Guarddog digest — 3 alerts");
    expect(payload.bodyText).toContain("System (1):");
  });

  it("uses singular 'alert' for one entry", () => {
    const now = 1_700_000_000_000;
    const payload = renderDigest(
      [
        {
          alert: {
            id: "1", ruleId: "r", urgency: "info", title: "T", body: "B",
            channels: ["email-digest"], cameraId: "cam-a",
            createdAt: new Date(now).toISOString(), suppressed: false,
          },
          immediate: false, queuedAt: now,
        },
      ],
      now,
    );
    expect(payload.subject).toBe("Guarddog digest — 1 alert");
  });
});

describe("createWebhookDigestSender", () => {
  it("POSTs JSON and reports ok based on response status", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 } as unknown as Response));
    const sender: DigestSender = createWebhookDigestSender("https://example.test/hook", fetchImpl as unknown as typeof fetch);
    const payload = renderDigest([], 1_700_000_000_000);
    const out = await sender.send(payload);
    expect(out.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.test/hook",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
