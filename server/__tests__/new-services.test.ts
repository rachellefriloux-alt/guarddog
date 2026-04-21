import { describe, it, expect, beforeEach } from "vitest";
import { auditLog } from "../services/audit-log";
import { mintShareToken, verifyShareToken } from "../services/clip-share";
import { notificationService } from "../services/notification-service";
import { runDiagnostics } from "../services/diagnostics";

describe("audit-log", () => {
  beforeEach(() => auditLog.clear());

  it("records and returns entries newest-first", () => {
    auditLog.record({ event: "auth.login", detail: "first" });
    auditLog.record({ event: "auth.login", detail: "second" });
    const list = auditLog.list();
    expect(list).toHaveLength(2);
    expect(list[0].detail).toBe("second");
    expect(list[1].detail).toBe("first");
  });

  it("respects the limit parameter", () => {
    for (let i = 0; i < 10; i += 1) {
      auditLog.record({ event: "auth.login", detail: `e${i}` });
    }
    expect(auditLog.list(3)).toHaveLength(3);
  });

  it("trims to the configured ring size", () => {
    // The default service is bounded; just sanity-check that size never grows
    // beyond a generous cap when we hammer it.
    for (let i = 0; i < 1500; i += 1) {
      auditLog.record({ event: "auth.login", detail: `${i}` });
    }
    expect(auditLog.size()).toBeLessThanOrEqual(500);
  });
});

describe("clip-share", () => {
  it("verifies a freshly minted token", () => {
    const t = mintShareToken("rec-1", 1);
    const v = verifyShareToken(t.token);
    expect(v.ok).toBe(true);
    expect(v.recordingId).toBe("rec-1");
  });

  it("rejects a tampered signature", () => {
    const t = mintShareToken("rec-1", 1);
    const broken = t.token.slice(0, -2) + "AA";
    expect(verifyShareToken(broken).ok).toBe(false);
  });

  it("rejects an expired token", () => {
    // Use a tiny TTL so we can test expiry without sleeping.
    const original = Date.now;
    try {
      const t = mintShareToken("rec-1", 1);
      Date.now = () => original.call(Date) + 1000 * 60 * 60 * 24 * 2;
      expect(verifyShareToken(t.token).ok).toBe(false);
    } finally {
      Date.now = original;
    }
  });

  it("rejects malformed tokens", () => {
    expect(verifyShareToken("garbage").ok).toBe(false);
    expect(verifyShareToken("only.one.dot").ok).toBe(false);
    expect(verifyShareToken("").ok).toBe(false);
  });
});

describe("notification-service", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NTFY_TOPIC_URL;
    delete process.env.DISCORD_WEBHOOK_URL;
    delete process.env.PUSHOVER_USER_KEY;
    delete process.env.PUSHOVER_API_TOKEN;
    delete process.env.GENERIC_WEBHOOK_URL;
  });

  it("reports all channels disabled by default", () => {
    const channels = notificationService.getChannels();
    expect(channels.every((c) => !c.enabled)).toBe(true);
  });

  it("enables ntfy when the env var is set", () => {
    process.env.NTFY_TOPIC_URL = "https://ntfy.sh/test-topic";
    const ntfy = notificationService.getChannels().find((c) => c.id === "ntfy")!;
    expect(ntfy.enabled).toBe(true);
  });

  it("send() is a no-op (returns []) when nothing is configured", async () => {
    const results = await notificationService.send({ title: "x", message: "y" });
    expect(results).toEqual([]);
  });
});

describe("diagnostics", () => {
  it("returns a report with the standard checks and a summary", async () => {
    const report = await runDiagnostics();
    expect(report.checks.map((c) => c.id)).toEqual(
      expect.arrayContaining(["ffmpeg", "storage", "onedrive", "ai", "mqtt", "session"]),
    );
    const total =
      report.summary.ok + report.summary.warn + report.summary.fail + report.summary.skip;
    expect(total).toBe(report.checks.length);
  });
});
