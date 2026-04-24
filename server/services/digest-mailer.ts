/**
 * Phase 2/5 — Digest mailer.
 *
 * Drains the `AlertDispatcher` digest buffer on a configurable cadence and
 * hands the assembled digest to a `DigestSender`. Pure orchestration: the
 * mailer does not know how to send email — it formats a deterministic
 * markdown / plaintext payload (camera-grouped, chronological), and any
 * `DigestSender` (SMTP, ntfy long-form, generic webhook, file dump for tests)
 * can consume it.
 *
 * Behaviour:
 *   - Tick interval defaults to 6 h. Setting `maxIntervalHours` enforces an
 *     upper bound — explicitly clamped because misconfiguration here means
 *     "you stop receiving alert summaries", which is a silent failure mode.
 *   - If an `email` channel entry is queued (flagged `immediate: true` by the
 *     dispatcher), the mailer flushes within `immediateFlushDebounceMs`
 *     instead of waiting for the next tick. Debounced so a burst of immediate
 *     events still produces one digest, not N.
 *   - Empty digests are skipped — we never deliver "0 alerts in the last 6h".
 *   - A failing send leaves the (already-drained) entries in a `lastFailure`
 *     buffer so an operator can inspect/replay; the next tick still runs.
 *
 * Fully testable with an injected clock + scheduler — no real timers in tests.
 */

import { EventEmitter } from "node:events";

import type { Alert } from "@shared/contracts";
import type { AlertDispatcher, DigestEntry } from "./alert-dispatcher";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DigestPayload {
  /** Window covered by this digest, derived from queued entries. */
  windowStart: number;
  windowEnd: number;
  totalAlerts: number;
  byCamera: Array<{
    cameraId: string;
    alerts: Alert[];
  }>;
  /** Pre-rendered subject — short, suitable for email/SMS/webhook title. */
  subject: string;
  /** Pre-rendered markdown body. */
  bodyMarkdown: string;
  /** Pre-rendered plaintext body. */
  bodyText: string;
}

export interface DigestSender {
  send(payload: DigestPayload): Promise<{ ok: boolean; details?: unknown }>;
}

export interface DigestMailerOptions {
  intervalHours?: number;
  /** Hard upper bound to prevent silent "no digest for days" misconfig. */
  maxIntervalHours?: number;
  /** Coalesce a burst of immediate-email entries into a single send. */
  immediateFlushDebounceMs?: number;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  logger?: { warn: (msg: string, meta?: unknown) => void };
}

export interface DigestFlushResult {
  attempted: boolean;
  ok: boolean;
  totalAlerts: number;
  /** Reason a tick produced no send, when `attempted` is false. */
  reason?: "empty" | "stopped";
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const NOOP_LOGGER = { warn: () => {} };
const DEFAULT_INTERVAL_HOURS = 6;
const DEFAULT_MAX_INTERVAL_HOURS = 12;
const DEFAULT_IMMEDIATE_DEBOUNCE_MS = 5_000;

export class DigestMailer extends EventEmitter {
  private readonly dispatcher: AlertDispatcher;
  private readonly sender: DigestSender;
  private readonly intervalMs: number;
  private readonly immediateDebounceMs: number;
  private readonly now: () => number;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => unknown;
  private readonly clearTimeoutFn: (handle: unknown) => void;
  private readonly logger: NonNullable<DigestMailerOptions["logger"]>;

  private tickHandle: unknown = null;
  private debounceHandle: unknown = null;
  private running = false;
  private detachDispatcher: (() => void) | null = null;

  /** Last failed payload, retained for operator inspection. */
  lastFailure: { at: number; payload: DigestPayload; details?: unknown } | null = null;

  constructor(dispatcher: AlertDispatcher, sender: DigestSender, options: DigestMailerOptions = {}) {
    super();
    this.dispatcher = dispatcher;
    this.sender = sender;

    const requested = options.intervalHours ?? DEFAULT_INTERVAL_HOURS;
    const cap = options.maxIntervalHours ?? DEFAULT_MAX_INTERVAL_HOURS;
    const clamped = Math.max(0.05, Math.min(requested, cap));
    this.intervalMs = Math.round(clamped * 60 * 60 * 1000);

    this.immediateDebounceMs = options.immediateFlushDebounceMs ?? DEFAULT_IMMEDIATE_DEBOUNCE_MS;
    this.now = options.now ?? (() => Date.now());
    this.setTimeoutFn = options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = options.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.logger = options.logger ?? NOOP_LOGGER;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Watch the dispatcher for `email` entries that requested immediate flush.
    const onDispatched = (result: { channels: string[] }): void => {
      if (result.channels.includes("email")) {
        this.scheduleImmediateFlush();
      }
    };
    this.dispatcher.on("dispatched", onDispatched);
    this.detachDispatcher = () => this.dispatcher.off("dispatched", onDispatched);

    this.scheduleNextTick();
  }

  stop(): void {
    this.running = false;
    if (this.tickHandle !== null) {
      this.clearTimeoutFn(this.tickHandle);
      this.tickHandle = null;
    }
    if (this.debounceHandle !== null) {
      this.clearTimeoutFn(this.debounceHandle);
      this.debounceHandle = null;
    }
    if (this.detachDispatcher) {
      this.detachDispatcher();
      this.detachDispatcher = null;
    }
  }

  /** Effective interval in ms — exposed for tests / observability. */
  getIntervalMs(): number {
    return this.intervalMs;
  }

  /**
   * Drain the dispatcher buffer and send. Public so callers can force an
   * immediate digest (e.g. settings UI "send now" button).
   */
  async flushNow(): Promise<DigestFlushResult> {
    if (!this.running) {
      return { attempted: false, ok: false, totalAlerts: 0, reason: "stopped" };
    }
    const entries = this.dispatcher.drainDigest();
    if (entries.length === 0) {
      return { attempted: false, ok: true, totalAlerts: 0, reason: "empty" };
    }
    const payload = renderDigest(entries, this.now());
    let ok = false;
    let details: unknown = undefined;
    try {
      const out = await this.sender.send(payload);
      ok = out.ok;
      details = out.details;
    } catch (err) {
      ok = false;
      details = err;
      this.logger.warn("DigestMailer: sender threw", { error: err });
    }
    if (!ok) {
      this.lastFailure = { at: this.now(), payload, details };
      this.emit("digest.failed", { payload, details });
    } else {
      this.lastFailure = null;
      this.emit("digest.sent", { payload });
    }
    return { attempted: true, ok, totalAlerts: entries.length };
  }

  // ---- scheduling -------------------------------------------------------

  private scheduleNextTick(): void {
    if (!this.running) return;
    this.tickHandle = this.setTimeoutFn(() => {
      this.tickHandle = null;
      void this.flushNow().finally(() => this.scheduleNextTick());
    }, this.intervalMs);
  }

  private scheduleImmediateFlush(): void {
    if (!this.running) return;
    if (this.debounceHandle !== null) return; // debounce in flight
    this.debounceHandle = this.setTimeoutFn(() => {
      this.debounceHandle = null;
      void this.flushNow();
    }, this.immediateDebounceMs);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Pure formatter — exported for tests and so other surfaces (UI preview,
 * "send now" endpoint) can render the same payload without instantiating a
 * mailer.
 */
export function renderDigest(entries: DigestEntry[], renderedAt: number): DigestPayload {
  const sorted = [...entries].sort((a, b) => a.queuedAt - b.queuedAt);
  const windowStart = sorted[0]?.queuedAt ?? renderedAt;
  const windowEnd = sorted[sorted.length - 1]?.queuedAt ?? renderedAt;

  const grouped = new Map<string, Alert[]>();
  for (const entry of sorted) {
    const key = entry.alert.cameraId ?? "_global";
    const bucket = grouped.get(key) ?? [];
    bucket.push(entry.alert);
    grouped.set(key, bucket);
  }

  const byCamera: DigestPayload["byCamera"] = [];
  // Stable order: cameraId asc, "_global" last for readability.
  const keys = Array.from(grouped.keys()).sort((a, b) => {
    if (a === "_global") return 1;
    if (b === "_global") return -1;
    return a.localeCompare(b);
  });
  for (const key of keys) {
    byCamera.push({ cameraId: key, alerts: grouped.get(key)! });
  }

  const subject = `Guarddog digest — ${entries.length} alert${entries.length === 1 ? "" : "s"}`;

  const lines: string[] = [];
  lines.push(`# ${subject}`);
  lines.push("");
  lines.push(`Window: ${new Date(windowStart).toISOString()} → ${new Date(windowEnd).toISOString()}`);
  lines.push("");
  for (const group of byCamera) {
    const label = group.cameraId === "_global" ? "System" : group.cameraId;
    lines.push(`## ${label} (${group.alerts.length})`);
    for (const a of group.alerts) {
      const link = a.deepLink ? ` — [open](${a.deepLink})` : "";
      lines.push(`- **${a.title}** — ${a.body}${link}`);
    }
    lines.push("");
  }
  const bodyMarkdown = lines.join("\n").trimEnd();

  const textLines: string[] = [];
  textLines.push(subject);
  textLines.push(`Window: ${new Date(windowStart).toISOString()} -> ${new Date(windowEnd).toISOString()}`);
  textLines.push("");
  for (const group of byCamera) {
    const label = group.cameraId === "_global" ? "System" : group.cameraId;
    textLines.push(`${label} (${group.alerts.length}):`);
    for (const a of group.alerts) {
      textLines.push(`  - ${a.title}: ${a.body}${a.deepLink ? ` (${a.deepLink})` : ""}`);
    }
    textLines.push("");
  }
  const bodyText = textLines.join("\n").trimEnd();

  return {
    windowStart,
    windowEnd,
    totalAlerts: entries.length,
    byCamera,
    subject,
    bodyMarkdown,
    bodyText,
  };
}

// ---------------------------------------------------------------------------
// Senders
// ---------------------------------------------------------------------------

/** No-op sender — useful as a default in tests / when no transport is configured. */
export function createNoopDigestSender(): DigestSender {
  return {
    async send() {
      return { ok: true };
    },
  };
}

/**
 * Adapter that POSTs the digest to a generic webhook URL. Kept as a factory
 * (rather than reading process.env at import time) so the mailer module can
 * be safely imported from any context without side effects.
 */
export function createWebhookDigestSender(url: string, fetchImpl: typeof fetch = fetch): DigestSender {
  return {
    async send(payload: DigestPayload) {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: payload.subject,
          totalAlerts: payload.totalAlerts,
          windowStart: payload.windowStart,
          windowEnd: payload.windowEnd,
          byCamera: payload.byCamera.map((g) => ({
            cameraId: g.cameraId,
            alerts: g.alerts,
          })),
          bodyMarkdown: payload.bodyMarkdown,
          bodyText: payload.bodyText,
        }),
      });
      return { ok: res.ok, details: { status: res.status } };
    },
  };
}
