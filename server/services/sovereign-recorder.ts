/**
 * Sovereign Recorder
 *
 * Direct-copy RTSP streams to MP4 segments on a "sovereign" storage path
 * (OneDrive, iCloud, local disk, NAS — any folder you point at).
 *
 * Design goals:
 *   • Zero CPU re-encoding (`-c copy`) — the camera's existing H.264 stream is
 *     remuxed straight into MP4 segments.
 *   • Fixed-length clips (default 10 minutes) so cloud-sync clients can upload
 *     finished files immediately.
 *   • Automatic reconnect with exponential backoff when a stream drops.
 *   • Cross-platform OneDrive auto-detection (Windows %USERPROFILE%\OneDrive,
 *     macOS ~/OneDrive, Linux ~/OneDrive). Override with SOVEREIGN_STORAGE_PATH.
 *   • No hard-coded credentials. Streams are loaded from the database (the
 *     existing `cameras` table) or from a JSON file pointed at by
 *     SOVEREIGN_STREAMS_FILE.
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export interface SovereignStream {
  name: string;
  url: string;
}

export interface SovereignRecorderOptions {
  /** Directory recordings are written into. Defaults to OneDrive/GuardDog_Surveillance. */
  storagePath?: string;
  /** Length of each MP4 segment in seconds. Default 600 (10 minutes). */
  segmentSeconds?: number;
  /** Initial reconnect delay in ms. Default 5000. */
  reconnectDelayMs?: number;
  /** Maximum reconnect delay in ms (exponential backoff). Default 60_000. */
  maxReconnectDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<SovereignRecorderOptions> = {
  storagePath: "",
  segmentSeconds: 600,
  reconnectDelayMs: 5_000,
  maxReconnectDelayMs: 60_000,
};

/** Sanitize a camera name so it's safe to use in a filename on every OS. */
function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 64) || "camera";
}

/** Best-effort detection of a OneDrive folder on the current platform. */
export function detectOneDrivePath(): string | null {
  const explicit = process.env.SOVEREIGN_STORAGE_PATH || process.env.ONEDRIVE;
  if (explicit && fs.existsSync(explicit)) {
    return explicit;
  }

  const homes = [
    process.env.USERPROFILE,
    process.env.HOME,
    os.homedir(),
  ].filter((h): h is string => Boolean(h));

  const candidates: string[] = [];
  for (const home of homes) {
    candidates.push(path.join(home, "OneDrive"));
    candidates.push(path.join(home, "OneDrive - Personal"));
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // ignore unreadable paths
    }
  }

  return null;
}

/** Resolve the storage directory, creating it if needed. */
export function resolveStoragePath(override?: string): string {
  const explicit = override || process.env.SOVEREIGN_STORAGE_PATH;
  let target: string;

  if (explicit) {
    target = explicit;
  } else {
    const onedrive = detectOneDrivePath();
    target = onedrive
      ? path.join(onedrive, "GuardDog_Surveillance")
      : path.join(process.env.STORAGE_DIR || path.join(process.cwd(), "storage"), "recordings");
  }

  fs.mkdirSync(target, { recursive: true });
  return target;
}

/** Load streams from SOVEREIGN_STREAMS_FILE (a JSON array) if configured. */
export function loadStreamsFromFile(filePath = process.env.SOVEREIGN_STREAMS_FILE): SovereignStream[] {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("expected an array of {name, url} entries");
    }
    return parsed
      .filter((entry): entry is SovereignStream =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as SovereignStream).name === "string" &&
        typeof (entry as SovereignStream).url === "string"
      )
      .map((entry) => ({ name: entry.name, url: entry.url }));
  } catch (error) {
    console.error(`[SovereignRecorder] Failed to load streams from ${filePath}:`, error);
    return [];
  }
}

interface RunningRecording {
  command: ffmpeg.FfmpegCommand;
  reconnectTimer?: NodeJS.Timeout;
  reconnectAttempt: number;
  stopped: boolean;
}

export class SovereignRecorder {
  private readonly options: Required<SovereignRecorderOptions>;
  private readonly running = new Map<string, RunningRecording>();

  constructor(options: SovereignRecorderOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      storagePath: resolveStoragePath(options.storagePath),
    };
  }

  get storagePath(): string {
    return this.options.storagePath;
  }

  /** Start (or restart) recording all provided streams. */
  start(streams: SovereignStream[]): void {
    for (const stream of streams) {
      this.startStream(stream);
    }
  }

  /** Begin recording a single stream. Idempotent — restarts if already running. */
  startStream(stream: SovereignStream): void {
    this.stopStream(stream.name);

    const safeName = sanitizeName(stream.name);
    const outputPattern = path.join(
      this.options.storagePath,
      `${safeName}_%Y-%m-%d_%H-%M-%S.mp4`
    );

    console.log(`[SovereignRecorder] Securing ${safeName} → ${outputPattern}`);

    const command = ffmpeg(stream.url)
      .inputOptions(["-rtsp_transport", "tcp"])
      .outputOptions([
        "-c", "copy",            // Direct stream copy = zero re-encode
        "-f", "segment",         // Split into discrete files
        `-segment_time`, String(this.options.segmentSeconds),
        "-reset_timestamps", "1",
        "-strftime", "1",
      ])
      .output(outputPattern);

    const state: RunningRecording = {
      command,
      reconnectAttempt: 0,
      stopped: false,
    };
    this.running.set(stream.name, state);

    command.on("error", (err) => {
      if (state.stopped) {
        return;
      }
      const delay = Math.min(
        this.options.reconnectDelayMs * Math.pow(2, state.reconnectAttempt),
        this.options.maxReconnectDelayMs
      );
      state.reconnectAttempt += 1;
      console.error(
        `[SovereignRecorder] ${safeName} lost: ${err.message}. Reconnecting in ${delay}ms (attempt ${state.reconnectAttempt}).`
      );
      state.reconnectTimer = setTimeout(() => this.startStream(stream), delay);
    });

    command.on("end", () => {
      if (!state.stopped) {
        // ffmpeg should never end on its own for a live RTSP source; if it does,
        // treat it like an error and reconnect.
        state.reconnectTimer = setTimeout(
          () => this.startStream(stream),
          this.options.reconnectDelayMs
        );
      }
    });

    command.run();
  }

  /** Stop recording a single stream by name. */
  stopStream(name: string): void {
    const state = this.running.get(name);
    if (!state) return;
    state.stopped = true;
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    try {
      state.command.kill("SIGTERM");
    } catch {
      // ignore — process may already be dead
    }
    this.running.delete(name);
  }

  /** Stop all running recordings. */
  stopAll(): void {
    for (const name of Array.from(this.running.keys())) {
      this.stopStream(name);
    }
  }
}

export const sovereignRecorder = new SovereignRecorder();
