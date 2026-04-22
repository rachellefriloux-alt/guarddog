/**
 * Phase 1 — API + WebSocket + push contract versioning.
 *
 * Defines the stable URL prefix and small envelope shapes shared between the
 * server and every client (web, Electron desktop, future native iOS/Android).
 * Versioning the contract lets later releases ship a v2 without breaking
 * pinned native-app builds in the field.
 */

export const API_VERSION = "v1" as const;
export const API_BASE = `/api/${API_VERSION}` as const;

/**
 * Canonical WebSocket message envelope. The legacy `/ws` route used by the
 * web client is not removed; new producers should publish through this shape
 * so the native app and desktop can subscribe with the same parser.
 */
export interface WsEnvelope<T = unknown> {
  v: 1;
  /** Topic name, e.g. "camera.health", "event.created", "alert.dispatched". */
  topic: string;
  /** ISO timestamp the server emitted the message. */
  ts: string;
  payload: T;
}

/** Topic constants used across server + clients. */
export const WS_TOPIC = {
  CameraHealth: "camera.health",
  CameraOnline: "camera.online",
  CameraOffline: "camera.offline",
  EventCreated: "event.created",
  DetectionCreated: "detection.created",
  AlertDispatched: "alert.dispatched",
  StorageStatus: "storage.status",
  RecorderStatus: "recorder.status",
} as const;

export type WsTopic = (typeof WS_TOPIC)[keyof typeof WS_TOPIC];
