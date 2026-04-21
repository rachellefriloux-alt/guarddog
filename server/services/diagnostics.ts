/**
 * Diagnostics service
 *
 * Aggregates a single "is everything healthy?" report so users (and support
 * channels) don't have to manually poke ten different status endpoints when
 * something breaks. Each check is independent and never throws — the report
 * always returns a snapshot.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

import { getActiveProvider } from "./ai-provider-router";
import { mqttEventsBridge } from "./mqtt-events-bridge";
import { detectOneDrivePath, sovereignRecorder } from "./sovereign-recorder";

export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface DiagnosticsReport {
  generatedAt: string;
  hostname: string;
  platform: string;
  nodeVersion: string;
  checks: DiagnosticCheck[];
  summary: { ok: number; warn: number; fail: number; skip: number };
}

async function checkFfmpeg(): Promise<DiagnosticCheck> {
  if (!ffmpegStatic) {
    return {
      id: "ffmpeg",
      label: "FFmpeg binary",
      status: "fail",
      detail: "ffmpeg-static did not provide a binary path on this platform.",
    };
  }
  try {
    const stats = fs.statSync(ffmpegStatic);
    if (!stats.isFile()) {
      return { id: "ffmpeg", label: "FFmpeg binary", status: "fail", detail: "Path is not a file." };
    }
    return {
      id: "ffmpeg",
      label: "FFmpeg binary",
      status: "ok",
      detail: `${ffmpegStatic} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`,
    };
  } catch (err) {
    return {
      id: "ffmpeg",
      label: "FFmpeg binary",
      status: "fail",
      detail: (err as Error).message,
    };
  }
}

function checkStorage(): DiagnosticCheck {
  const target = sovereignRecorder.storagePath;
  try {
    fs.mkdirSync(target, { recursive: true });
    const probe = path.join(target, ".guarddog-write-probe");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return { id: "storage", label: "Recording storage", status: "ok", detail: target };
  } catch (err) {
    return {
      id: "storage",
      label: "Recording storage",
      status: "fail",
      detail: `${target}: ${(err as Error).message}`,
    };
  }
}

function checkOneDrive(): DiagnosticCheck {
  const detected = detectOneDrivePath();
  if (!detected) {
    return {
      id: "onedrive",
      label: "OneDrive folder",
      status: "skip",
      detail: "No OneDrive folder detected — local storage will be used. Set SOVEREIGN_STORAGE_PATH to override.",
    };
  }
  return { id: "onedrive", label: "OneDrive folder", status: "ok", detail: detected };
}

async function checkAi(): Promise<DiagnosticCheck> {
  try {
    const provider = await getActiveProvider();
    if (provider === "disabled") {
      return {
        id: "ai",
        label: "AI provider",
        status: "warn",
        detail: "No AI provider available. Install Ollama locally or set OPENAI_API_KEY.",
      };
    }
    return { id: "ai", label: "AI provider", status: "ok", detail: provider };
  } catch (err) {
    return { id: "ai", label: "AI provider", status: "warn", detail: (err as Error).message };
  }
}

function checkMqtt(): DiagnosticCheck {
  if (!mqttEventsBridge.isConfigured()) {
    return {
      id: "mqtt",
      label: "MQTT events bridge",
      status: "skip",
      detail: "MQTT_URL not set — Frigate / external detector integration disabled.",
    };
  }
  return {
    id: "mqtt",
    label: "MQTT events bridge",
    status: "ok",
    detail: `Connected to ${process.env.MQTT_URL}`,
  };
}

function checkSession(): DiagnosticCheck {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return {
      id: "session",
      label: "SESSION_SECRET",
      status: "warn",
      detail: "Using an in-memory development fallback. Set SESSION_SECRET for production.",
    };
  }
  if (secret === "change-me-to-a-secure-random-string-in-production") {
    return {
      id: "session",
      label: "SESSION_SECRET",
      status: "fail",
      detail: "SESSION_SECRET is still the placeholder value. Replace before going live.",
    };
  }
  return { id: "session", label: "SESSION_SECRET", status: "ok", detail: "Configured" };
}

export async function runDiagnostics(): Promise<DiagnosticsReport> {
  const checks = await Promise.all([
    checkFfmpeg(),
    Promise.resolve(checkStorage()),
    Promise.resolve(checkOneDrive()),
    checkAi(),
    Promise.resolve(checkMqtt()),
    Promise.resolve(checkSession()),
  ]);

  const summary = { ok: 0, warn: 0, fail: 0, skip: 0 };
  for (const c of checks) summary[c.status] += 1;

  return {
    generatedAt: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    nodeVersion: process.version,
    checks,
    summary,
  };
}
