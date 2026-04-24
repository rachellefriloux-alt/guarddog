/**
 * Phase 2 cont. — Alert dispatcher.
 *
 * Receives `Alert` objects from the `AlertRouter` and delivers them to the
 * actual sinks (push services, digest buffer, generic webhook). This is the
 * one place in the system that does I/O for alerts, which keeps the router
 * pure and lets us swap delivery implementations without changing routing.
 *
 * Channel handling:
 *   - `push`         → delegates to the injected push sink (defaults to a
 *                      thin shim around `notificationService.send`).
 *   - `email-digest` → buffered in `digestQueue` keyed by camera; the digest
 *                      mailer (future PR) will drain it on the configured
 *                      interval. Surfaced via `getDigestSnapshot` for tests
 *                      and for the parity / settings UI.
 *   - `email`        → also buffered into the digest queue but flagged
 *                      `immediate: true` so the mailer can choose to send
 *                      right away. We do not invoke an SMTP client here — no
 *                      such dependency exists yet, and adding one belongs in
 *                      its own PR.
 *   - `webhook` / `ntfy` / `discord` / `pushover` / `sms` → routed through the
 *                      same push sink, which already understands those.
 *   - `none`         → explicitly dropped.
 *
 * Failures from any sink are caught, logged via the injectable logger, and
 * surfaced on the `delivery.error` event. A single bad sink never breaks
 * other channels for the same alert.
 */

import { EventEmitter } from "node:events";

import type { Alert, AlertChannel } from "@shared/contracts";
import { AlertRouter } from "./alert-router";
import type { StreamSupervisor } from "../adapters/stream-supervisor";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PushSink {
  /**
   * Deliver an alert to all enabled push targets. Implementations should not
   * throw; they should resolve with a per-channel success summary. The
   * dispatcher only cares about the boolean outcome.
   */
  deliver(alert: Alert): Promise<{ ok: boolean; details?: unknown }>;
}

export interface DigestEntry {
  alert: Alert;
  /** True for `email`, false for `email-digest`. */
  immediate: boolean;
  queuedAt: number;
}

export interface AlertDispatcherOptions {
  pushSink?: PushSink;
  /** Time provider — overridable for tests. */
  now?: () => number;
  /** Hard cap on queued digest entries; oldest are dropped first. */
  digestCapacity?: number;
  /** Logger for sink failures. */
  logger?: { warn: (msg: string, meta?: unknown) => void };
}

export interface DispatchResult {
  alertId: string;
  ruleId: string;
  /** Channels actually attempted (after suppression filtering by the router). */
  channels: AlertChannel[];
  pushOk: boolean | null;
  queuedForDigest: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const PUSH_LIKE_CHANNELS: ReadonlySet<AlertChannel> = new Set<AlertChannel>([
  "push",
  "ntfy",
  "discord",
  "pushover",
  "webhook",
  "sms",
]);

const NOOP_LOGGER = { warn: () => {} };

export class AlertDispatcher extends EventEmitter {
  private readonly pushSink: PushSink;
  private readonly now: () => number;
  private readonly digestCapacity: number;
  private readonly logger: NonNullable<AlertDispatcherOptions["logger"]>;

  /** FIFO digest queue keyed by cameraId (or "_global"). */
  private readonly digest = new Map<string, DigestEntry[]>();

  constructor(options: AlertDispatcherOptions = {}) {
    super();
    this.pushSink = options.pushSink ?? createNoopPushSink();
    this.now = options.now ?? (() => Date.now());
    this.digestCapacity = options.digestCapacity ?? 500;
    this.logger = options.logger ?? NOOP_LOGGER;
  }

  /**
   * Subscribe to the router and start dispatching. Returns an unsubscribe
   * function — useful for tests and for hot-reload scenarios.
   */
  attach(router: AlertRouter): () => void {
    const handler = (alert: Alert): void => {
      // Fire-and-forget: the dispatcher is event-driven and must not block
      // the router. Errors are caught inside `dispatch`.
      void this.dispatch(alert);
    };
    router.on("alert", handler);
    return () => router.off("alert", handler);
  }

  async dispatch(alert: Alert): Promise<DispatchResult> {
    const result: DispatchResult = {
      alertId: alert.id,
      ruleId: alert.ruleId,
      channels: [...alert.channels],
      pushOk: null,
      queuedForDigest: false,
    };

    const wantsPush = alert.channels.some((c) => PUSH_LIKE_CHANNELS.has(c));
    const wantsDigest = alert.channels.includes("email-digest");
    const wantsImmediateEmail = alert.channels.includes("email");

    if (wantsPush) {
      try {
        const outcome = await this.pushSink.deliver(alert);
        result.pushOk = outcome.ok;
        if (!outcome.ok) {
          this.logger.warn("AlertDispatcher: push sink reported failure", {
            alertId: alert.id,
            ruleId: alert.ruleId,
            details: outcome.details,
          });
          this.emit("delivery.error", { alert, channel: "push", details: outcome.details });
        }
      } catch (err) {
        result.pushOk = false;
        this.logger.warn("AlertDispatcher: push sink threw", {
          alertId: alert.id,
          ruleId: alert.ruleId,
          error: err,
        });
        this.emit("delivery.error", { alert, channel: "push", error: err });
      }
    }

    if (wantsDigest || wantsImmediateEmail) {
      this.enqueueDigest(alert, { immediate: wantsImmediateEmail });
      result.queuedForDigest = true;
    }

    this.emit("dispatched", result);
    return result;
  }

  // ---- digest queue -----------------------------------------------------

  private enqueueDigest(alert: Alert, opts: { immediate: boolean }): void {
    const key = alert.cameraId ?? "_global";
    const bucket = this.digest.get(key) ?? [];
    bucket.push({ alert, immediate: opts.immediate, queuedAt: this.now() });

    // Apply per-camera cap defensively to keep memory bounded if no mailer
    // ever drains. We trim oldest first because new alerts are more relevant.
    if (bucket.length > this.digestCapacity) {
      bucket.splice(0, bucket.length - this.digestCapacity);
    }
    this.digest.set(key, bucket);
  }

  /** Drain and return all queued digest entries. Clears the buffer. */
  drainDigest(): DigestEntry[] {
    const out: DigestEntry[] = [];
    this.digest.forEach((bucket) => {
      out.push(...bucket);
    });
    this.digest.clear();
    // Sort by queue time so the mailer renders them in chronological order.
    out.sort((a, b) => a.queuedAt - b.queuedAt);
    return out;
  }

  /** Read-only snapshot for UI / tests. Does not mutate the queue. */
  getDigestSnapshot(): { byCamera: Record<string, DigestEntry[]>; total: number } {
    const byCamera: Record<string, DigestEntry[]> = {};
    let total = 0;
    this.digest.forEach((v, k) => {
      byCamera[k] = [...v];
      total += v.length;
    });
    return { byCamera, total };
  }
}

// ---------------------------------------------------------------------------
// Sinks
// ---------------------------------------------------------------------------

/**
 * Default sink — does nothing. Tests use this implicitly; production wires
 * `createNotificationServicePushSink` or a custom sink.
 */
export function createNoopPushSink(): PushSink {
  return {
    async deliver() {
      return { ok: true };
    },
  };
}

/**
 * Adapter that bridges an `Alert` to the existing `notificationService`.
 * Kept as a small factory (rather than an import-time singleton) so the
 * dispatcher stays decoupled from the global notification module — handy for
 * tests and for future per-tenant sinks.
 */
export function createNotificationServicePushSink(notificationService: {
  send: (payload: {
    title: string;
    message: string;
    level?: "info" | "alert" | "critical";
    url?: string;
    meta?: Record<string, unknown>;
  }) => Promise<Array<{ ok: boolean }>>;
}): PushSink {
  return {
    async deliver(alert: Alert) {
      const results = await notificationService.send({
        title: alert.title,
        message: alert.body,
        level: alert.urgency === "urgent" ? "critical" : "alert",
        url: alert.deepLink,
        meta: {
          alertId: alert.id,
          ruleId: alert.ruleId,
          cameraId: alert.cameraId,
          eventId: alert.eventId,
          snapshotUrl: alert.snapshotUrl,
        },
      });
      const ok = results.length > 0 && results.some((r) => r.ok);
      return { ok, details: results };
    },
  };
}

// ---------------------------------------------------------------------------
// Supervisor wiring
// ---------------------------------------------------------------------------

/**
 * Translate `StreamSupervisor` lifecycle events into `RouterEvent`s. Kept as
 * a tiny standalone helper (rather than baking it into either side) so the
 * supervisor and router stay independent.
 *
 * Returns an unsubscribe function.
 */
export function wireSupervisorToRouter(
  supervisor: StreamSupervisor,
  router: AlertRouter,
): () => void {
  const onOffline = (cameraId: string, reason?: string): void => {
    router.ingest({
      kind: "camera-offline",
      cameraId,
      body: reason ?? "Camera has been unreachable past the offline threshold.",
    });
  };
  const onOnline = (cameraId: string): void => {
    router.ingest({
      kind: "camera-online",
      cameraId,
      body: "Camera reconnected.",
    });
  };
  supervisor.on("camera.offline", onOffline);
  supervisor.on("camera.online", onOnline);
  return () => {
    supervisor.off("camera.offline", onOffline);
    supervisor.off("camera.online", onOnline);
  };
}
