/**
 * Phase 2 — Camera supervisor bootstrap.
 *
 * Glues four Phase-2 pieces together at boot:
 *
 *   storage.getCameras() ──► cameraAdapterFromCamera() ──► StreamSupervisor.register()
 *                                                                  │
 *                                                                  └─► AlertRouter (optional)
 *
 * Pure factory with injectable dependencies — no module-level singletons, no
 * I/O at import time — so tests can drive every code path with fake stores
 * and fake supervisors without touching the network.
 *
 * Behaviour is opt-in: the production caller in `server/index.ts` only invokes
 * this when `CAMERA_SUPERVISOR=true`. With the flag off, existing deployments
 * see no change.
 *
 * Failure mode: a single bad camera row, a failed adapter construction, or a
 * registration error must NOT crash the server. Each per-camera error is
 * routed through an injectable `warn` and the rest of the cameras still get
 * registered. This mirrors the contract of `cameraAdapterFromCamera`.
 */

import type { Camera } from "@shared/schema";
import type { CameraAdapter } from "./camera-adapter";
import { cameraAdapterFromCamera, type FromCameraOptions } from "./from-camera";
import type { StreamSupervisor } from "./stream-supervisor";
import type { AlertRouter } from "../services/alert-router";
import { wireSupervisorToRouter } from "../services/alert-dispatcher";

export interface CameraStore {
  /** Mirrors `IStorage.getCameras()` — only the read is needed at boot. */
  getCameras(): Promise<Camera[]>;
}

export interface BootstrapOptions {
  /** Source of truth for the camera list. Required. */
  store: CameraStore;
  /** Supervisor to register adapters with. Required. */
  supervisor: StreamSupervisor;
  /**
   * Optional router. When provided, supervisor lifecycle events are funnelled
   * into `router.ingest()` via `wireSupervisorToRouter`, and the bootstrap
   * teardown disconnects them.
   */
  router?: AlertRouter;
  /**
   * Adapter-construction options forwarded to `cameraAdapterFromCamera`.
   * `warn` defaults to `console.warn` so per-row failures are visible.
   */
  adapterOptions?: FromCameraOptions;
  /**
   * Override the per-row factory for tests. Defaults to
   * `cameraAdapterFromCamera`. Useful for asserting the bootstrap forwards
   * `adapterOptions` correctly without having to construct real RTSP URLs.
   */
  buildAdapter?: (camera: Camera, opts?: FromCameraOptions) => CameraAdapter | null;
  /** Logger for boot-level warnings. Defaults to `console.warn`. */
  warn?: (msg: string) => void;
  /** Logger for boot-level info. Defaults to `console.log`. */
  log?: (msg: string) => void;
}

export interface BootstrapResult {
  /** Camera IDs that were successfully registered with the supervisor. */
  registered: string[];
  /** Camera IDs that were skipped (factory returned null OR threw). */
  skipped: string[];
  /**
   * Tear down all wiring this bootstrap performed: unregisters every
   * adapter from the supervisor and disconnects the router wiring (if any).
   * Safe to call multiple times.
   */
  dispose(): void;
}

/**
 * Load cameras, build adapters, register them with the supervisor, and
 * (optionally) connect supervisor lifecycle events to the alert router.
 *
 * Resolves with a `BootstrapResult` describing what happened. Never throws
 * for per-row issues; will only reject if `store.getCameras()` itself
 * rejects (in which case the caller should log and continue without the
 * supervisor — it's not safe to silently swallow that one).
 */
export async function bootstrapCameraSupervisor(
  options: BootstrapOptions,
): Promise<BootstrapResult> {
  const {
    store,
    supervisor,
    router,
    adapterOptions,
    buildAdapter = cameraAdapterFromCamera,
    warn = (msg: string) => console.warn(msg),
    log = (msg: string) => console.log(msg),
  } = options;

  const cameras = await store.getCameras();
  const registered: string[] = [];
  const skipped: string[] = [];

  for (const camera of cameras) {
    let adapter: CameraAdapter | null;
    try {
      adapter = buildAdapter(camera, adapterOptions);
    } catch (err) {
      // Defensive: cameraAdapterFromCamera doesn't throw, but a custom
      // factory in tests or a future replacement might.
      warn(
        `[supervisor-bootstrap] camera ${camera.id} (${camera.name}) failed to build: ${
          (err as Error).message
        }`,
      );
      skipped.push(camera.id);
      continue;
    }

    if (!adapter) {
      // Already logged by the factory through its own `warn`.
      skipped.push(camera.id);
      continue;
    }

    try {
      supervisor.register(adapter);
      registered.push(camera.id);
    } catch (err) {
      warn(
        `[supervisor-bootstrap] camera ${camera.id} (${camera.name}) failed to register: ${
          (err as Error).message
        }`,
      );
      skipped.push(camera.id);
    }
  }

  // Optional alert-router wiring. Done after registration so we don't leak a
  // listener if registration somehow blew up the whole loop.
  let unwire: (() => void) | null = null;
  if (router) {
    try {
      unwire = wireSupervisorToRouter(supervisor, router);
    } catch (err) {
      warn(`[supervisor-bootstrap] failed to wire supervisor to router: ${(err as Error).message}`);
    }
  }

  log(
    `[supervisor-bootstrap] registered=${registered.length} skipped=${skipped.length}` +
      (router ? " router=on" : " router=off"),
  );

  let disposed = false;
  return {
    registered,
    skipped,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (unwire) {
        try {
          unwire();
        } catch {
          /* swallow — disposal is best-effort */
        }
      }
      for (const id of registered) {
        try {
          supervisor.unregister(id);
        } catch {
          /* swallow — disposal is best-effort */
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------
// Routes / event sources need a way to reach the supervisor without taking
// it as a constructor argument (Express route closures are wired at
// `registerRoutes` time, before the supervisor exists). Mirror the
// `getAlertPipeline()` pattern used by the alert pipeline so the access
// shape is consistent across Phase-2 modules.

let _supervisorInstance: StreamSupervisor | null = null;

/**
 * Register the supervisor instance so routes can read its state. Idempotent:
 * the first non-null call wins; subsequent calls are silently ignored to
 * avoid two competing supervisors fighting over the same camera IDs. Pass
 * `null` to clear (used by tests + dispose paths).
 */
export function setCameraSupervisor(supervisor: StreamSupervisor | null): void {
  if (supervisor === null) {
    _supervisorInstance = null;
    return;
  }
  if (_supervisorInstance) return;
  _supervisorInstance = supervisor;
}

/** Returns the registered supervisor, or null when CAMERA_SUPERVISOR is off. */
export function getCameraSupervisor(): StreamSupervisor | null {
  return _supervisorInstance;
}

/** Test helper — clears the singleton and any wiring state. */
export function resetCameraSupervisorForTests(): void {
  _supervisorInstance = null;
}
