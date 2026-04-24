/**
 * EseeCloud adapter — Phase 2 stub backed by an in-memory frame buffer.
 *
 * Per ARCHITECTURE.md (Phase 2):
 *   - Define an `EseeCloudAdapter` interface with `getFrame(deviceId): Buffer`,
 *     `startTalk(deviceId)`, `stopTalk(deviceId)`.
 *   - Implement a stub that returns a placeholder image.
 *   - Wire `GET /internal/devices/{id}/frame` → `EseeCloudAdapter.getFrame`.
 *   - Phase 5 replaces the stub with real screen capture + UI automation.
 *
 * This file IS the Phase 2 stub. It improves on "return a placeholder
 * image" in one safe direction: the buffer accepts ingestion from a
 * future capture-agent process (running alongside the EseeCloud desktop
 * app on the mini-PC) via `POST /api/internal/devices/:id/frame`. Until
 * an agent is wired, `getFrame` returns `undefined` and the GET route
 * responds with 404 — the agreed-on "no frame yet" shape.
 *
 * `startTalk` / `stopTalk` are intentionally Phase-5 work; here they
 * throw `NotImplemented` so the eventual `POST /devices/{id}/talk/*`
 * endpoints surface a clean 501 instead of inventing behavior. The spec
 * explicitly says: "prefer stubbing it out with clear TODO comments
 * rather than inventing behavior."
 */

import { CameraFrame, FrameStore, getFrameStore } from "../../services/frame-store";

export class EseeCloudAdapterNotImplemented extends Error {
  constructor(method: string) {
    super(`EseeCloudAdapter.${method} is not implemented in the Phase 2 stub`);
    this.name = "EseeCloudAdapterNotImplemented";
  }
}

export interface EseeCloudAdapter {
  /**
   * Latest frame for the given device, or `undefined` if no fresh frame
   * is buffered. Spec calls for `Buffer` directly; we return the richer
   * `CameraFrame` so callers can also surface capture timestamps and
   * sequence numbers (the route serializes both as response headers).
   */
  getFrame(deviceId: string): CameraFrame | undefined;

  /** Phase 5: focus EseeCloud window, select camera, press the talk button. */
  startTalk(deviceId: string): Promise<void>;

  /** Phase 5: release the talk button. */
  stopTalk(deviceId: string): Promise<void>;
}

/**
 * `EseeCloudAdapter` implementation backed by the in-memory `FrameStore`.
 * The store is filled by the out-of-process capture agent on the mini-PC
 * (see ARCHITECTURE.md "EseeCloud Adapter — HOW-TO").
 */
export class FrameStoreEseeCloudAdapter implements EseeCloudAdapter {
  constructor(private readonly store: FrameStore = getFrameStore()) {}

  getFrame(deviceId: string): CameraFrame | undefined {
    return this.store.get(deviceId);
  }

  // TODO(phase-5): wire to UI automation (pywinauto / WinAppDriver / AHK)
  //                and virtual-mic routing on the mini-PC.
  async startTalk(_deviceId: string): Promise<void> {
    throw new EseeCloudAdapterNotImplemented("startTalk");
  }

  // TODO(phase-5): see startTalk.
  async stopTalk(_deviceId: string): Promise<void> {
    throw new EseeCloudAdapterNotImplemented("stopTalk");
  }
}

let singleton: EseeCloudAdapter | null = null;

/** Lazy singleton so tests can override via `setEseeCloudAdapter()`. */
export function getEseeCloudAdapter(): EseeCloudAdapter {
  if (!singleton) singleton = new FrameStoreEseeCloudAdapter();
  return singleton;
}

/** Test seam: inject a mock adapter or reset to default. */
export function setEseeCloudAdapter(adapter: EseeCloudAdapter | null): void {
  singleton = adapter;
}
