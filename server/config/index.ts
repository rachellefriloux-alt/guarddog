/**
 * Phase 1 — Typed configuration module.
 *
 * Collapses the env knobs already documented in `.env.example` into a single
 * Zod-validated config object with deployment profiles (`local`, `hybrid`,
 * `cloud-backup`). Existing services keep reading `process.env` directly,
 * so this module is additive and does not change boot behavior. New code
 * (Phase 2+ supervisor, recorder, retention engine, alert router) should
 * consume `loadConfig()` instead of touching `process.env` directly.
 */

import { z } from "zod";
import {
  retentionPolicySchema,
  type RetentionPolicy,
} from "@shared/contracts";
import {
  BURST_RULE_DEFAULT,
  DIGEST_DEFAULT,
  QUIET_HOURS_DEFAULT,
  type BurstRule,
  type DigestSchedule,
  type QuietHoursConfig,
} from "@shared/alert-rules";

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export const deploymentProfileSchema = z.enum([
  /** Mini PC only, no cloud backup. */
  "local",
  /** Mini PC + Drive/OneDrive sync-folder backup. The user's confirmed setup. */
  "hybrid",
  /** Cloud-first; mini PC is just an ingest node. */
  "cloud-backup",
]);
export type DeploymentProfile = z.infer<typeof deploymentProfileSchema>;

const aiProviderSchema = z.enum(["auto", "ollama", "openai", "disabled"]);

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

const configSchema = z.object({
  profile: deploymentProfileSchema.default("hybrid"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  port: z.number().int().positive().default(5000),

  ai: z.object({
    provider: aiProviderSchema.default("auto"),
    ollamaHost: z.string().url().optional(),
    ollamaVisionModel: z.string().default("llava"),
    ollamaTextModel: z.string().default("llama3.2"),
    openaiApiKey: z.string().optional(),
    openaiVisionModel: z.string().default("gpt-4o-mini"),
    openaiTextModel: z.string().default("gpt-4o-mini"),
    /** $0-budget guardrail — when true, paid providers are never called. */
    localOnly: z.boolean().default(true),
  }),

  recording: z.object({
    storageRoot: z.string().default("./storage"),
    /** Length of each continuous segment, seconds (5–10 min per spec). */
    segmentDurationSec: z.number().int().positive().default(600),
    /** Pre/post roll on motion clips, seconds. */
    motionPreRollSec: z.number().int().nonnegative().default(5),
    motionPostRollSec: z.number().int().nonnegative().default(10),
    /** Hard ceiling on local disk usage (GB). */
    storageMaxGb: z.number().positive().default(400),
  }),

  retention: retentionPolicySchema,

  cloud: z.object({
    /** "drive" | "onedrive" | "none" — the user picked Drive or OneDrive. */
    target: z.enum(["drive", "onedrive", "none"]).default("none"),
    /** Folder synced by the desktop client (Phase 4 sync-folder strategy). */
    syncFolderPath: z.string().optional(),
    monthlyUploadCapGb: z.number().nonnegative().default(0),
    storageCapGb: z.number().nonnegative().default(15), // free Drive / OneDrive tier
    /** Throttle for the API uploader fallback, percent of upstream. */
    bandwidthThrottlePct: z.number().min(0).max(100).default(50),
  }),

  alerts: z.object({
    /**
     * Camera-offline urgent threshold, seconds. The user confirmed 3 min.
     */
    cameraOfflineUrgentSec: z.number().int().positive().default(180),
    quietHours: z.object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
      silenceNonUrgent: z.boolean(),
    }),
    burst: z.object({
      count: z.number().int().positive(),
      windowSec: z.number().int().positive(),
      promoteTo: z.enum(["urgent", "non-urgent"]),
    }),
    digest: z.object({
      intervalHours: z.number().int().min(1).max(24),
      maxItems: z.number().int().positive(),
    }),
  }),

  security: z.object({
    sessionSecret: z.string().min(8).default("change-me-in-production"),
    /** Bind admin UI to LAN only by default (Phase 7). */
    bindLanOnly: z.boolean().default(true),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function envInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envFloat(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Default-shipped placeholder in `.env.example`. We treat it as "unset" so
 * a fresh checkout doesn't accidentally send paid OpenAI traffic.
 */
const OPENAI_KEY_PLACEHOLDER = "your-openai-api-key-here";

/**
 * Build an `AppConfig` from `process.env`. Throws a `ZodError` with a
 * helpful message if validation fails. Pure with respect to its `env`
 * argument, so tests can pass a synthetic environment.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const profile = (env.DEPLOYMENT_PROFILE ?? "hybrid") as DeploymentProfile;

  const retention: RetentionPolicy = {
    fullFootageDays: envInt(env.RETENTION_FULL_DAYS, 200),
    motionClipDays: envInt(env.RETENTION_MOTION_DAYS, 180),
    storageUrgentPct: envFloat(env.STORAGE_URGENT_PCT, 10),
    storageWarnPct: envFloat(env.STORAGE_WARN_PCT, 25),
    perCamera: {},
  };

  const quiet: QuietHoursConfig = {
    start: env.QUIET_HOURS_START ?? QUIET_HOURS_DEFAULT.start,
    end: env.QUIET_HOURS_END ?? QUIET_HOURS_DEFAULT.end,
    silenceNonUrgent: envBool(
      env.QUIET_HOURS_SILENCE_NON_URGENT,
      QUIET_HOURS_DEFAULT.silenceNonUrgent,
    ),
  };

  const burst: BurstRule = {
    count: envInt(env.ALERT_BURST_COUNT, BURST_RULE_DEFAULT.count),
    windowSec: envInt(env.ALERT_BURST_WINDOW_SEC, BURST_RULE_DEFAULT.windowSec),
    promoteTo: BURST_RULE_DEFAULT.promoteTo,
  };

  const digest: DigestSchedule = {
    intervalHours: envInt(env.ALERT_DIGEST_HOURS, DIGEST_DEFAULT.intervalHours),
    maxItems: envInt(env.ALERT_DIGEST_MAX_ITEMS, DIGEST_DEFAULT.maxItems),
  };

  const raw = {
    profile,
    nodeEnv: (env.NODE_ENV ?? "development") as
      | "development"
      | "production"
      | "test",
    port: envInt(env.PORT, 5000),

    ai: {
      provider: (env.AI_PROVIDER ?? "auto") as
        | "auto"
        | "ollama"
        | "openai"
        | "disabled",
      ollamaHost: env.OLLAMA_HOST,
      ollamaVisionModel: env.OLLAMA_VISION_MODEL ?? "llava",
      ollamaTextModel: env.OLLAMA_TEXT_MODEL ?? "llama3.2",
      openaiApiKey:
        env.OPENAI_API_KEY && env.OPENAI_API_KEY !== OPENAI_KEY_PLACEHOLDER
          ? env.OPENAI_API_KEY
          : undefined,
      openaiVisionModel: env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
      openaiTextModel: env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini",
      localOnly: envBool(env.AI_LOCAL_ONLY, true),
    },

    recording: {
      storageRoot: env.STORAGE_DIR ?? "./storage",
      segmentDurationSec: envInt(env.RECORD_SEGMENT_SEC, 600),
      motionPreRollSec: envInt(env.MOTION_PRE_ROLL_SEC, 5),
      motionPostRollSec: envInt(env.MOTION_POST_ROLL_SEC, 10),
      storageMaxGb: envFloat(env.STORAGE_MAX_GB, 400),
    },

    retention,

    cloud: {
      target: ((): "drive" | "onedrive" | "none" => {
        const raw = (env.CLOUD_TARGET ?? "").toLowerCase();
        if (raw === "drive" || raw === "google" || raw === "google-drive") return "drive";
        if (raw === "onedrive") return "onedrive";
        return "none";
      })(),
      syncFolderPath: env.SOVEREIGN_STORAGE_PATH,
      monthlyUploadCapGb: envFloat(env.CLOUD_MONTHLY_UPLOAD_CAP_GB, 0),
      storageCapGb: envFloat(env.CLOUD_STORAGE_CAP_GB, 15),
      bandwidthThrottlePct: envFloat(env.CLOUD_BANDWIDTH_THROTTLE_PCT, 50),
    },

    alerts: {
      cameraOfflineUrgentSec: envInt(env.CAMERA_OFFLINE_URGENT_SEC, 180),
      quietHours: quiet,
      burst,
      digest,
    },

    security: {
      sessionSecret: env.SESSION_SECRET ?? "change-me-in-production",
      bindLanOnly: envBool(env.BIND_LAN_ONLY, true),
    },
  };

  return configSchema.parse(raw);
}

/** Cached singleton — most callers should use this. */
let cached: AppConfig | undefined;
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Test helper — clears the cache so the next `getConfig()` re-reads env. */
export function _resetConfigForTests(): void {
  cached = undefined;
}
