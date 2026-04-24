import { describe, expect, it } from "vitest";

import {
  ALERT_RULES,
  BURST_RULE_DEFAULT,
  DIGEST_DEFAULT,
  QUIET_HOURS_DEFAULT,
  effectiveChannels,
  isInQuietHours,
  resolveRule,
} from "../../shared/alert-rules";

describe("alert-rules matrix", () => {
  it("contains every confirmed urgent trigger exactly once", () => {
    const urgentIds = ALERT_RULES.filter((r) => r.urgency === "urgent").map(
      (r) => r.id,
    );
    expect(new Set(urgentIds).size).toBe(urgentIds.length);
    for (const id of [
      "urgent.person-at-entry",
      "urgent.doorbell",
      "urgent.camera-offline",
      "urgent.storage-critical",
      "urgent.tamper",
      "urgent.burst",
    ]) {
      expect(urgentIds).toContain(id);
    }
  });

  it("never enables SMS on any rule (confirmed: SMS off)", () => {
    for (const rule of ALERT_RULES) {
      expect(rule.channels).not.toContain("sms");
    }
  });

  it("urgent rules deliver push and bypass quiet hours", () => {
    for (const rule of ALERT_RULES.filter((r) => r.urgency === "urgent")) {
      expect(rule.channels).toContain("push");
      expect(rule.bypassQuietHours).toBe(true);
    }
  });

  it("non-urgent rules use email-digest, not push", () => {
    for (const rule of ALERT_RULES.filter((r) => r.urgency === "non-urgent")) {
      expect(rule.channels).toContain("email-digest");
      expect(rule.channels).not.toContain("push");
    }
  });

  it("digest interval is in the confirmed 6–12 hour band", () => {
    expect(DIGEST_DEFAULT.intervalHours).toBeGreaterThanOrEqual(6);
    expect(DIGEST_DEFAULT.intervalHours).toBeLessThanOrEqual(12);
  });

  it("burst rule matches the confirmed 3-in-2-min escalation", () => {
    expect(BURST_RULE_DEFAULT.count).toBe(3);
    expect(BURST_RULE_DEFAULT.windowSec).toBe(120);
    expect(BURST_RULE_DEFAULT.promoteTo).toBe("urgent");
  });
});

describe("resolveRule", () => {
  it("maps doorbell-press to the urgent doorbell rule", () => {
    expect(resolveRule("doorbell-press")?.id).toBe("urgent.doorbell");
  });

  it("maps motion to the digest rule", () => {
    expect(resolveRule("motion")?.id).toBe("digest.routine-motion");
  });
});

describe("isInQuietHours (overnight window)", () => {
  it("treats the default 22:00–07:00 window correctly", () => {
    expect(isInQuietHours("23:30")).toBe(true);
    expect(isInQuietHours("03:00")).toBe(true);
    expect(isInQuietHours("06:59")).toBe(true);
    expect(isInQuietHours("07:00")).toBe(false);
    expect(isInQuietHours("12:00")).toBe(false);
    expect(isInQuietHours("21:59")).toBe(false);
    expect(isInQuietHours("22:00")).toBe(true);
  });

  it("supports daytime windows too", () => {
    const day = { start: "09:00", end: "17:00", silenceNonUrgent: true };
    expect(isInQuietHours("12:00", day)).toBe(true);
    expect(isInQuietHours("08:59", day)).toBe(false);
    expect(isInQuietHours("17:00", day)).toBe(false);
  });
});

describe("effectiveChannels", () => {
  const doorbell = ALERT_RULES.find((r) => r.id === "urgent.doorbell")!;
  const motion = ALERT_RULES.find((r) => r.id === "digest.routine-motion")!;

  it("returns the rule's channels unchanged outside quiet hours", () => {
    expect(effectiveChannels(doorbell, { localHHMM: "12:00" })).toEqual(
      doorbell.channels,
    );
    expect(effectiveChannels(motion, { localHHMM: "12:00" })).toEqual(
      motion.channels,
    );
  });

  it("keeps urgent push during quiet hours", () => {
    expect(effectiveChannels(doorbell, { localHHMM: "03:00" })).toContain(
      "push",
    );
  });

  it("strips push from non-urgent during quiet hours", () => {
    // Non-urgent rules don't have push to begin with — ensure we don't add one.
    const channels = effectiveChannels(motion, { localHHMM: "03:00" });
    expect(channels).not.toContain("push");
  });

  it("returns rule.channels when localHHMM is omitted", () => {
    expect(effectiveChannels(doorbell)).toEqual(doorbell.channels);
  });
});

describe("QUIET_HOURS_DEFAULT", () => {
  it("matches the confirmed 22:00–07:00 window", () => {
    expect(QUIET_HOURS_DEFAULT.start).toBe("22:00");
    expect(QUIET_HOURS_DEFAULT.end).toBe("07:00");
    expect(QUIET_HOURS_DEFAULT.silenceNonUrgent).toBe(true);
  });
});
