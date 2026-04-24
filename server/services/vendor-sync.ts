/**
 * Vendor camera sync.
 *
 * Bridges externally-managed cameras (eSeeCloud, Ring) into the unified
 * `storage.cameras` collection. The dashboard, supervisor, alert pipeline,
 * and HLS streaming pipeline all read from `storage.cameras`, so until
 * vendor cameras are mirrored in there they're invisible to GuardDog —
 * which is exactly the "I have to use three different apps" problem this
 * module solves.
 *
 * Design notes:
 *   - Pure functions plus thin sync(...) helpers. No module-level singletons,
 *     no I/O at import time, every dependency is injectable so tests can run
 *     without spinning up the real Ring API or eSee service.
 *   - IDs are deterministic (`ring_<deviceId>`, `esee_<eseeId>`) so calling
 *     a sync endpoint twice updates rows in-place rather than duplicating
 *     them. This is what `IStorage.upsertCamera` is for.
 *   - Vendor sync only writes the *connection* portion of the camera row.
 *     User-controlled toggles (recording, AI detection) fall through to
 *     `upsertCamera`'s "preserve existing on null" behaviour so a re-sync
 *     never silently flips a user setting back to default.
 */

import type { InsertCamera } from "@shared/schema";
import type { IStorage } from "../storage";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Lowercase, snake_case slug used for the Ring-MQTT bridge URL path
 * (`rtsp://<bridge>/<slug>`). Mirrors `StreamService.toRingCameraPath` so
 * the URL we store here is the same one ffmpeg will pull when the user hits
 * "Start stream".
 */
export function ringCameraSlug(name: string): string {
  const normalized = (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "front_door";
}

/** Stable storage id derived from the vendor's own id. */
export function ringCameraId(deviceId: string): string {
  return `ring_${deviceId}`;
}
export function eseeCameraId(eseeId: string): string {
  return `esee_${eseeId}`;
}

// ---------------------------------------------------------------------------
// Ring sync
// ---------------------------------------------------------------------------

/** Minimum surface of a Ring device we care about for syncing. */
export interface RingDeviceLike {
  id: string;
  name: string;
  /** Ring deviceType ("doorbell_v3", "stickup_cam_battery", ...). */
  type?: string;
  location?: string;
  isOnline?: boolean;
  hasLiveStream?: boolean;
}

/** Minimum surface of `ringAuthService` we depend on. */
export interface RingClientLike {
  isConnected(): boolean;
  getDevices(): Promise<RingDeviceLike[]>;
}

export interface RingSyncOptions {
  /**
   * Base URL of the local Ring-MQTT bridge that re-publishes Ring streams as
   * RTSP. Defaults to `RING_RTSP_BASE_URL` then `rtsp://127.0.0.1:8554`.
   * Stored verbatim on `camera.streamUrl` (with the per-device slug
   * appended) — matches the URL `StreamService.setupRingStream` consumes.
   */
  ringRtspBaseUrl?: string;
}

export interface VendorSyncReport {
  /** Camera IDs that were created or updated by this run. */
  imported: string[];
  /** Vendor IDs we deliberately skipped, with the reason. */
  skipped: Array<{ id: string; reason: string }>;
  /** True if the vendor connector wasn't authenticated / had nothing to do. */
  vendorReady: boolean;
  /** Optional one-line operator advisory (e.g. "set RING_RTSP_BASE_URL"). */
  advisory?: string;
}

export async function syncRingCameras(
  client: RingClientLike,
  storage: IStorage,
  options: RingSyncOptions = {},
): Promise<VendorSyncReport> {
  if (!client.isConnected()) {
    return {
      imported: [],
      skipped: [],
      vendorReady: false,
      advisory: "Ring is not connected. Sign in under Account → Ring first.",
    };
  }

  const rawBase = options.ringRtspBaseUrl ?? process.env.RING_RTSP_BASE_URL ?? "rtsp://127.0.0.1:8554";
  // Trim trailing slashes without a regex — `/\/+$/` is flagged as a
  // polynomial-ReDoS pattern on user-controlled input even though it's
  // anchored at the end.
  let baseUrl = rawBase;
  while (baseUrl.length > 0 && baseUrl.charCodeAt(baseUrl.length - 1) === 47 /* '/' */) {
    baseUrl = baseUrl.slice(0, -1);
  }
  const advisory =
    !options.ringRtspBaseUrl && !process.env.RING_RTSP_BASE_URL && !process.env.RING_RTSP_URL
      ? "Using default Ring-MQTT bridge URL rtsp://127.0.0.1:8554. Set RING_RTSP_BASE_URL if your bridge runs elsewhere."
      : undefined;

  let devices: RingDeviceLike[];
  try {
    devices = await client.getDevices();
  } catch (err) {
    return {
      imported: [],
      skipped: [],
      vendorReady: true,
      advisory: `Failed to list Ring devices: ${(err as Error).message}`,
    };
  }

  const imported: string[] = [];
  const skipped: VendorSyncReport["skipped"] = [];

  for (const device of devices) {
    if (device.hasLiveStream === false) {
      skipped.push({ id: device.id, reason: "device has no live stream (e.g. chime)" });
      continue;
    }
    const slug = ringCameraSlug(device.name);
    const insert: InsertCamera = {
      type: "ring",
      name: device.name,
      // Ring cameras don't have an addressable LAN IP from our side — the
      // Ring-MQTT bridge fronts them — but `cameras.ipAddress` is NOT NULL,
      // so record the bridge host as a deterministic placeholder.
      ipAddress: bridgeHost(baseUrl),
      port: bridgePort(baseUrl),
      streamUrl: `${baseUrl}/${slug}`,
      location: device.location ?? "ring",
      isOnline: device.isOnline ?? true,
    };
    const id = ringCameraId(device.id);
    await storage.upsertCamera(id, insert);
    imported.push(id);
  }

  return { imported, skipped, vendorReady: true, advisory };
}

// ---------------------------------------------------------------------------
// eSee sync
// ---------------------------------------------------------------------------

/** Minimum surface of an eSee camera we care about. */
export interface EseeCameraLike {
  id: string;
  name: string;
  ip: string;
  port: number;
  username: string;
  password: string;
  status?: "online" | "offline";
  channels: Array<{ rtspUrl: string; enabled?: boolean }>;
}

/** Minimum surface of `eseeCloudService` we depend on. */
export interface EseeClientLike {
  isConnected(): boolean;
  getCameras(): Promise<EseeCameraLike[]>;
}

export async function syncEseeCameras(
  client: EseeClientLike,
  storage: IStorage,
): Promise<VendorSyncReport> {
  if (!client.isConnected()) {
    return {
      imported: [],
      skipped: [],
      vendorReady: false,
      advisory: "eSeeCloud has no cameras yet. Add one under Account → ESEE Cloud first.",
    };
  }

  let cameras: EseeCameraLike[];
  try {
    cameras = await client.getCameras();
  } catch (err) {
    return {
      imported: [],
      skipped: [],
      vendorReady: true,
      advisory: `Failed to list eSee cameras: ${(err as Error).message}`,
    };
  }

  const imported: string[] = [];
  const skipped: VendorSyncReport["skipped"] = [];

  for (const camera of cameras) {
    // Pick the first enabled channel with an RTSP URL — that's the "main"
    // stream the user will see in the dashboard tile. A future PR can let
    // the operator pick a specific channel.
    const channel =
      camera.channels?.find((c) => c.enabled !== false && c.rtspUrl) ??
      camera.channels?.find((c) => c.rtspUrl);
    if (!channel) {
      skipped.push({ id: camera.id, reason: "no usable RTSP channel" });
      continue;
    }
    const insert: InsertCamera = {
      type: "esee",
      name: camera.name,
      ipAddress: camera.ip,
      port: String(camera.port ?? 80),
      streamUrl: channel.rtspUrl,
      username: camera.username,
      password: camera.password,
      location: "esee",
      isOnline: camera.status !== "offline",
    };
    const id = eseeCameraId(camera.id);
    await storage.upsertCamera(id, insert);
    imported.push(id);
  }

  return { imported, skipped, vendorReady: true };
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function bridgeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname || "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}

function bridgePort(baseUrl: string): string {
  try {
    const port = new URL(baseUrl).port;
    return port || "8554";
  } catch {
    return "8554";
  }
}
