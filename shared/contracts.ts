/**
 * Phase 1 — Canonical domain contracts (single source of truth).
 *
 * These Zod schemas are the cross-process / cross-platform contract used by
 * the server, the web client, the Electron desktop, and the future native
 * mobile app. Existing Drizzle tables in `shared/schema.ts` continue to be
 * the database persistence layer; the schemas here describe the *runtime*
 * domain shapes that flow over REST / WebSocket / push payloads and that
 * later phases (recorder, retention engine, AI pipeline, alert router,
 * mobile app) all consume.
 *
 * Additive only — nothing here changes existing behavior.
 *
 * See the phased delivery plan for which phase consumes each contract:
 *   - Camera, Stream, CameraCapabilities → Phase 2 (camera ingestion)
 *   - Recording, Segment, RetentionPolicy → Phase 3 (24/7 recorder)
 *   - StorageTarget                       → Phase 4 (cloud backup)
 *   - Event, Detection, AlertRule         → Phase 5 (AI + alerts)
 *   - Alert, AlertChannel, PushEnvelope   → Phase 5 + Phase 6 (delivery)
 *   - User, Role, Session                 → Phase 7 (security)
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const idSchema = z.string().min(1);
export const isoTimestampSchema = z.string().datetime({ offset: true });

// ---------------------------------------------------------------------------
// Cameras + streams (Phase 2)
// ---------------------------------------------------------------------------

export const cameraSourceSchema = z.enum(["ring", "esee", "onvif", "generic"]);
export type CameraSource = z.infer<typeof cameraSourceSchema>;

export const streamQualitySchema = z.enum(["main", "sub", "audio"]);
export type StreamQuality = z.infer<typeof streamQualitySchema>;

export const streamProtocolSchema = z.enum(["rtsp", "hls", "webrtc", "mjpeg"]);
export type StreamProtocol = z.infer<typeof streamProtocolSchema>;

export const streamSchema = z.object({
  id: idSchema,
  cameraId: idSchema,
  quality: streamQualitySchema,
  protocol: streamProtocolSchema,
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  framerate: z.number().positive().optional(),
  bitrateKbps: z.number().positive().optional(),
});
export type Stream = z.infer<typeof streamSchema>;

export const cameraCapabilitiesSchema = z.object({
  twoWayAudio: z.boolean().default(false),
  ptz: z.boolean().default(false),
  doorbell: z.boolean().default(false),
  motionEvents: z.boolean().default(false),
  nightVision: z.boolean().default(false),
  substream: z.boolean().default(false),
  snapshot: z.boolean().default(true),
});
export type CameraCapabilities = z.infer<typeof cameraCapabilitiesSchema>;

export const cameraHealthStateSchema = z.enum([
  "online",
  "degraded",
  "offline",
  "unknown",
]);
export type CameraHealthState = z.infer<typeof cameraHealthStateSchema>;

export const cameraHealthSchema = z.object({
  cameraId: idSchema,
  state: cameraHealthStateSchema,
  /** ISO timestamp of the most recent successful frame / heartbeat. */
  lastSeenAt: isoTimestampSchema.nullable(),
  /** Wifi RSSI 0–100 (best-effort, may be omitted on wired or proxied feeds). */
  wifiStrength: z.number().min(0).max(100).optional(),
  /** Number of consecutive reconnect attempts since last success. */
  reconnectAttempts: z.number().int().min(0).default(0),
  message: z.string().optional(),
});
export type CameraHealth = z.infer<typeof cameraHealthSchema>;

export const cameraContractSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  source: cameraSourceSchema,
  location: z.string().min(1),
  capabilities: cameraCapabilitiesSchema,
  streams: z.array(streamSchema).default([]),
});
export type CameraContract = z.infer<typeof cameraContractSchema>;

// ---------------------------------------------------------------------------
// Recordings + segments + retention (Phase 3)
// ---------------------------------------------------------------------------

export const segmentKindSchema = z.enum(["continuous", "motion", "manual"]);
export type SegmentKind = z.infer<typeof segmentKindSchema>;

export const segmentSchema = z.object({
  id: idSchema,
  cameraId: idSchema,
  kind: segmentKindSchema,
  /** Absolute or storage-root-relative path to the MP4/fMP4 file. */
  path: z.string().min(1),
  startedAt: isoTimestampSchema,
  endedAt: isoTimestampSchema,
  durationSec: z.number().positive(),
  sizeBytes: z.number().int().nonnegative(),
  /** Set once the cloud target has acknowledged the upload. */
  cloudUrl: z.string().url().optional(),
  /** Optional hash for integrity / dedupe. */
  sha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, "must be a 64-char hex SHA-256")
    .optional(),
});
export type Segment = z.infer<typeof segmentSchema>;

export const recordingContractSchema = z.object({
  id: idSchema,
  cameraId: idSchema,
  segments: z.array(segmentSchema).default([]),
  /** Aggregate duration across all segments, seconds. */
  totalDurationSec: z.number().nonnegative().default(0),
});
export type RecordingContract = z.infer<typeof recordingContractSchema>;

/**
 * Confirmed retention policy: 200 days full footage, 180 days motion clips.
 * Storage-warning thresholds match the alert matrix (urgent <10%, warn 20–30%).
 */
export const retentionPolicySchema = z.object({
  fullFootageDays: z.number().int().positive().default(200),
  motionClipDays: z.number().int().positive().default(180),
  storageUrgentPct: z.number().min(0).max(100).default(10),
  storageWarnPct: z.number().min(0).max(100).default(25),
  /** Per-camera overrides (cameraId → policy patch). */
  perCamera: z
    .record(
      idSchema,
      z
        .object({
          fullFootageDays: z.number().int().positive().optional(),
          motionClipDays: z.number().int().positive().optional(),
        })
        .partial(),
    )
    .default({}),
});
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

// ---------------------------------------------------------------------------
// Storage targets (Phase 4)
// ---------------------------------------------------------------------------

export const storageTargetKindSchema = z.enum([
  "local",
  "sync-folder",
  "google-drive-api",
  "onedrive-api",
  "s3-compatible",
]);
export type StorageTargetKind = z.infer<typeof storageTargetKindSchema>;

export const storageTargetSchema = z.object({
  id: idSchema,
  kind: storageTargetKindSchema,
  label: z.string().min(1),
  /** Filesystem path for local / sync-folder; bucket or root folder id otherwise. */
  rootPath: z.string().min(1),
  /** Hard ceiling on monthly upload (GB). 0 = unlimited. */
  monthlyUploadCapGb: z.number().nonnegative().default(0),
  /** Hard ceiling on remote storage (GB). 0 = unlimited. */
  storageCapGb: z.number().nonnegative().default(0),
  /** Throttle for API uploaders, percent of measured upstream bandwidth. */
  bandwidthThrottlePct: z.number().min(0).max(100).default(50),
  /** When true, full footage is mirrored as well as motion clips. */
  mirrorFullFootage: z.boolean().default(false),
});
export type StorageTarget = z.infer<typeof storageTargetSchema>;

// ---------------------------------------------------------------------------
// Events, detections, alerts (Phase 5)
// ---------------------------------------------------------------------------

export const detectionClassSchema = z.enum([
  "person",
  "vehicle",
  "package",
  "pet",
  "animal",
  "face",
  "doorbell",
  "motion",
  "tamper",
  "unknown",
]);
export type DetectionClass = z.infer<typeof detectionClassSchema>;

export const boundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});
export type BoundingBox = z.infer<typeof boundingBoxSchema>;

export const detectionContractSchema = z.object({
  id: idSchema,
  cameraId: idSchema,
  eventId: idSchema.optional(),
  class: detectionClassSchema,
  confidence: z.number().min(0).max(1),
  bbox: boundingBoxSchema.optional(),
  zoneId: idSchema.optional(),
  description: z.string().optional(),
  detectedAt: isoTimestampSchema,
});
export type DetectionContract = z.infer<typeof detectionContractSchema>;

export const eventKindSchema = z.enum([
  "motion",
  "person",
  "doorbell-press",
  "package-delivered",
  "vehicle-arrival",
  "tamper",
  "camera-offline",
  "camera-online",
  "storage-warning",
  "storage-critical",
  "burst",
  "system-health",
]);
export type EventKind = z.infer<typeof eventKindSchema>;

export const eventContractSchema = z.object({
  id: idSchema,
  kind: eventKindSchema,
  cameraId: idSchema.optional(),
  /** Snapshot of detections that produced this event. */
  detections: z.array(detectionContractSchema).default([]),
  /** Optional thumbnail data URL or storage path. */
  snapshotUrl: z.string().optional(),
  /** Optional motion clip (Segment.id). */
  clipSegmentId: idSchema.optional(),
  startedAt: isoTimestampSchema,
  endedAt: isoTimestampSchema.optional(),
  /** Free-form structured metadata (zone names, AI summary, etc.). */
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type EventContract = z.infer<typeof eventContractSchema>;

// ---------------------------------------------------------------------------
// Alerts (Phase 5 routing, Phase 6 delivery)
// ---------------------------------------------------------------------------

export const alertUrgencySchema = z.enum(["urgent", "non-urgent"]);
export type AlertUrgency = z.infer<typeof alertUrgencySchema>;

export const alertChannelSchema = z.enum([
  "push",
  "email",
  "email-digest",
  "sms",
  "webhook",
  "ntfy",
  "discord",
  "pushover",
  "none",
]);
export type AlertChannel = z.infer<typeof alertChannelSchema>;

export const alertSchema = z.object({
  id: idSchema,
  ruleId: z.string().min(1),
  urgency: alertUrgencySchema,
  title: z.string().min(1),
  body: z.string(),
  channels: z.array(alertChannelSchema),
  eventId: idSchema.optional(),
  cameraId: idSchema.optional(),
  snapshotUrl: z.string().optional(),
  /** Deep link the native app / desktop opens when the user taps the alert. */
  deepLink: z.string().optional(),
  createdAt: isoTimestampSchema,
  /** True if quiet hours suppressed delivery on at least one channel. */
  suppressed: z.boolean().default(false),
});
export type Alert = z.infer<typeof alertSchema>;

/**
 * Push envelope shared between the server push service and the native app.
 * Kept small and stable so old app builds keep working.
 */
export const pushEnvelopeSchema = z.object({
  v: z.literal(1),
  id: idSchema,
  urgency: alertUrgencySchema,
  title: z.string().min(1),
  body: z.string(),
  cameraId: idSchema.optional(),
  eventId: idSchema.optional(),
  snapshotUrl: z.string().optional(),
  deepLink: z.string().optional(),
  /** Server-side issued at, ISO timestamp. */
  issuedAt: isoTimestampSchema,
  /** Critical-alert sound for iOS urgent. */
  critical: z.boolean().default(false),
});
export type PushEnvelope = z.infer<typeof pushEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Users + roles (Phase 7)
// ---------------------------------------------------------------------------

export const roleSchema = z.enum(["admin", "view-only"]);
export type Role = z.infer<typeof roleSchema>;

export const userContractSchema = z.object({
  id: idSchema,
  email: z.string().email().nullable(),
  displayName: z.string().min(1),
  role: roleSchema,
  createdAt: isoTimestampSchema,
});
export type UserContract = z.infer<typeof userContractSchema>;

export const sessionSchema = z.object({
  id: idSchema,
  userId: idSchema,
  /** Stable identifier of the device the session is bound to. */
  deviceId: z.string().min(1),
  deviceLabel: z.string().optional(),
  createdAt: isoTimestampSchema,
  lastSeenAt: isoTimestampSchema,
  revokedAt: isoTimestampSchema.nullable().default(null),
});
export type SessionContract = z.infer<typeof sessionSchema>;
