/**
 * Phase 1 — Common `CameraAdapter` interface.
 *
 * Every camera integration (Ring, eSeeCloud, ONVIF, generic RTSP, …) will
 * eventually implement this interface so the rest of the system (recorder,
 * AI pipeline, supervisor, UI) can treat all sources uniformly.
 *
 * This file is additive: existing services in `server/services/` continue to
 * work as-is. They will be migrated to implement `CameraAdapter` in Phase 2
 * (production camera ingestion). The interface lives here now so tests and
 * new code can already depend on it.
 */

import type { EventEmitter } from "node:events";
import type {
  CameraCapabilities,
  CameraContract,
  CameraHealth,
  CameraSource,
  Stream,
  StreamQuality,
} from "@shared/contracts";

/**
 * Events that adapters emit through `subscribeEvents()` (returned EventEmitter).
 * Topic names mirror `WS_TOPIC` so the supervisor can re-publish without remap.
 */
export interface CameraAdapterEvents {
  "camera.health": (health: CameraHealth) => void;
  "camera.online": (cameraId: string) => void;
  "camera.offline": (cameraId: string, reason: string) => void;
  /** Provider-native event (e.g. Ring doorbell press, ONVIF motion). */
  "camera.event": (payload: {
    cameraId: string;
    kind: string;
    detectedAt: string;
    meta?: Record<string, unknown>;
  }) => void;
}

/**
 * The minimal contract every camera source must implement. Adapters are
 * expected to be safe to call concurrently and to be idempotent for
 * `connect()` / `dispose()`.
 */
export interface CameraAdapter {
  /** Stable identifier for the underlying camera. */
  readonly cameraId: string;
  /** Provider tag — one of the `CameraSource` values. */
  readonly source: CameraSource;
  /** Capabilities reported by the device (drives UI affordances). */
  readonly capabilities: CameraCapabilities;

  /**
   * Establish the underlying connection (login, RTSP probe, MQTT subscribe…).
   * Should resolve once the adapter is ready to serve `getStream()` /
   * `subscribeEvents()`. Implementations must be idempotent.
   */
  connect(): Promise<void>;

  /**
   * Return the canonical contract view of this camera, including its
   * available streams (main / sub / audio).
   */
  describe(): Promise<CameraContract>;

  /**
   * Resolve a playable stream descriptor. The supervisor uses `quality="sub"`
   * for the always-on AI / grid feed and `quality="main"` only when expanded
   * or recording, to fit the upstream bandwidth budget.
   */
  getStream(quality?: StreamQuality): Promise<Stream>;

  /**
   * Subscribe to provider-native events. Returns an EventEmitter typed by
   * `CameraAdapterEvents`. Multiple subscribers are allowed.
   */
  subscribeEvents(): EventEmitter;

  /** Snapshot the current health state. Cheap; safe to poll. */
  health(): Promise<CameraHealth>;

  /**
   * Force a reconnect (e.g. after the supervisor's circuit-breaker trips).
   * Implementations should apply their own backoff before retrying.
   */
  reconnect(): Promise<void>;

  /** Tear down all resources. Adapter is unusable afterwards. */
  dispose(): Promise<void>;
}

/**
 * Type guard so existing services that don't yet implement the interface
 * can be safely detected during the Phase 2 migration.
 */
export function isCameraAdapter(value: unknown): value is CameraAdapter {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<CameraAdapter>;
  return (
    typeof v.cameraId === "string" &&
    typeof v.source === "string" &&
    typeof v.connect === "function" &&
    typeof v.describe === "function" &&
    typeof v.getStream === "function" &&
    typeof v.subscribeEvents === "function" &&
    typeof v.health === "function" &&
    typeof v.reconnect === "function" &&
    typeof v.dispose === "function"
  );
}
