/**
 * Ring direct streamer.
 *
 * Streams a Ring camera's live feed directly via the embedded `ring-client-api`
 * — no external Ring-MQTT bridge required. The motivating use case is "view
 * my Ring cameras live in this app the same way the Ring app shows them",
 * with no operator setup beyond signing in.
 *
 * Mechanics:
 *   - Calls `RingCamera.streamVideo(ffmpegOptions)` to negotiate WebRTC with
 *     Ring, then has the library transcode the inbound RTP into HLS via
 *     ffmpeg. We supply the `output` args, including the on-disk paths.
 *   - Each device gets its own subdirectory under `<hlsRoot>/ring_<deviceId>`
 *     so the playlist + segment files are isolated and easy to clean up.
 *   - Sessions are idempotent: calling `start()` for a device that's already
 *     streaming returns the existing handle instead of opening a second
 *     SIP/WebRTC session against Ring (which they will throttle).
 *   - When the upstream session ends (`onCallEnded`), we auto-clean the
 *     entry from our session map so the next `start()` re-negotiates fresh.
 *   - All collaborators (the Ring client, the filesystem, the clock) are
 *     injectable so tests don't need a real Ring account or to spawn
 *     ffmpeg.
 */

import path from "path";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Minimum surface of a `ring-client-api` `StreamingSession` we depend on.
 * Keeping this narrow lets unit tests pass a fake instead of requiring the
 * full WebRTC stack.
 */
export interface RingStreamingSessionLike {
  stop(): void;
  /**
   * Library exposes `onCallEnded` as an RxJS `ReplaySubject<void>`. We only
   * need its `subscribe()` shape, so accept anything callable that hands us
   * a teardown function.
   */
  onCallEnded: { subscribe(fn: () => void): { unsubscribe?: () => void } | void };
}

/**
 * Just the bit of `RingCamera` we need: the ability to start a transcoded
 * stream given ffmpeg args.
 */
export interface RingCameraLike {
  id: number | string;
  streamVideo(opts: { output: Array<string | number> }): Promise<RingStreamingSessionLike>;
}

/**
 * Lookup function: given a Ring device id, resolve to a `RingCamera`. In
 * production this is implemented on top of `RingApi.getLocations()`; in
 * tests it's just a Map lookup.
 */
export type RingCameraResolver = (deviceId: string) => Promise<RingCameraLike | null>;

export interface RingDirectStreamerOptions {
  /** Root dir for HLS files. Each device gets a `ring_<deviceId>/` subdir. */
  hlsRoot: string;
  /** Resolves a Ring deviceId to a `RingCameraLike`. Required. */
  resolveCamera: RingCameraResolver;
  /**
   * Filesystem operations. Defaults to `node:fs/promises` + `node:fs.rmSync`.
   * Tests inject a stub.
   */
  fs?: {
    mkdir(dir: string, opts: { recursive: true }): Promise<unknown>;
    rm(dir: string, opts: { recursive: true; force: true }): Promise<unknown>;
  };
  /**
   * Optional URL prefix that gets returned to clients. Defaults to
   * `/api/stream/ring`. Tests can override to assert the shape.
   */
  publicUrlPrefix?: string;
}

export interface RingStreamHandle {
  deviceId: string;
  /** Per-device dir on disk where HLS files are written. */
  hlsDir: string;
  /** URL the client should hand to its HLS player. */
  hlsUrl: string;
  /** Underlying Ring streaming session (so callers can call `.stop()` if they own it). */
  session: RingStreamingSessionLike;
}

// ---------------------------------------------------------------------------
// FfmpegOptions builder (pure, easy to test)
// ---------------------------------------------------------------------------

export interface BuildOutputArgsInput {
  hlsDir: string;
  /** HLS segment target duration in seconds. Defaults to 2 (low-latency). */
  hlsSeconds?: number;
  /** How many segments to keep on disk. Defaults to 6 (~12 s window). */
  hlsListSize?: number;
}

/**
 * Build the ffmpeg `output` args that `RingCamera.streamVideo` will append
 * to its inbound video pipeline. Pure function, no I/O — used by both the
 * runtime path and the unit tests.
 *
 * Notes:
 *   - `delete_segments` keeps the on-disk window bounded; without it Ring
 *     cameras would slowly fill the recordings dir.
 *   - `-hls_segment_filename` is mandatory: without it ffmpeg writes to the
 *     CWD with default names. The original (broken) code in
 *     `RingAuthService.startLiveStream` was missing both this and the final
 *     playlist path, which is why nothing ever appeared on disk.
 */
export function buildHlsOutputArgs(input: BuildOutputArgsInput): string[] {
  const seconds = Math.max(1, input.hlsSeconds ?? 2);
  const listSize = Math.max(1, input.hlsListSize ?? 6);
  const playlist = path.join(input.hlsDir, "playlist.m3u8");
  const segPattern = path.join(input.hlsDir, "segment_%05d.ts");
  return [
    "-preset", "veryfast",
    "-g", "25",
    "-sc_threshold", "0",
    "-f", "hls",
    "-hls_time", String(seconds),
    "-hls_list_size", String(listSize),
    "-hls_flags", "delete_segments+independent_segments",
    "-hls_segment_filename", segPattern,
    playlist,
  ];
}

// ---------------------------------------------------------------------------
// Streamer
// ---------------------------------------------------------------------------

interface ActiveSession {
  handle: RingStreamHandle;
  /** Stops the underlying streaming session AND cleans the HLS dir. */
  teardown: () => Promise<void>;
}

/**
 * Per-device session manager. Construct one per process; production code
 * holds a singleton, tests construct a fresh instance with a fake camera
 * resolver.
 */
export class RingDirectStreamer {
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly fs: NonNullable<RingDirectStreamerOptions["fs"]>;
  private readonly publicUrlPrefix: string;

  constructor(private readonly options: RingDirectStreamerOptions) {
    // Default to the real filesystem but keep the indirection so tests can
    // inject a stub without monkey-patching `node:fs`.
    this.fs = options.fs ?? {
      mkdir: (dir, opts) => import("node:fs/promises").then((m) => m.mkdir(dir, opts)),
      rm: (dir, opts) => import("node:fs/promises").then((m) => m.rm(dir, opts)),
    };
    this.publicUrlPrefix = (options.publicUrlPrefix ?? "/api/stream/ring").replace(/\/+$/, "");
  }

  /** True if a session for this device is currently active. */
  isActive(deviceId: string): boolean {
    return this.sessions.has(deviceId);
  }

  /** Snapshot of currently-active deviceIds. Useful for /status endpoints. */
  active(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Start (or return the existing) HLS session for the given Ring device.
   * Idempotent — re-calling for an already-streaming device returns the
   * existing handle, never opens a second WebRTC session against Ring.
   */
  async start(deviceId: string, hlsOptions?: Omit<BuildOutputArgsInput, "hlsDir">): Promise<RingStreamHandle> {
    const existing = this.sessions.get(deviceId);
    if (existing) return existing.handle;

    const camera = await this.options.resolveCamera(deviceId);
    if (!camera) {
      throw new Error(`Ring camera ${deviceId} not found in this account`);
    }

    const hlsDir = path.join(this.options.hlsRoot, `ring_${deviceId}`);
    // Wipe any stale segments from a previous session so the new playlist
    // doesn't reference deleted files.
    await this.fs.rm(hlsDir, { recursive: true, force: true });
    await this.fs.mkdir(hlsDir, { recursive: true });

    const session = await camera.streamVideo({
      output: buildHlsOutputArgs({ hlsDir, ...hlsOptions }),
    });

    const handle: RingStreamHandle = {
      deviceId,
      hlsDir,
      hlsUrl: `${this.publicUrlPrefix}/${deviceId}/playlist.m3u8`,
      session,
    };

    let tornDown = false;
    let endedSub: { unsubscribe?: () => void } | void;
    const teardown = async () => {
      // Re-entrancy guard. `start()` -> `stop()` and the `onCallEnded`
      // listener can both call this, possibly racing. The flag is checked
      // synchronously before any await so concurrent callers see it set
      // before yielding the event loop.
      if (tornDown) return;
      tornDown = true;
      this.sessions.delete(deviceId);
      try {
        endedSub?.unsubscribe?.();
      } catch {
        /* ignore */
      }
      try {
        session.stop();
      } catch {
        /* ring-client-api may already have torn down */
      }
      try {
        await this.fs.rm(hlsDir, { recursive: true, force: true });
      } catch {
        /* best-effort: leave any in-flight reads alone */
      }
    };

    // Ring drops the call when the camera goes idle, the user picks up via
    // their phone, or anything else upstream. Auto-clean so the next
    // `start()` doesn't reuse a dead handle.
    endedSub = session.onCallEnded.subscribe(() => {
      void teardown();
    });

    this.sessions.set(deviceId, { handle, teardown });
    return handle;
  }

  /** Stop the session for a device. No-op if the device isn't streaming. */
  async stop(deviceId: string): Promise<void> {
    const entry = this.sessions.get(deviceId);
    if (!entry) return;
    await entry.teardown();
  }

  /** Stop every active session. Called during graceful shutdown. */
  async stopAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    await Promise.all(ids.map((id) => this.stop(id)));
  }
}
