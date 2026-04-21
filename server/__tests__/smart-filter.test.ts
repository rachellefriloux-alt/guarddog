import { describe, it, expect, vi, beforeEach } from "vitest";
import { fallbackParse, ruleMatches } from "../services/smart-filter";

describe("smart-filter fallback parser", () => {
  it("identifies person + camera + 24h time window", () => {
    const rule = fallbackParse("Notify me when a person is on the driveway between 22:00 and 06:00");
    expect(rule.detection).toBe("person");
    expect(rule.cameraFilter).toBe("driveway");
    expect(rule.timeWindow).toEqual({ start: "22:00", end: "06:00" });
  });

  it("handles 12-hour times like '10pm to 6am'", () => {
    const rule = fallbackParse("Alert when someone is at the front door from 10pm to 6am");
    expect(rule.detection).toBe("person");
    expect(rule.cameraFilter).toContain("front door");
    expect(rule.timeWindow?.start).toBe("22:00");
    expect(rule.timeWindow?.end).toBe("06:00");
  });

  it("classifies vehicle, package, pet keywords", () => {
    expect(fallbackParse("Notify me when a car arrives").detection).toBe("vehicle");
    expect(fallbackParse("Tell me about package deliveries").detection).toBe("package");
    expect(fallbackParse("When my dog is in the yard").detection).toBe("pet");
  });

  it("falls back to 'any' for unrecognized phrasing", () => {
    expect(fallbackParse("Some random sentence").detection).toBe("any");
  });
});

describe("ruleMatches", () => {
  const baseRule = { detection: "person" as const, message: "x", minConfidence: 0.5 };

  it("matches when type and confidence agree", () => {
    expect(
      ruleMatches(baseRule, { cameraName: "Front Door", type: "person", confidence: 0.9 }),
    ).toBe(true);
  });

  it("rejects below-threshold confidence", () => {
    expect(
      ruleMatches(baseRule, { cameraName: "Front Door", type: "person", confidence: 0.2 }),
    ).toBe(false);
  });

  it("respects camera filter against name and location", () => {
    const rule = { ...baseRule, cameraFilter: "driveway" };
    expect(
      ruleMatches(rule, { cameraName: "Front", cameraLocation: "driveway", type: "person", confidence: 0.9 }),
    ).toBe(true);
    expect(
      ruleMatches(rule, { cameraName: "Front", cameraLocation: "porch", type: "person", confidence: 0.9 }),
    ).toBe(false);
  });

  it("supports time windows that cross midnight", () => {
    const rule = {
      ...baseRule,
      timeWindow: { start: "22:00", end: "06:00" },
    };
    const at2am = new Date();
    at2am.setHours(2, 0, 0, 0);
    expect(
      ruleMatches(rule, { cameraName: "x", type: "person", confidence: 0.9, at: at2am }),
    ).toBe(true);

    const at1pm = new Date();
    at1pm.setHours(13, 0, 0, 0);
    expect(
      ruleMatches(rule, { cameraName: "x", type: "person", confidence: 0.9, at: at1pm }),
    ).toBe(false);
  });
});

describe("parseSmartRule integration", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses the fallback parser when no AI provider is available", async () => {
    vi.doMock("../services/ai-provider-router", () => ({
      generateText: async () => null,
    }));
    const { parseSmartRule } = await import("../services/smart-filter");
    const result = await parseSmartRule("Notify when a person is at the gate from 9pm to 5am");
    expect(result.source).toBe("fallback");
    expect(result.rule.detection).toBe("person");
    expect(result.rule.timeWindow).toBeDefined();
  });

  it("uses the AI output when the provider returns valid JSON", async () => {
    vi.doMock("../services/ai-provider-router", () => ({
      generateText: async () =>
        JSON.stringify({
          detection: "vehicle",
          cameraFilter: "garage",
          timeWindow: null,
          minConfidence: 0.7,
          message: "Car at garage",
        }),
    }));
    const { parseSmartRule } = await import("../services/smart-filter");
    const result = await parseSmartRule("any car at the garage");
    expect(result.source).toBe("ai");
    expect(result.rule.detection).toBe("vehicle");
    expect(result.rule.cameraFilter).toBe("garage");
    expect(result.rule.minConfidence).toBe(0.7);
  });
});
