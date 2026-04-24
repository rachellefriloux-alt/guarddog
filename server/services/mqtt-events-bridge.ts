/**
 * MQTT Events Bridge
 *
 * Consumes detection events from a local AI service that publishes to MQTT
 * (e.g. Frigate, https://frigate.video) and writes them into GuardDog's
 * detection store so they show up in the dashboard alongside cloud-AI events.
 *
 * This is the "Sovereign / AI just like Ring/eSeeCloud" path that doesn't
 * require an OpenAI key: a Python/OpenCV service (Frigate, MotionEye, custom)
 * does inference locally and publishes events; GuardDog just listens.
 *
 * Frigate event payload reference:
 *   { type: "new" | "update" | "end",
 *     before: {...}, after: { id, camera, label, top_score, ... } }
 *
 * Generic payload (any other publisher) — the bridge accepts:
 *   { camera, label, score|confidence, timestamp? }
 */

import mqtt, { type MqttClient } from "mqtt";
import { storage } from "../storage";
import { notificationService } from "./notification-service";
import { detectionToRouterEvent, getAlertPipeline } from "./alert-pipeline";

export interface MqttBridgeOptions {
  url?: string;
  username?: string;
  password?: string;
  topic?: string;
}

interface FrigateEventPayload {
  type?: "new" | "update" | "end";
  after?: {
    id?: string;
    camera?: string;
    label?: string;
    top_score?: number;
    score?: number;
    start_time?: number;
  };
}

interface GenericEventPayload {
  camera?: string;
  label?: string;
  score?: number;
  confidence?: number;
  timestamp?: string | number;
}

const TYPE_MAP: Record<string, "person" | "pet" | "vehicle" | "unknown"> = {
  person: "person",
  people: "person",
  cat: "pet",
  dog: "pet",
  animal: "pet",
  bird: "pet",
  car: "vehicle",
  truck: "vehicle",
  bus: "vehicle",
  motorcycle: "vehicle",
  bicycle: "vehicle",
};

function classifyLabel(label?: string): "person" | "pet" | "vehicle" | "unknown" {
  if (!label) return "unknown";
  return TYPE_MAP[label.toLowerCase()] || "unknown";
}

export class MqttEventsBridge {
  private client: MqttClient | null = null;
  private readonly options: Required<MqttBridgeOptions>;

  constructor(options: MqttBridgeOptions = {}) {
    this.options = {
      url: options.url ?? process.env.MQTT_URL ?? "",
      username: options.username ?? process.env.MQTT_USERNAME ?? "",
      password: options.password ?? process.env.MQTT_PASSWORD ?? "",
      topic: options.topic ?? process.env.MQTT_TOPIC ?? "frigate/events",
    };
  }

  isConfigured(): boolean {
    return Boolean(this.options.url);
  }

  start(): void {
    if (!this.isConfigured()) {
      return;
    }

    const opts: mqtt.IClientOptions = {
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    };
    if (this.options.username) opts.username = this.options.username;
    if (this.options.password) opts.password = this.options.password;

    console.log(`[MQTT] Connecting to ${this.options.url} (topic: ${this.options.topic})`);
    this.client = mqtt.connect(this.options.url, opts);

    this.client.on("connect", () => {
      console.log("[MQTT] Connected. Subscribing to detection events.");
      this.client?.subscribe(this.options.topic, (err) => {
        if (err) console.error(`[MQTT] Subscribe failed for ${this.options.topic}:`, err.message);
      });
    });

    this.client.on("error", (err) => {
      console.error("[MQTT] Connection error:", err.message);
    });

    this.client.on("message", (_topic, payload) => {
      this.handleMessage(payload).catch((err) =>
        console.error("[MQTT] Failed to process event:", err)
      );
    });
  }

  async stop(): Promise<void> {
    if (this.client) {
      await new Promise<void>((resolve) => this.client!.end(false, {}, () => resolve()));
      this.client = null;
    }
  }

  /** Exposed for testing. */
  async handleMessage(payload: Buffer): Promise<void> {
    let parsed: FrigateEventPayload & GenericEventPayload;
    try {
      parsed = JSON.parse(payload.toString());
    } catch {
      return; // Ignore non-JSON traffic
    }

    // Frigate emits {type, before, after}; only act on "new" so we don't
    // double-record updates.
    const isFrigate = parsed.type !== undefined && parsed.after !== undefined;
    if (isFrigate && parsed.type !== "new") return;

    const after = parsed.after ?? {};
    const cameraId = after.camera ?? parsed.camera;
    const label = after.label ?? parsed.label;
    const confidence = after.top_score ?? after.score ?? parsed.score ?? parsed.confidence ?? 0;

    if (!cameraId || !label) return;

    try {
      await storage.createDetection({
        cameraId,
        recordingId: null,
        type: classifyLabel(label),
        confidence,
        description: `Local AI (${label})`,
        metadata: { classification: label },
      });
      console.log(`[MQTT] Recorded ${label} on ${cameraId} (${(confidence * 100).toFixed(0)}%)`);

      // Phase 2: also feed the alert pipeline (matrix-driven routing, burst
      // escalation, quiet hours, digest). No-op when the pipeline isn't
      // enabled (ALERTS_PIPELINE != "true"), so the legacy notification
      // fan-out below remains the sole delivery path for existing setups.
      const pipeline = getAlertPipeline();
      if (pipeline) {
        const event = detectionToRouterEvent({
          cameraId,
          type: classifyLabel(label),
          description: `${label} detected (${(confidence * 100).toFixed(0)}%)`,
        });
        if (event) pipeline.ingest(event);
      }

      // Fan out to enabled notification sinks (ntfy / Discord / Pushover /
      // generic webhook). All sinks no-op when nothing is configured, so
      // there is zero impact for users who haven't wired up channels yet.
      // Only notify on person/vehicle to avoid spamming users with every
      // animal that wanders by — this matches the typical Frigate use case.
      const cls = classifyLabel(label);
      if (cls === "person" || cls === "vehicle") {
        // Fire-and-forget; never block the event loop on outbound HTTP.
        void notificationService
          .send({
            title: `${cls === "person" ? "Person" : "Vehicle"} on ${cameraId}`,
            message: `${label} detected with ${(confidence * 100).toFixed(0)}% confidence.`,
            level: cls === "person" ? "alert" : "info",
            meta: { cameraId, label, confidence },
          })
          .catch((err) => console.error("[MQTT] notification fan-out failed:", err));
      }
    } catch (err) {
      console.error("[MQTT] Failed to persist detection:", err);
    }
  }
}

export const mqttEventsBridge = new MqttEventsBridge();
