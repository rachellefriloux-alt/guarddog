/**
 * Phase 2 — Alert pipeline orchestrator.
 *
 * Single seam that constructs and wires together the four pieces built in
 * Phase 2:
 *
 *   AlertRouter (matrix + burst + quiet hours)
 *     │
 *     ├─► AlertDispatcher.attach()
 *     │     │
 *     │     ├─► PushSink  → notificationService (ntfy / Discord / Pushover / webhook)
 *     │     └─► digest buffer ──► DigestMailer ──► DigestSender (webhook or noop)
 *     │
 *     └─► (consumers can also subscribe directly to `router.on("alert")`)
 *
 * `createAlertPipeline(config, opts)` is a pure factory — no globals, no I/O
 * at import time. Use the exported `alertPipeline` lazy singleton from server
 * code that wants the running instance.
 *
 * Behaviour is fully driven by `loadConfig().alerts` and three new env vars
 * (all optional, all backwards-compatible):
 *
 *   ALERTS_PIPELINE          – set to "true" to start the pipeline at boot.
 *                              Default: off, so existing deployments are
 *                              unaffected. The fan-out path through
 *                              `notificationService` (used by mqtt-events-
 *                              bridge / camera-service today) keeps working
 *                              regardless.
 *   DIGEST_WEBHOOK_URL       – when set, the digest mailer POSTs each
 *                              digest to this URL. Otherwise a noop sender
 *                              is used (digest is still drained on cadence,
 *                              but nothing is shipped).
 *   ALERTS_PIPELINE_PROBE    – internal: when "true", `start()` will not
 *                              actually start timers. Used by the admin
 *                              endpoint test to construct a pipeline
 *                              without scheduling background work.
 *
 * The orchestrator never throws on optional dependencies — it logs a
 * structured warning and falls back to a noop. This is deliberate: the
 * pipeline being mis-wired must not crash the surveillance app.
 */

import {
  AlertDispatcher,
  createNotificationServicePushSink,
  type DispatchResult,
  type PushSink,
} from "./alert-dispatcher";
import { AlertRouter, type RouterEvent } from "./alert-router";
import {
  DigestMailer,
  createNoopDigestSender,
  createWebhookDigestSender,
  type DigestSender,
} from "./digest-mailer";
import { notificationService } from "./notification-service";
import type { AppConfig } from "../config";
import type { EventKind } from "@shared/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlertPipelineOptions {
  /** Override the push sink (tests). Defaults to the notificationService sink. */
  pushSink?: PushSink;
  /** Override the digest sender (tests). Defaults to webhook (if URL) or noop. */
  digestSender?: DigestSender;
  /** Skip starting timers — used by tests / probe endpoints. */
  probeOnly?: boolean;
  logger?: { warn: (msg: string, meta?: unknown) => void; info?: (msg: string) => void };
}

export interface AlertPipeline {
  readonly router: AlertRouter;
  readonly dispatcher: AlertDispatcher;
  readonly mailer: DigestMailer;
  /** Feed an external event into the router. Convenience wrapper. */
  ingest(event: RouterEvent): void;
  /** Force a digest send right now. */
  flushDigestNow(): ReturnType<DigestMailer["flushNow"]>;
  /** Last dispatch result for /status endpoints. */
  getLastDispatch(): DispatchResult | null;
  /** Tear down — stops the mailer and detaches the dispatcher. */
  stop(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const DEFAULT_LOGGER = {
  warn: (msg: string, meta?: unknown) => console.warn(`[AlertPipeline] ${msg}`, meta ?? ""),
  info: (msg: string) => console.log(`[AlertPipeline] ${msg}`),
};

export function createAlertPipeline(
  config: AppConfig,
  options: AlertPipelineOptions = {},
): AlertPipeline {
  const logger = options.logger ?? DEFAULT_LOGGER;

  const router = new AlertRouter({
    burst: config.alerts.burst,
    quietHours: config.alerts.quietHours,
  });

  const pushSink =
    options.pushSink ??
    createNotificationServicePushSink({
      send: (payload) => notificationService.send(payload),
    });

  const dispatcher = new AlertDispatcher({
    pushSink,
    digestCapacity: Math.max(1, config.alerts.digest.maxItems * 10),
    logger: { warn: (m, meta) => logger.warn(m, meta) },
  });

  let lastDispatch: DispatchResult | null = null;
  dispatcher.on("dispatched", (r: DispatchResult) => {
    lastDispatch = r;
  });

  const detachDispatcher = dispatcher.attach(router);

  const sender: DigestSender =
    options.digestSender ??
    (process.env.DIGEST_WEBHOOK_URL
      ? createWebhookDigestSender(process.env.DIGEST_WEBHOOK_URL)
      : createNoopDigestSender());

  const mailer = new DigestMailer(dispatcher, sender, {
    intervalHours: config.alerts.digest.intervalHours,
    logger: { warn: (m, meta) => logger.warn(m, meta) },
  });

  if (!options.probeOnly) {
    mailer.start();
    logger.info?.(
      `started — digest cadence ${config.alerts.digest.intervalHours}h, ` +
        `sender=${process.env.DIGEST_WEBHOOK_URL ? "webhook" : "noop"}`,
    );
  }

  return {
    router,
    dispatcher,
    mailer,
    ingest(event) {
      try {
        router.ingest(event);
      } catch (err) {
        logger.warn("ingest failed", { event, error: err });
      }
    },
    flushDigestNow() {
      return mailer.flushNow();
    },
    getLastDispatch() {
      return lastDispatch;
    },
    stop() {
      mailer.stop();
      detachDispatcher();
    },
  };
}

// ---------------------------------------------------------------------------
// Lazy singleton
// ---------------------------------------------------------------------------

let _instance: AlertPipeline | null = null;

/**
 * Returns the running pipeline, or null if it hasn't been initialized. Used
 * by routes / event sources that want to fan their events into the pipeline
 * if it's enabled.
 */
export function getAlertPipeline(): AlertPipeline | null {
  return _instance;
}

/**
 * Initialize the singleton from config. Idempotent — calling twice returns
 * the existing instance instead of starting a second mailer. Returns null
 * when the pipeline is disabled (env flag off) so callers can short-circuit.
 */
export function initAlertPipeline(
  config: AppConfig,
  options: AlertPipelineOptions = {},
): AlertPipeline | null {
  if (_instance) return _instance;
  const enabled = (process.env.ALERTS_PIPELINE ?? "").toLowerCase() === "true";
  if (!enabled) return null;
  _instance = createAlertPipeline(config, {
    ...options,
    probeOnly: options.probeOnly ?? (process.env.ALERTS_PIPELINE_PROBE ?? "").toLowerCase() === "true",
  });
  return _instance;
}

/** Tear down the singleton. Primarily for tests. */
export function resetAlertPipelineForTests(): void {
  if (_instance) {
    _instance.stop();
    _instance = null;
  }
}

// ---------------------------------------------------------------------------
// Convenience: detection → router event
// ---------------------------------------------------------------------------

/**
 * Translate a stored `Detection` (camera-service / mqtt-events-bridge output)
 * into a `RouterEvent`. Centralised so every source agrees on the mapping.
 *
 * Returns `null` for detection types that have no matching alert rule (e.g.
 * `unknown` / pets), so callers can skip without a try/catch.
 */
export function detectionToRouterEvent(detection: {
  cameraId: string;
  type: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}): RouterEvent | null {
  const kind = detectionTypeToEventKind(detection.type);
  if (!kind) return null;
  return {
    kind,
    cameraId: detection.cameraId,
    body: detection.description ?? undefined,
  };
}

function detectionTypeToEventKind(type: string): EventKind | null {
  switch (type) {
    case "person":
      return "person";
    case "vehicle":
      return "vehicle-arrival";
    case "motion":
      return "motion";
    case "package":
      return "package-delivered";
    case "doorbell":
      return "doorbell-press";
    case "tamper":
      return "tamper";
    default:
      return null;
  }
}
