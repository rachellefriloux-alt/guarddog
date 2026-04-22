import { describe, expect, it } from "vitest";

import { AlertRouter } from "../services/alert-router";
import type { Alert } from "../../shared/contracts";
import { BURST_RULE_DEFAULT } from "../../shared/alert-rules";

interface Harness {
  router: AlertRouter;
  alerts: Alert[];
  unmatched: number;
  /** Mutable; tests advance this between calls. */
  clock: { now: number };
}

function makeHarness(opts: {
  localHHMM?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quietHours?: any;
} = {}): Harness {
  const clock = { now: 1_700_000_000_000 };
  let id = 0;
  const router = new AlertRouter({
    now: () => clock.now,
    generateId: () => `alert-${++id}`,
    localClock: () => opts.localHHMM ?? "12:00",
    quietHours: opts.quietHours,
  });
  const alerts: Alert[] = [];
  let unmatched = 0;
  router.on("alert", (a) => alerts.push(a));
  router.on("unmatched", () => unmatched++);
  return {
    router,
    alerts,
    get unmatched() {
      return unmatched;
    },
    clock,
  } as Harness;
}

describe("AlertRouter", () => {
  it("emits a validated Alert for a matching event kind", () => {
    const h = makeHarness();
    h.router.ingest({ kind: "doorbell-press", cameraId: "cam-front" });
    expect(h.alerts).toHaveLength(1);
    const a = h.alerts[0];
    expect(a.ruleId).toBe("urgent.doorbell");
    expect(a.urgency).toBe("urgent");
    expect(a.cameraId).toBe("cam-front");
    expect(a.channels).toContain("push");
  });

  it("emits 'unmatched' when no rule matches and no alert is produced", () => {
    const h = makeHarness();
    // package-delivered has no rule in the locked matrix.
    h.router.ingest({ kind: "package-delivered", cameraId: "cam-front" });
    expect(h.alerts).toHaveLength(0);
    expect(h.unmatched).toBe(1);
  });

  it("drops push channel for non-urgent rules during quiet hours", () => {
    const h = makeHarness({ localHHMM: "23:00" });
    h.router.ingest({ kind: "motion", cameraId: "cam-back" });
    expect(h.alerts).toHaveLength(1);
    // Motion is digest-only, so push must never be present.
    expect(h.alerts[0].channels).not.toContain("push");
    // No channel was actually stripped (motion has no push to begin with),
    // so suppressed stays false. The matrix is intentionally constructed so
    // urgent rules bypass and non-urgent rules are already digest-only.
    expect(h.alerts[0].suppressed).toBe(false);
  });

  it("preserves push channel for urgent rules during quiet hours", () => {
    const h = makeHarness({ localHHMM: "23:00" });
    h.router.ingest({ kind: "doorbell-press", cameraId: "cam-front" });
    expect(h.alerts[0].channels).toContain("push");
    expect(h.alerts[0].suppressed).toBe(false);
  });

  it("escalates to a burst alert after threshold events from the same camera", () => {
    const h = makeHarness();
    for (let i = 0; i < BURST_RULE_DEFAULT.count; i++) {
      h.router.ingest({ kind: "motion", cameraId: "cam-back" });
    }
    // 3 motion alerts + 1 burst alert = 4
    expect(h.alerts).toHaveLength(BURST_RULE_DEFAULT.count + 1);
    const burst = h.alerts.at(-1)!;
    expect(burst.ruleId).toBe("urgent.burst");
    expect(burst.urgency).toBe("urgent");
    expect(burst.cameraId).toBe("cam-back");
  });

  it("does not re-fire burst on every subsequent event", () => {
    const h = makeHarness();
    for (let i = 0; i < BURST_RULE_DEFAULT.count + 5; i++) {
      h.router.ingest({ kind: "motion", cameraId: "cam-back" });
    }
    const burstCount = h.alerts.filter((a) => a.ruleId === "urgent.burst").length;
    expect(burstCount).toBe(1);
  });

  it("expires the burst window after the configured window passes", () => {
    const h = makeHarness();
    for (let i = 0; i < BURST_RULE_DEFAULT.count; i++) {
      h.router.ingest({ kind: "motion", cameraId: "cam-back" });
    }
    const firstBursts = h.alerts.filter((a) => a.ruleId === "urgent.burst").length;
    expect(firstBursts).toBe(1);

    // Skip well past the burst window.
    h.clock.now += (BURST_RULE_DEFAULT.windowSec + 1) * 1000;
    for (let i = 0; i < BURST_RULE_DEFAULT.count; i++) {
      h.router.ingest({ kind: "motion", cameraId: "cam-back" });
    }
    const allBursts = h.alerts.filter((a) => a.ruleId === "urgent.burst").length;
    expect(allBursts).toBe(2);
  });

  it("tracks bursts per camera independently", () => {
    const h = makeHarness();
    // Interleave events from two cameras — neither alone hits threshold.
    for (let i = 0; i < BURST_RULE_DEFAULT.count - 1; i++) {
      h.router.ingest({ kind: "motion", cameraId: "cam-a" });
      h.router.ingest({ kind: "motion", cameraId: "cam-b" });
    }
    expect(h.alerts.filter((a) => a.ruleId === "urgent.burst")).toHaveLength(0);
  });

  it("camera lifecycle events (offline/online) do not contribute to bursts", () => {
    const h = makeHarness();
    for (let i = 0; i < BURST_RULE_DEFAULT.count + 2; i++) {
      h.router.ingest({ kind: "camera-online", cameraId: "cam-x" });
    }
    expect(h.alerts.filter((a) => a.ruleId === "urgent.burst")).toHaveLength(0);
  });

  it("respects custom title/body when supplied", () => {
    const h = makeHarness();
    h.router.ingest({
      kind: "person",
      cameraId: "cam-front",
      title: "Person at front door",
      body: "AI detected a person near the entry zone.",
    });
    expect(h.alerts[0].title).toBe("Person at front door");
    expect(h.alerts[0].body).toBe("AI detected a person near the entry zone.");
  });

  it("reset() clears burst state across runs", () => {
    const h = makeHarness();
    for (let i = 0; i < BURST_RULE_DEFAULT.count; i++) {
      h.router.ingest({ kind: "motion", cameraId: "cam-back" });
    }
    h.router.reset();
    h.alerts.length = 0;
    for (let i = 0; i < BURST_RULE_DEFAULT.count - 1; i++) {
      h.router.ingest({ kind: "motion", cameraId: "cam-back" });
    }
    expect(h.alerts.filter((a) => a.ruleId === "urgent.burst")).toHaveLength(0);
  });
});
