/**
 * Phase 2 — Generic RTSP `CameraAdapter`.
 *
 * Concrete adapter that fronts any IP camera reachable over RTSP. It performs
 * a cheap TCP probe of the configured RTSP host:port to derive `CameraHealth`
 * — full RTSP DESCRIBE / OPTIONS handshakes belong to the recorder /
 * ffmpeg pipeline downstream and would be wasted bandwidth here.
 *
 * Design choices:
 *   - **No I/O in the constructor.** All sockets are opened in `connect()` /
 *     `health()` so the adapter is safe to instantiate during DI wiring.
 *   - **Deterministic.** Clock, TCP probe, and timer functions are injectable
 *     so tests can drive the adapter without real network or wall-clock time
 *     (mirrors the `StreamSupervisor` test pattern).
 *   - **No silent fallbacks.** A failed probe sets state to `degraded` (after
 *     the first success) or `offline` (before any success), and surfaces the
 *     underlying error via `CameraHealth.message`. The supervisor decides
 *     when to escalate — this adapter never lies about reachability.
 *   - **Idempotent lifecycle.** `connect()`, `reconnect()`, and `dispose()`
 *     can be called repeatedly without leaking timers or emitters.
 */

import { EventEmitter } from "node:events";
import net from "node:net";

import {
  cameraHealthSchema,
  cameraContractSchema,
  streamSchema,
  type CameraCapabilities,
  type CameraContract,
  type CameraHealth,
  type CameraSource,
  type Stream,
  type StreamProtocol,
  type StreamQuality,
} from "@shared/contracts";
import type { CameraAdapter } from "./camera-adapter";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RtspStreamSpec {
  /** RTSP URL — e.g. `rtsp://user:pass@10.0.0.42:554/Streaming/Channels/101`. */
  url: string;
  /** Optional resolution / bitrate metadata, surfaced to the UI verbatim. */
  width?: number;
  height?: number;
  framerate?: number;
  bitrateKbps?: number;
}

export interface GenericRtspAdapterOptions {
  cameraId: string;
  /** Friendly name surfaced in `describe()`. */
  name: string;
  /** Free-form location string (room / zone). */
  location: string;
  /**
   * Stream descriptors keyed by quality. `main` is required; `sub` and
   * `audio` are optional. The supervisor will request `sub` first to fit
   * the always-on grid bandwidth budget.
   */
  streams: Partial<Record<StreamQuality, RtspStreamSpec>> & { main: RtspStreamSpec };
  /** Reported capabilities (overrides the conservative defaults). */
  capabilities?: Partial<CameraCapabilities>;
  /** Provider tag — defaults to `generic`. */
  source?: CameraSource;
  /** TCP probe timeout in ms (default 2 000). */
  probeTimeoutMs?: number;
  /**
   * After this many consecutive failed probes the state degrades from
   * `degraded` to `offline`. Default 3 — supervisor still owns the broader
   * offline-threshold escalation.
   */
  offlineAfterConsecutiveFailures?: number;
  /** Time provider — overridable for tests. */
  now?: () => number;
  /**
   * TCP probe — overridable for tests. Returns a promise that resolves on
   * connect (within `probeTimeoutMs`) or rejects with the underlying error.
   */
  probe?: (host: string, port: number, timeoutMs: number) => Promise<void>;
}

const DEFAULT_CAPABILITIES: CameraCapabilities = {
  twoWayAudio: false,
  ptz: false,
  doorbell: false,
  motionEvents: false,
  nightVision: false,
  substream: false,
  snapshot: true,
};

const DEFAULT_PROBE_TIMEOUT_MS = 2_000;
const DEFAULT_OFFLINE_AFTER_FAILS = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedRtsp {
  host: string;
  port: number;
}

/**
 * Best-effort RTSP URL parse. We deliberately do *not* use `new URL()` against
 * `rtsp://` directly because Node's URL parser drops the auth portion in a way
 * that masks credentials in error logs — and we'd then need to re-assemble it
 * for `getStream()`. We need only host + port for the TCP probe.
 */
export function parseRtspHostPort(url: string): ParsedRtsp {
  if (typeof url !== "string" || !url.toLowerCase().startsWith("rtsp://")) {
    throw new Error(`Not an rtsp:// URL: ${redact(url)}`);
  }
  // Strip scheme + any optional userinfo, then take everything before the path.
  const afterScheme = url.slice("rtsp://".length);
  const slashIdx = afterScheme.indexOf("/");
  const authority = slashIdx === -1 ? afterScheme : afterScheme.slice(0, slashIdx);
  const atIdx = authority.lastIndexOf("@");
  const hostPort = atIdx === -1 ? authority : authority.slice(atIdx + 1);
  if (!hostPort) throw new Error(`Missing host in rtsp URL: ${redact(url)}`);

  // Support IPv6 in brackets: `[::1]:554`
  if (hostPort.startsWith("[")) {
    const endBracket = hostPort.indexOf("]");
    if (endBracket === -1) throw new Error(`Malformed IPv6 host: ${redact(url)}`);
    const host = hostPort.slice(1, endBracket);
    const rest = hostPort.slice(endBracket + 1);
    const port = rest.startsWith(":") ? Number(rest.slice(1)) : 554;
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid port in rtsp URL: ${redact(url)}`);
    }
    return { host, port };
  }

  const colonIdx = hostPort.lastIndexOf(":");
  if (colonIdx === -1) return { host: hostPort, port: 554 };
  const host = hostPort.slice(0, colonIdx);
  const portStr = hostPort.slice(colonIdx + 1);
  const port = Number(portStr);
  if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid host:port in rtsp URL: ${redact(url)}`);
  }
  return { host, port };
}

/** Strip any `user:pass@` segment so URLs in errors / logs never leak creds. */
export function redact(url: string): string {
  if (typeof url !== "string") return "";
  return url.replace(/^(rtsps?:\/\/)([^/@\s]+)@/i, "$1***@");
}

/** Default TCP probe — opens a socket, errors out after `timeoutMs`. */
function defaultProbe(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(Math.max(1, timeoutMs));
    socket.once("connect", () => finish());
    socket.once("timeout", () => finish(new Error(`probe timeout after ${timeoutMs}ms`)));
    socket.once("error", (err) => finish(err));
    try {
      socket.connect(port, host);
    } catch (err) {
      finish(err as Error);
    }
  });
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class GenericRtspAdapter implements CameraAdapter {
  readonly cameraId: string;
  readonly source: CameraSource;
  readonly capabilities: CameraCapabilities;

  private readonly name: string;
  private readonly location: string;
  private readonly streams: Partial<Record<StreamQuality, RtspStreamSpec>> & {
    main: RtspStreamSpec;
  };
  private readonly probeTimeoutMs: number;
  private readonly offlineAfterFails: number;
  private readonly now: () => number;
  private readonly probe: (host: string, port: number, timeoutMs: number) => Promise<void>;

  private readonly emitter = new EventEmitter();
  private connected = false;
  private disposed = false;
  private consecutiveFails = 0;
  private reconnectAttempts = 0;
  private lastSeenAtMs: number | null = null;
  private lastMessage: string | undefined;
  /** Tracks whether the most recent emitted online/offline edge was "online". */
  private lastEmittedOnline: boolean | null = null;

  constructor(opts: GenericRtspAdapterOptions) {
    if (!opts.cameraId) throw new Error("GenericRtspAdapter: cameraId required");
    if (!opts.streams || !opts.streams.main) {
      throw new Error("GenericRtspAdapter: streams.main required");
    }
    // Validate every URL up-front so misconfiguration fails loudly at boot.
    parseRtspHostPort(opts.streams.main.url);
    if (opts.streams.sub) parseRtspHostPort(opts.streams.sub.url);
    if (opts.streams.audio) parseRtspHostPort(opts.streams.audio.url);

    this.cameraId = opts.cameraId;
    this.source = opts.source ?? "generic";
    this.capabilities = {
      ...DEFAULT_CAPABILITIES,
      ...(opts.capabilities ?? {}),
      // Auto-flag substream capability when a sub URL is provided.
      substream: Boolean(opts.streams.sub) || Boolean(opts.capabilities?.substream),
    };
    this.name = opts.name;
    this.location = opts.location;
    this.streams = opts.streams;
    this.probeTimeoutMs = opts.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
    this.offlineAfterFails = Math.max(1, opts.offlineAfterConsecutiveFailures ?? DEFAULT_OFFLINE_AFTER_FAILS);
    this.now = opts.now ?? Date.now;
    this.probe = opts.probe ?? defaultProbe;
  }

  async connect(): Promise<void> {
    if (this.disposed) throw new Error(`adapter ${this.cameraId} disposed`);
    if (this.connected) return; // idempotent
    await this.probeOrThrow();
    this.connected = true;
    this.markOnline();
  }

  async describe(): Promise<CameraContract> {
    const streamList: Stream[] = [];
    for (const quality of ["main", "sub", "audio"] as const) {
      const spec = this.streams[quality];
      if (!spec) continue;
      const parsed: Stream = streamSchema.parse({
        id: `${this.cameraId}:${quality}`,
        cameraId: this.cameraId,
        quality,
        protocol: "rtsp" satisfies StreamProtocol,
        url: spec.url,
        width: spec.width,
        height: spec.height,
        framerate: spec.framerate,
        bitrateKbps: spec.bitrateKbps,
      });
      streamList.push(parsed);
    }
    return cameraContractSchema.parse({
      id: this.cameraId,
      name: this.name,
      source: this.source,
      location: this.location,
      capabilities: this.capabilities,
      streams: streamList,
    });
  }

  async getStream(quality: StreamQuality = "main"): Promise<Stream> {
    const spec = this.streams[quality] ?? this.streams.main;
    return streamSchema.parse({
      id: `${this.cameraId}:${quality}`,
      cameraId: this.cameraId,
      quality,
      protocol: "rtsp" satisfies StreamProtocol,
      url: spec.url,
      width: spec.width,
      height: spec.height,
      framerate: spec.framerate,
      bitrateKbps: spec.bitrateKbps,
    });
  }

  subscribeEvents(): EventEmitter {
    return this.emitter;
  }

  async health(): Promise<CameraHealth> {
    if (this.disposed) {
      return cameraHealthSchema.parse({
        cameraId: this.cameraId,
        state: "offline",
        lastSeenAt: this.lastSeenAtIso(),
        reconnectAttempts: this.reconnectAttempts,
        message: "disposed",
      });
    }
    try {
      await this.probeOrThrow();
      this.markOnline();
    } catch (err) {
      this.markFailure(err as Error);
    }

    return cameraHealthSchema.parse({
      cameraId: this.cameraId,
      state: this.deriveState(),
      lastSeenAt: this.lastSeenAtIso(),
      reconnectAttempts: this.reconnectAttempts,
      message: this.lastMessage,
    });
  }

  async reconnect(): Promise<void> {
    if (this.disposed) throw new Error(`adapter ${this.cameraId} disposed`);
    this.reconnectAttempts += 1;
    this.connected = false;
    await this.probeOrThrow();
    this.connected = true;
    this.markOnline();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.connected = false;
    this.emitter.removeAllListeners();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async probeOrThrow(): Promise<void> {
    const { host, port } = parseRtspHostPort(this.streams.main.url);
    try {
      await this.probe(host, port, this.probeTimeoutMs);
    } catch (err) {
      const wrapped = new Error(
        `RTSP probe to ${host}:${port} failed: ${(err as Error).message}`,
      );
      throw wrapped;
    }
  }

  private markOnline(): void {
    this.consecutiveFails = 0;
    this.reconnectAttempts = 0;
    this.lastSeenAtMs = this.now();
    this.lastMessage = undefined;
    if (this.lastEmittedOnline !== true) {
      this.lastEmittedOnline = true;
      this.emitter.emit("camera.online", this.cameraId);
    }
    this.emitter.emit("camera.health", this.snapshot());
  }

  private markFailure(err: Error): void {
    this.consecutiveFails += 1;
    this.connected = false;
    this.lastMessage = err.message;
    const state = this.deriveState();
    if (state === "offline" && this.lastEmittedOnline !== false) {
      this.lastEmittedOnline = false;
      this.emitter.emit("camera.offline", this.cameraId, err.message);
    }
    this.emitter.emit("camera.health", this.snapshot());
  }

  private deriveState(): CameraHealth["state"] {
    if (this.disposed) return "offline";
    if (this.consecutiveFails === 0 && this.lastSeenAtMs !== null) return "online";
    if (this.lastSeenAtMs === null) return "offline";
    if (this.consecutiveFails >= this.offlineAfterFails) return "offline";
    return "degraded";
  }

  private lastSeenAtIso(): string | null {
    return this.lastSeenAtMs === null ? null : new Date(this.lastSeenAtMs).toISOString();
  }

  private snapshot(): CameraHealth {
    return cameraHealthSchema.parse({
      cameraId: this.cameraId,
      state: this.deriveState(),
      lastSeenAt: this.lastSeenAtIso(),
      reconnectAttempts: this.reconnectAttempts,
      message: this.lastMessage,
    });
  }
}
