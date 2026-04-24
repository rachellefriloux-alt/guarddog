/**
 * Phase 2 — Stream supervisor.
 *
 * Owns reconnect for every registered `CameraAdapter`:
 *   - exponential backoff with full jitter
 *   - circuit breaker (open / half-open / closed)
 *   - emits `camera.offline` after the configured threshold (default 3 min,
 *     matching the urgent alert in `alert-rules.ts`)
 *   - emits `camera.online` when an adapter recovers
 *   - publishes `CameraHealth` snapshots through the standard event bus
 *
 * Pure orchestration — does not perform network I/O itself; it drives
 * `adapter.connect()` / `adapter.health()` / `adapter.reconnect()`. This makes
 * the supervisor fully unit-testable with a fake clock and a fake adapter.
 */

import { EventEmitter } from "node:events";
import type { CameraAdapter } from "./camera-adapter";
import type { CameraHealth } from "@shared/contracts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SupervisorOptions {
  /**
   * Initial delay before the first reconnect attempt, ms.
   * Each subsequent attempt doubles up to `maxBackoffMs`.
   */
  initialBackoffMs?: number;
  /** Cap on the backoff schedule, ms. */
  maxBackoffMs?: number;
  /**
   * Time without a successful health check before the supervisor declares the
   * camera offline and emits the urgent `camera.offline` event. Defaults to
   * 180 000 ms (3 min) — matches the `urgent.camera-offline` alert rule.
   */
  offlineThresholdMs?: number;
  /**
   * Number of consecutive failures that trip the circuit breaker. Once tripped
   * the supervisor stops hammering the adapter and waits one full
   * `maxBackoffMs` window before going half-open.
   */
  circuitBreakerThreshold?: number;
  /** Health-poll interval while the adapter is online, ms. */
  healthPollIntervalMs?: number;
  /** Time provider — overridable for tests. */
  now?: () => number;
  /** Random source — overridable for tests. */
  random?: () => number;
  /** Timer scheduler — overridable for tests. */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  /** Cancel a pending timer — overridable for tests. */
  clearTimeout?: (handle: unknown) => void;
}

export interface ResolvedSupervisorOptions {
  initialBackoffMs: number;
  maxBackoffMs: number;
  offlineThresholdMs: number;
  circuitBreakerThreshold: number;
  healthPollIntervalMs: number;
  now: () => number;
  random: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export const SUPERVISOR_DEFAULTS: ResolvedSupervisorOptions = {
  initialBackoffMs: 1_000,
  maxBackoffMs: 60_000,
  offlineThresholdMs: 180_000,
  circuitBreakerThreshold: 5,
  healthPollIntervalMs: 15_000,
  now: () => Date.now(),
  random: () => Math.random(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as never),
};

// ---------------------------------------------------------------------------
// Backoff helper
// ---------------------------------------------------------------------------

/**
 * Full-jitter exponential backoff: pick a random value in
 * `[0, min(maxBackoffMs, initialBackoffMs * 2^attempt))`.
 *
 * Using full jitter (rather than equal jitter) avoids the thundering-herd
 * pattern when many adapters all start retrying at the same moment after a
 * network blip — see the AWS Architecture Blog "Exponential Backoff and
 * Jitter" reference.
 *
 * `attempt` is zero-indexed: attempt=0 returns a value in
 * `[0, initialBackoffMs)`.
 */
export function computeBackoffMs(
  attempt: number,
  opts: { initialBackoffMs: number; maxBackoffMs: number; random?: () => number },
): number {
  const rand = opts.random ?? Math.random;
  const safeAttempt = Math.max(0, Math.min(attempt, 30)); // guard 2**n overflow
  const exp = opts.initialBackoffMs * 2 ** safeAttempt;
  const ceiling = Math.min(opts.maxBackoffMs, exp);
  // Always at least 1 ms so tests can advance time deterministically.
  return Math.max(1, Math.floor(rand() * ceiling));
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export type CircuitState = "closed" | "open" | "half-open";

interface CameraEntry {
  adapter: CameraAdapter;
  state: "online" | "offline" | "connecting";
  circuit: CircuitState;
  failures: number;
  /** Epoch ms of the most recent successful health check / connect. */
  lastSuccessAt: number | null;
  /** Epoch ms when the supervisor started watching this entry. */
  supervisionStartedAt: number;
  /** Pending retry timer, if any. */
  retryHandle: unknown | null;
  /** Pending health-poll timer, if any. */
  pollHandle: unknown | null;
  /** True after the supervisor has emitted `camera.offline` for this entry. */
  offlineEmitted: boolean;
  /** Reason from the most recent failure, surfaced in `CameraHealth.message`. */
  lastFailureMessage?: string;
}

// ---------------------------------------------------------------------------
// Supervisor
// ---------------------------------------------------------------------------

export interface SupervisorEvents {
  "camera.online": (cameraId: string) => void;
  "camera.offline": (cameraId: string, reason: string) => void;
  "camera.health": (health: CameraHealth) => void;
}

export class StreamSupervisor extends EventEmitter {
  private readonly opts: ResolvedSupervisorOptions;
  private readonly entries = new Map<string, CameraEntry>();
  private disposed = false;

  constructor(options: SupervisorOptions = {}) {
    super();
    this.opts = { ...SUPERVISOR_DEFAULTS, ...options } as ResolvedSupervisorOptions;
  }

  /**
   * Register an adapter with the supervisor and kick off the initial connect.
   * Idempotent: registering the same `cameraId` twice replaces the prior
   * adapter (after disposing the previous entry's timers).
   */
  register(adapter: CameraAdapter): void {
    if (this.disposed) return;
    const existing = this.entries.get(adapter.cameraId);
    if (existing) this.cancelTimers(existing);

    const entry: CameraEntry = {
      adapter,
      state: "connecting",
      circuit: "closed",
      failures: 0,
      lastSuccessAt: null,
      supervisionStartedAt: this.opts.now(),
      retryHandle: null,
      pollHandle: null,
      offlineEmitted: false,
    };
    this.entries.set(adapter.cameraId, entry);
    void this.attemptConnect(entry);
  }

  /** Stop supervising a camera and dispose timers (does not call adapter.dispose). */
  unregister(cameraId: string): void {
    const entry = this.entries.get(cameraId);
    if (!entry) return;
    this.cancelTimers(entry);
    this.entries.delete(cameraId);
  }

  /** Snapshot of every supervised camera's circuit + state. */
  list(): Array<{
    cameraId: string;
    state: CameraEntry["state"];
    circuit: CircuitState;
    failures: number;
    lastSuccessAt: number | null;
  }> {
    return Array.from(this.entries.values()).map((e) => ({
      cameraId: e.adapter.cameraId,
      state: e.state,
      circuit: e.circuit,
      failures: e.failures,
      lastSuccessAt: e.lastSuccessAt,
    }));
  }

  /** Tear down all timers; supervisor is unusable afterwards. */
  dispose(): void {
    this.disposed = true;
    for (const entry of Array.from(this.entries.values())) this.cancelTimers(entry);
    this.entries.clear();
    this.removeAllListeners();
  }

  // ---- internals ---------------------------------------------------------

  private cancelTimers(entry: CameraEntry): void {
    if (entry.retryHandle) {
      this.opts.clearTimeout(entry.retryHandle);
      entry.retryHandle = null;
    }
    if (entry.pollHandle) {
      this.opts.clearTimeout(entry.pollHandle);
      entry.pollHandle = null;
    }
  }

  private async attemptConnect(entry: CameraEntry): Promise<void> {
    if (this.disposed) return;
    entry.state = "connecting";
    try {
      await entry.adapter.connect();
      this.markOnline(entry);
    } catch (err) {
      this.markFailure(entry, errorMessage(err));
    }
  }

  private markOnline(entry: CameraEntry): void {
    const wasOffline = entry.state === "offline" || entry.offlineEmitted;
    entry.state = "online";
    entry.failures = 0;
    entry.circuit = "closed";
    entry.lastSuccessAt = this.opts.now();
    entry.lastFailureMessage = undefined;

    if (wasOffline) {
      entry.offlineEmitted = false;
      this.emit("camera.online", entry.adapter.cameraId);
    }
    this.emitHealth(entry);
    this.schedulePoll(entry);
  }

  private markFailure(entry: CameraEntry, reason: string): void {
    entry.failures += 1;
    entry.lastFailureMessage = reason;
    if (entry.failures >= this.opts.circuitBreakerThreshold) {
      entry.circuit = "open";
    }

    // Declare offline once we've gone `offlineThresholdMs` without a success
    // since the supervisor started watching this camera (or since the last
    // confirmed-good moment).
    const now = this.opts.now();
    const referenceTs = entry.lastSuccessAt ?? entry.supervisionStartedAt;
    const offline = now - referenceTs >= this.opts.offlineThresholdMs;

    if (offline && !entry.offlineEmitted) {
      entry.state = "offline";
      entry.offlineEmitted = true;
      this.emit("camera.offline", entry.adapter.cameraId, reason);
    }
    this.emitHealth(entry);
    this.scheduleRetry(entry);
  }

  private scheduleRetry(entry: CameraEntry): void {
    if (this.disposed) return;
    if (entry.retryHandle) this.opts.clearTimeout(entry.retryHandle);

    // Open circuit: wait one full max-backoff window, then go half-open.
    const attempt = entry.failures;
    const delay =
      entry.circuit === "open"
        ? this.opts.maxBackoffMs
        : computeBackoffMs(attempt, {
            initialBackoffMs: this.opts.initialBackoffMs,
            maxBackoffMs: this.opts.maxBackoffMs,
            random: this.opts.random,
          });

    entry.retryHandle = this.opts.setTimeout(() => {
      entry.retryHandle = null;
      if (entry.circuit === "open") entry.circuit = "half-open";
      void this.tryReconnect(entry);
    }, delay);
  }

  private async tryReconnect(entry: CameraEntry): Promise<void> {
    if (this.disposed || !this.entries.has(entry.adapter.cameraId)) return;
    entry.state = "connecting";
    try {
      await entry.adapter.reconnect();
      this.markOnline(entry);
    } catch (err) {
      this.markFailure(entry, errorMessage(err));
    }
  }

  private schedulePoll(entry: CameraEntry): void {
    if (this.disposed) return;
    if (entry.pollHandle) this.opts.clearTimeout(entry.pollHandle);
    entry.pollHandle = this.opts.setTimeout(
      () => void this.pollHealth(entry),
      this.opts.healthPollIntervalMs,
    );
  }

  private async pollHealth(entry: CameraEntry): Promise<void> {
    if (this.disposed || !this.entries.has(entry.adapter.cameraId)) return;
    entry.pollHandle = null;
    try {
      const health = await entry.adapter.health();
      if (health.state === "offline") {
        this.markFailure(entry, health.message ?? "health reported offline");
        return;
      }
      entry.lastSuccessAt = this.opts.now();
      entry.failures = 0;
      entry.circuit = "closed";
      this.emit("camera.health", health);
      this.schedulePoll(entry);
    } catch (err) {
      this.markFailure(entry, errorMessage(err));
    }
  }

  private emitHealth(entry: CameraEntry): void {
    const health: CameraHealth = {
      cameraId: entry.adapter.cameraId,
      state:
        entry.state === "online"
          ? "online"
          : entry.state === "offline"
            ? "offline"
            : "degraded",
      lastSeenAt: entry.lastSuccessAt
        ? new Date(entry.lastSuccessAt).toISOString()
        : null,
      reconnectAttempts: entry.failures,
      message: entry.lastFailureMessage,
    };
    this.emit("camera.health", health);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown error";
}
