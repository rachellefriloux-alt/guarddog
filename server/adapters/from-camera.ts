/**
 * Phase 2 — Bridge between the existing DB-backed `Camera` row and the
 * Phase-2 `CameraAdapter` interface.
 *
 * The dashboard already persists cameras in `storage` with a `type` of
 * `ring`, `esee`, or `generic`. To bring those records into the new
 * `StreamSupervisor` / `AlertPipeline` machinery without rewriting every
 * legacy code path, this module provides a single pure factory:
 *
 *     cameraAdapterFromCamera(camera) → CameraAdapter
 *
 * URL construction mirrors `server/services/stream-service.ts` exactly so
 * the supervisor probes the *same* endpoint the recorder will eventually
 * stream from. Any drift between the two is a bug.
 *
 * Pure / testable:
 *   - No I/O at construction time.
 *   - All env reads happen up-front through an injectable `env` map so tests
 *     can drive the factory deterministically.
 *   - Returns `null` (with a log) for camera rows that lack the minimum
 *     reachable info — never throws, so a single bad row can't break the
 *     whole supervisor.
 */

import {
  GenericRtspAdapter,
  type RtspStreamSpec,
} from "./generic-rtsp-adapter";
import type { CameraAdapter } from "./camera-adapter";
import type { Camera } from "@shared/schema";
import type { CameraSource } from "@shared/contracts";

export interface FromCameraOptions {
  /**
   * Environment map. Defaults to `process.env`. Tests pass an empty object
   * to make behaviour fully deterministic.
   */
  env?: Record<string, string | undefined>;
  /**
   * Logger for "skipped this camera" warnings. Defaults to `console.warn`.
   * Tests pass a vi.fn() to assert the warning text.
   */
  warn?: (msg: string) => void;
  /**
   * Forwarded to the underlying `GenericRtspAdapter` so the supervisor's
   * health-poll cadence can govern probe timeouts. Defaults to 2 000 ms.
   */
  probeTimeoutMs?: number;
}

/**
 * Slugify a Ring camera name to match the topic the local Ring-MQTT bridge
 * publishes. Identical to `stream-service.ts#toRingCameraPath` so a single
 * source of truth governs the URL contract.
 */
export function toRingCameraPath(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "front_door";
}

/**
 * Build the RTSP URL for a `generic` / `esee` camera using the same scheme
 * as `stream-service.ts#buildRTSPUrl`.
 */
function buildLegacyRtspUrl(camera: Camera): string {
  const auth =
    camera.username && camera.password
      ? `${encodeURIComponent(camera.username)}:${encodeURIComponent(camera.password)}@`
      : "";
  const port = camera.port || "554";
  const path = camera.type === "esee" ? "/cam/realmonitor?channel=1&subtype=0" : "/live";
  return `rtsp://${auth}${camera.ipAddress}:${port}${path}`;
}

/**
 * Build the RTSP URL the local Ring-MQTT bridge publishes for `camera.name`.
 * Honours `RING_RTSP_URL` (full override) and `RING_RTSP_BASE_URL`
 * (path is appended). Defaults to `rtsp://127.0.0.1:8554/<slug>`.
 */
function buildRingRtspUrl(camera: Camera, env: Record<string, string | undefined>): string {
  const fullOverride = env.RING_RTSP_URL?.trim();
  if (fullOverride) return fullOverride;
  const base = (env.RING_RTSP_BASE_URL || "rtsp://127.0.0.1:8554").replace(/\/+$/, "");
  return `${base}/${toRingCameraPath(camera.name)}`;
}

/**
 * Map the legacy `camera.type` string onto a Phase-2 `CameraSource`.
 * Anything we don't recognise becomes `generic` so the rest of the system
 * still works — but we log a warning so the operator notices.
 */
function resolveSource(type: string, warn: (m: string) => void): CameraSource {
  switch (type) {
    case "ring":
    case "esee":
    case "onvif":
    case "generic":
      return type;
    default:
      warn(`[from-camera] unknown camera.type=${JSON.stringify(type)}, treating as generic`);
      return "generic";
  }
}

/**
 * Construct a `CameraAdapter` for a single legacy `Camera` row, or return
 * `null` if the row lacks the minimum data required to reach the device.
 * Never throws — invalid rows are logged and skipped so the supervisor
 * boots cleanly even with a partially mis-configured database.
 */
export function cameraAdapterFromCamera(
  camera: Camera,
  options: FromCameraOptions = {},
): CameraAdapter | null {
  const env = options.env ?? process.env;
  const warn = options.warn ?? ((msg: string) => console.warn(msg));

  const source = resolveSource(camera.type, warn);

  let mainUrl: string;
  if (source === "ring") {
    mainUrl = buildRingRtspUrl(camera, env);
  } else {
    // For non-ring sources prefer the explicit `streamUrl` if it's a real
    // RTSP URL; otherwise build one from ipAddress/port/auth.
    const explicit = camera.streamUrl?.trim();
    if (explicit && /^rtsp:\/\//i.test(explicit)) {
      mainUrl = explicit;
    } else if (camera.ipAddress) {
      mainUrl = buildLegacyRtspUrl(camera);
    } else {
      warn(
        `[from-camera] skipping camera ${camera.id} (${camera.name}): no rtsp streamUrl and no ipAddress`,
      );
      return null;
    }
  }

  const main: RtspStreamSpec = { url: mainUrl };
  // Resolution is stored as a string like "1080p" in the legacy schema.
  // Translate the well-known values into width/height so the UI can show
  // honest metadata. Anything else is left undefined (no fake numbers).
  switch (camera.resolution) {
    case "4k":
    case "2160p":
      main.width = 3840;
      main.height = 2160;
      break;
    case "1440p":
    case "2k":
      main.width = 2560;
      main.height = 1440;
      break;
    case "1080p":
      main.width = 1920;
      main.height = 1080;
      break;
    case "720p":
      main.width = 1280;
      main.height = 720;
      break;
    case "480p":
      main.width = 854;
      main.height = 480;
      break;
  }

  try {
    return new GenericRtspAdapter({
      cameraId: camera.id,
      name: camera.name,
      location: camera.location,
      source,
      streams: { main },
      capabilities: {
        // Conservative defaults — only flag what we can prove from the row.
        motionEvents: Boolean(camera.aiDetectionEnabled),
        doorbell: source === "ring",
      },
      probeTimeoutMs: options.probeTimeoutMs,
    });
  } catch (err) {
    warn(
      `[from-camera] skipping camera ${camera.id} (${camera.name}): ${(err as Error).message}`,
    );
    return null;
  }
}

/**
 * Convenience: bulk-build adapters from a list of `Camera` rows. Drops any
 * rows that fail to construct (those are already logged by the per-row
 * factory). Useful when populating the supervisor at boot.
 */
export function cameraAdaptersFromCameras(
  cameras: readonly Camera[],
  options: FromCameraOptions = {},
): CameraAdapter[] {
  const out: CameraAdapter[] = [];
  for (const c of cameras) {
    const a = cameraAdapterFromCamera(c, options);
    if (a) out.push(a);
  }
  return out;
}
