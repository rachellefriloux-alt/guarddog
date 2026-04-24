/**
 * Phase 2 — Alert router.
 *
 * Pure orchestration that turns raw events (from the StreamSupervisor, the
 * recorder, the AI worker, etc.) into `Alert` objects per the locked alert
 * matrix in `shared/alert-rules.ts`.
 *
 * Responsibilities:
 *   - Resolve the matching `AlertRule` for an event kind.
 *   - Apply burst escalation: N events from the same camera within a window
 *     are coalesced into a single synthetic `burst` event that fires the
 *     `urgent.burst` rule (preventing notification spam during, e.g., a
 *     person walking back and forth).
 *   - Apply quiet-hours channel filtering via `effectiveChannels`.
 *   - Emit a fully-formed `Alert` (validated against `alertSchema`) on the
 *     `alert` event.
 *
 * Does NOT perform delivery. Push, email, and digest workers subscribe to
 * `alert` and decide how to ship it. This separation keeps the router
 * deterministic and unit-testable, and lets the desktop / native app reuse
 * the same routing logic if we ever run alerts client-side.
 *
 * Time / random / id-generation are all injectable so the whole thing runs
 * with a fake clock in tests.
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import {
  ALERT_RULES,
  BURST_RULE_DEFAULT,
  QUIET_HOURS_DEFAULT,
  effectiveChannels,
  resolveRule,
  type AlertRule,
  type BurstRule,
  type QuietHoursConfig,
} from "@shared/alert-rules";
import {
  alertSchema,
  type Alert,
  type EventKind,
} from "@shared/contracts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Caller-supplied event payload. Mirrors `EventContract` but without server
 * fields like `id` / `startedAt` (the router fills those in).
 */
export interface RouterEvent {
  kind: EventKind;
  cameraId?: string;
  /** Optional pre-rendered title; falls back to the rule label. */
  title?: string;
  /** Optional pre-rendered body; falls back to a generic description. */
  body?: string;
  snapshotUrl?: string;
  eventId?: string;
  deepLink?: string;
  /** ISO-8601 timestamp; defaults to `now()`. */
  occurredAt?: string;
}

export interface AlertRouterOptions {
  /** Override the alert matrix (tests / future per-tenant config). */
  rules?: ReadonlyArray<AlertRule>;
  /** Burst escalation thresholds. Defaults to `BURST_RULE_DEFAULT` (3 in 120s). */
  burst?: BurstRule;
  /** Quiet-hours window. Defaults to 22:00–07:00. */
  quietHours?: QuietHoursConfig;
  /** Time provider — overridable for tests. */
  now?: () => number;
  /** ID generator — overridable for tests. */
  generateId?: () => string;
  /**
   * Resolve the local "HH:MM" string for quiet-hours evaluation. Defaults to
   * the host's local time. Tests can pin this to a fixed value.
   */
  localClock?: (now: number) => string;
}

export interface AlertRouterEvents {
  /** Emitted once per resolved alert, after quiet-hours filtering. */
  alert: (alert: Alert) => void;
  /** Emitted when an event is dropped because no rule matches it. */
  unmatched: (event: RouterEvent) => void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

interface BurstWindow {
  /** Epoch ms timestamps of recent events in the window. */
  ts: number[];
  /** True while we're suppressing follow-up events after firing burst. */
  active: boolean;
}

const DEFAULT_LOCAL_CLOCK = (now: number): string => {
  const d = new Date(now);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

export class AlertRouter extends EventEmitter {
  private readonly rules: ReadonlyArray<AlertRule>;
  private readonly burst: BurstRule;
  private readonly quietHours: QuietHoursConfig;
  private readonly now: () => number;
  private readonly generateId: () => string;
  private readonly localClock: (now: number) => string;

  /** Per-camera sliding window for burst escalation. Cameraless events use "_global". */
  private readonly windows = new Map<string, BurstWindow>();

  constructor(options: AlertRouterOptions = {}) {
    super();
    this.rules = options.rules ?? ALERT_RULES;
    this.burst = options.burst ?? BURST_RULE_DEFAULT;
    this.quietHours = options.quietHours ?? QUIET_HOURS_DEFAULT;
    this.now = options.now ?? (() => Date.now());
    this.generateId = options.generateId ?? randomUUID;
    this.localClock = options.localClock ?? DEFAULT_LOCAL_CLOCK;
  }

  /**
   * Submit an event for routing. May produce zero, one, or two alerts:
   *   - Zero  — no rule matches the event kind (router emits `unmatched`).
   *   - One   — normal path: rule matched and an `Alert` is emitted.
   *   - Two   — same call also tripped the burst threshold; in that case the
   *             router emits the per-event alert AND a synthetic `burst`
   *             alert. Callers don't need to special-case this — they just
   *             see two `alert` events.
   */
  ingest(event: RouterEvent): void {
    const matched = this.emitForKind(event.kind, event);
    if (!matched) {
      this.emit("unmatched", event);
      return;
    }
    // Burst is only meaningful for "real" events. Don't recursively burst on
    // synthetic burst / system / lifecycle events.
    if (this.isBurstEligible(event.kind)) {
      const tripped = this.recordBurst(event);
      if (tripped) {
        this.emitForKind("burst", {
          ...event,
          kind: "burst",
          title: `Burst: ${this.burst.count}+ events in ${this.burst.windowSec}s`,
          body:
            event.cameraId
              ? `Camera ${event.cameraId} produced ${this.burst.count}+ events within ${this.burst.windowSec}s.`
              : `${this.burst.count}+ events within ${this.burst.windowSec}s.`,
        });
      }
    }
  }

  /** Drop all burst windows. Useful for tests and for tenant resets. */
  reset(): void {
    this.windows.clear();
  }

  // ---- internals ---------------------------------------------------------

  private isBurstEligible(kind: EventKind): boolean {
    // Lifecycle / informational events don't contribute to burst pressure.
    return (
      kind !== "burst" &&
      kind !== "system-health" &&
      kind !== "camera-online" &&
      kind !== "camera-offline" &&
      kind !== "storage-warning" &&
      kind !== "storage-critical"
    );
  }

  private recordBurst(event: RouterEvent): boolean {
    const key = event.cameraId ?? "_global";
    const now = this.now();
    const win =
      this.windows.get(key) ?? ({ ts: [], active: false } satisfies BurstWindow);
    const cutoff = now - this.burst.windowSec * 1000;
    win.ts = win.ts.filter((t) => t >= cutoff);
    win.ts.push(now);

    // Reset the suppression flag once activity drops below the threshold so
    // the next burst can fire again.
    if (win.active && win.ts.length < this.burst.count) {
      win.active = false;
    }

    let tripped = false;
    if (!win.active && win.ts.length >= this.burst.count) {
      win.active = true;
      tripped = true;
    }
    this.windows.set(key, win);
    return tripped;
  }

  private resolveRuleFor(kind: EventKind): AlertRule | undefined {
    if (this.rules === ALERT_RULES) return resolveRule(kind);
    return this.rules.find((r) => r.triggers.includes(kind));
  }

  private emitForKind(kind: EventKind, event: RouterEvent): boolean {
    const rule = this.resolveRuleFor(kind);
    if (!rule) return false;

    const nowMs = this.now();
    const channelsAfterQuiet = effectiveChannels(rule, {
      localHHMM: this.localClock(nowMs),
      quiet: this.quietHours,
    });
    const suppressed = channelsAfterQuiet.length < rule.channels.length;

    const draft: Alert = {
      id: this.generateId(),
      ruleId: rule.id,
      urgency: rule.urgency,
      title: event.title ?? rule.label,
      body: event.body ?? rule.description,
      channels: channelsAfterQuiet,
      eventId: event.eventId,
      cameraId: event.cameraId,
      snapshotUrl: event.snapshotUrl,
      deepLink: event.deepLink,
      createdAt: event.occurredAt ?? new Date(nowMs).toISOString(),
      suppressed,
    };

    // Defensive: keep wire shape honest. Validation throws on contract drift,
    // which we want to surface loudly in dev rather than silently leak.
    const validated = alertSchema.parse(draft);
    this.emit("alert", validated);
    return true;
  }
}
