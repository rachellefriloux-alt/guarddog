import { describe, expect, it } from "vitest";

import { loadConfig } from "../config";

describe("loadConfig", () => {
  it("falls back to the confirmed defaults when env is empty", () => {
    const cfg = loadConfig({});
    expect(cfg.profile).toBe("hybrid");
    expect(cfg.retention.fullFootageDays).toBe(200);
    expect(cfg.retention.motionClipDays).toBe(180);
    expect(cfg.retention.storageUrgentPct).toBe(10);
    expect(cfg.alerts.cameraOfflineUrgentSec).toBe(180);
    expect(cfg.ai.localOnly).toBe(true);
    expect(cfg.cloud.target).toBe("none");
  });

  it("parses the documented profile values", () => {
    expect(loadConfig({ DEPLOYMENT_PROFILE: "local" }).profile).toBe("local");
    expect(loadConfig({ DEPLOYMENT_PROFILE: "cloud-backup" }).profile).toBe(
      "cloud-backup",
    );
  });

  it("rejects unknown deployment profiles", () => {
    expect(() => loadConfig({ DEPLOYMENT_PROFILE: "bogus" })).toThrow();
  });

  it("normalizes Google Drive aliases for cloud target", () => {
    expect(loadConfig({ CLOUD_TARGET: "drive" }).cloud.target).toBe("drive");
    expect(loadConfig({ CLOUD_TARGET: "google" }).cloud.target).toBe("drive");
    expect(loadConfig({ CLOUD_TARGET: "google-drive" }).cloud.target).toBe(
      "drive",
    );
    expect(loadConfig({ CLOUD_TARGET: "onedrive" }).cloud.target).toBe(
      "onedrive",
    );
  });

  it("ignores the placeholder OpenAI key", () => {
    const cfg = loadConfig({ OPENAI_API_KEY: "your-openai-api-key-here" });
    expect(cfg.ai.openaiApiKey).toBeUndefined();
  });

  it("accepts a real OpenAI key", () => {
    const cfg = loadConfig({ OPENAI_API_KEY: "sk-real-key" });
    expect(cfg.ai.openaiApiKey).toBe("sk-real-key");
  });

  it("rejects malformed quiet-hours strings", () => {
    expect(() => loadConfig({ QUIET_HOURS_START: "10pm" })).toThrow();
  });

  it("respects custom retention overrides", () => {
    const cfg = loadConfig({
      RETENTION_FULL_DAYS: "365",
      RETENTION_MOTION_DAYS: "30",
    });
    expect(cfg.retention.fullFootageDays).toBe(365);
    expect(cfg.retention.motionClipDays).toBe(30);
  });

  it("parses booleans liberally", () => {
    expect(loadConfig({ AI_LOCAL_ONLY: "false" }).ai.localOnly).toBe(false);
    expect(loadConfig({ AI_LOCAL_ONLY: "0" }).ai.localOnly).toBe(false);
    expect(loadConfig({ AI_LOCAL_ONLY: "yes" }).ai.localOnly).toBe(true);
  });
});
