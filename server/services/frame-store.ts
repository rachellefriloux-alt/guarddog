/**
 * Per-camera latest-frame store backing `GET /api/internal/cameras/:id/frame`.
 *
 * Phase 1 MVP from the master spec (ARCHITECTURE.md): the EseeCloud C90
 * cameras are P2P-only and not directly reachable, so a small capture agent
 * running alongside the official EseeCloud desktop app on the mini-PC POSTs
 * window-region JPEG frames to the backend at ~10–15 FPS. Sallie (AI) and
 * the web/Android clients then fetch the latest frame for a given cameraId
 * via HTTP. Ring cameras can later feed the same store from their decoded
 * stream — the contract is source-agnostic.
 *
 * This module owns the in-memory buffer:
 *   - Stores the most recent JPEG plus its capture timestamp and a monotonic
 *     sequence number (so consumers can detect freshness without comparing
 *     bytes).
 *   - Enforces a hard payload-size cap so a misbehaving agent can't OOM the
 *     server.
 *   - Treats frames older than a configurable TTL as stale (returns
 *     `undefined` from `get()` and omits the camera from `list()`), so AI
 *     consumers can't act on a still image from a crashed capture process.
 *   - Bounds the number of distinct cameraIds to prevent an unbounded map
 *     from growing if the agent sends garbage.
 *
 * No I/O. Unit-tested deterministically with an injectable clock.
 */

export interface CameraFrame {
  /** The JPEG payload as captured by the agent. */
  jpeg: Buffer;
  /** Wall-clock ms (from `now()`) when the backend received the frame. */
  capturedAt: number;
  /** Monotonic per-camera counter; increments on each successful `put`. */
  sequence: number;
}

export interface FrameStoreOptions {
  /** Frames older than this are considered stale. Defaults to 10 s. */
  staleAfterMs?: number;
  /**
   * Hard upper bound on a single JPEG payload. Defaults to 4 MiB which
   * comfortably fits a 4K screenshot at moderate quality.
   */
  maxFrameBytes?: number;
  /**
   * Cap on the number of distinct cameraIds tracked at once. When exceeded,
   * the oldest-touched camera is evicted. Defaults to 32 — well above the
   * "2 Ring + 4 EseeCloud" target setup from the blueprint.
   */
  maxCameras?: number;
  /** Injectable clock — tests pass a fake. Defaults to `Date.now`. */
  now?: () => number;
}

export type FramePutResult =
  | { ok: true; sequence: number }
  | { ok: false; reason: "empty" | "too-large"; bytes?: number; limit?: number };

/** Pure in-memory store. Construct one per process; routes hold a singleton. */
export class FrameStore {
  private readonly frames = new Map<string, CameraFrame>();
  /** Tracks insertion/update order for capacity-based eviction. */
  private readonly touchOrder: string[] = [];
  private readonly staleAfterMs: number;
  private readonly maxFrameBytes: number;
  private readonly maxCameras: number;
  private readonly now: () => number;
  private nextSequence = 1;

  constructor(opts: FrameStoreOptions = {}) {
    this.staleAfterMs = Math.max(1, opts.staleAfterMs ?? 10_000);
    this.maxFrameBytes = Math.max(1, opts.maxFrameBytes ?? 4 * 1024 * 1024);
    this.maxCameras = Math.max(1, opts.maxCameras ?? 32);
    this.now = opts.now ?? (() => Date.now());
  }

  /** Configured cap (bytes). Routes use this to short-circuit oversized POSTs early. */
  get maxBytes(): number {
    return this.maxFrameBytes;
  }

  /**
   * Ingest a frame for `cameraId`. Returns a discriminated result so the
   * route can map cleanly to HTTP status codes (400 / 413 / 200) without
   * the store needing to know about HTTP.
   */
  put(cameraId: string, jpeg: Buffer): FramePutResult {
    if (!jpeg || jpeg.length === 0) {
      return { ok: false, reason: "empty" };
    }
    if (jpeg.length > this.maxFrameBytes) {
      return { ok: false, reason: "too-large", bytes: jpeg.length, limit: this.maxFrameBytes };
    }
    const sequence = this.nextSequence++;
    const isNew = !this.frames.has(cameraId);
    this.frames.set(cameraId, {
      jpeg,
      capturedAt: this.now(),
      sequence,
    });
    this.bumpTouch(cameraId, isNew);
    this.evictIfOverCapacity();
    return { ok: true, sequence };
  }

  /**
   * Fetch the latest non-stale frame for `cameraId`, or `undefined` if no
   * frame exists or the most recent one is older than the staleness window.
   * Stale entries are eagerly removed so subsequent `list()` calls reflect
   * reality.
   */
  get(cameraId: string): CameraFrame | undefined {
    const frame = this.frames.get(cameraId);
    if (!frame) return undefined;
    if (this.now() - frame.capturedAt > this.staleAfterMs) {
      this.delete(cameraId);
      return undefined;
    }
    return frame;
  }

  /**
   * Snapshot of all currently-fresh cameras, with each entry's age in ms.
   * Stale entries are filtered out (and removed) so the AI engine never
   * sees a ghost camera.
   */
  list(): Array<{ cameraId: string; ageMs: number; sequence: number; bytes: number }> {
    const now = this.now();
    const out: Array<{ cameraId: string; ageMs: number; sequence: number; bytes: number }> = [];
    for (const [cameraId, frame] of Array.from(this.frames.entries())) {
      const age = now - frame.capturedAt;
      if (age > this.staleAfterMs) {
        this.delete(cameraId);
        continue;
      }
      out.push({ cameraId, ageMs: age, sequence: frame.sequence, bytes: frame.jpeg.length });
    }
    return out;
  }

  /** Drop a camera's buffered frame. Used by `get`/`list` for stale eviction and by tests. */
  delete(cameraId: string): boolean {
    const removed = this.frames.delete(cameraId);
    if (removed) {
      const i = this.touchOrder.indexOf(cameraId);
      if (i !== -1) this.touchOrder.splice(i, 1);
    }
    return removed;
  }

  /** Reset everything. Tests use this; production rarely needs it. */
  clear(): void {
    this.frames.clear();
    this.touchOrder.length = 0;
  }

  private bumpTouch(cameraId: string, isNew: boolean): void {
    if (!isNew) {
      const i = this.touchOrder.indexOf(cameraId);
      if (i !== -1) this.touchOrder.splice(i, 1);
    }
    this.touchOrder.push(cameraId);
  }

  private evictIfOverCapacity(): void {
    while (this.frames.size > this.maxCameras && this.touchOrder.length > 0) {
      const oldest = this.touchOrder.shift();
      if (oldest !== undefined) this.frames.delete(oldest);
    }
  }
}

// ---------------------------------------------------------------------------
// Process-wide singleton
// ---------------------------------------------------------------------------

let singleton: FrameStore | null = null;

/**
 * Lazy module-level singleton. Routes use this so all consumers share one
 * buffer; tests can call `resetFrameStore()` between cases for isolation.
 */
export function getFrameStore(): FrameStore {
  if (!singleton) singleton = new FrameStore();
  return singleton;
}

export function resetFrameStore(opts?: FrameStoreOptions): FrameStore {
  singleton = new FrameStore(opts);
  return singleton;
}

// ---------------------------------------------------------------------------
// CameraId validation
// ---------------------------------------------------------------------------

/**
 * Allowed cameraId pattern for the frame routes. We deliberately keep this
 * strict (alphanumerics, underscore, hyphen, dot) so the value can never
 * participate in path traversal and can't carry control bytes into log
 * lines.
 */
const CAMERA_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export function isValidCameraId(id: string): boolean {
  return typeof id === "string" && CAMERA_ID_RE.test(id);
}
