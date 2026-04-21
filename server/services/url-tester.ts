/**
 * URL Tester
 *
 * Probes an RTSP/HTTP camera URL with `ffprobe` and returns codec, resolution,
 * fps, and (when available) the bitrate so the UI can validate a stream
 * before saving it. This kills the #1 onboarding friction in GuardDog: users
 * no longer have to guess the right RTSP path and only find out it's wrong
 * once the recorder fails silently.
 *
 * The tester also returns a "bandwidth advice" hint based on the detected
 * bitrate so the UI can warn users that a high-bitrate main stream may
 * overwhelm their cloud upload.
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export interface TestUrlInput {
  url: string;
  username?: string;
  password?: string;
}

export interface TestUrlResult {
  ok: boolean;
  url: string;
  /** Human-friendly error message when ok=false. */
  error?: string;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  resolution?: string;
  fps?: number;
  bitrateKbps?: number;
  durationSec?: number | null;
  /** Optional advisory message for the UI ("high bitrate", etc.). */
  advisory?: string;
}

/**
 * Inject username/password into an RTSP/HTTP URL when the URL doesn't already
 * carry credentials. We only do this when the URL has a valid scheme so we
 * don't accidentally rewrite arbitrary user input.
 */
export function injectCredentials(url: string, username?: string, password?: string): string {
  if (!username) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.username) return url; // already has credentials
  parsed.username = encodeURIComponent(username);
  if (password) parsed.password = encodeURIComponent(password);
  return parsed.toString();
}

/**
 * Build a short advisory string based on the detected bitrate. Cameras that
 * pump >4 Mbit/s typically overwhelm a residential upload pipe — surface that
 * to the user so they can switch to the sub-stream.
 */
export function bandwidthAdvice(bitrateKbps?: number): string | undefined {
  if (!bitrateKbps || bitrateKbps <= 0) return undefined;
  if (bitrateKbps >= 6000) {
    return `Stream is ~${Math.round(bitrateKbps / 1000)} Mbps. This may saturate a typical home upload — consider the sub-stream URL for cloud backup.`;
  }
  if (bitrateKbps >= 3000) {
    return `Stream is ~${Math.round(bitrateKbps / 1000)} Mbps. Should be fine on most broadband, but watch your monthly upload cap.`;
  }
  return `Stream is ~${Math.round(bitrateKbps / 1000)} Mbps. Comfortable for cloud sync.`;
}

/**
 * Probe a stream URL with ffprobe. Always resolves (never throws) so callers
 * can return a clean JSON error to the client.
 */
export function testUrl(input: TestUrlInput): Promise<TestUrlResult> {
  const probeUrl = injectCredentials(input.url, input.username, input.password);
  // Fixed timeout. We deliberately ignore any client-supplied value so a
  // hostile (or buggy) caller can't tie up server resources by requesting a
  // very long timer.
  const timeoutMs = 8000;

  return new Promise<TestUrlResult>((resolve) => {
    let settled = false;
    const finish = (r: TestUrlResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        url: input.url,
        error: `Timed out after ${timeoutMs} ms — the camera did not respond. Check IP, port, credentials, and that the device is powered on.`,
      });
    }, timeoutMs);

    try {
      ffmpeg.ffprobe(probeUrl, (err, data) => {
        clearTimeout(timer);
        if (err) {
          finish({
            ok: false,
            url: input.url,
            error: cleanupFfprobeError(err.message || String(err)),
          });
          return;
        }

        const videoStream = data.streams?.find((s) => s.codec_type === "video");
        const audioStream = data.streams?.find((s) => s.codec_type === "audio");

        const fps = parseFps(videoStream?.avg_frame_rate ?? videoStream?.r_frame_rate);
        const bitrateBps =
          (videoStream?.bit_rate ? Number(videoStream.bit_rate) : 0) ||
          (data.format?.bit_rate ? Number(data.format.bit_rate) : 0);
        const bitrateKbps = bitrateBps > 0 ? Math.round(bitrateBps / 1000) : undefined;

        const width = videoStream?.width;
        const height = videoStream?.height;
        const resolution = width && height ? `${width}×${height}` : undefined;

        finish({
          ok: true,
          url: input.url,
          videoCodec: videoStream?.codec_name,
          audioCodec: audioStream?.codec_name,
          width,
          height,
          resolution,
          fps,
          bitrateKbps,
          durationSec:
            data.format?.duration && Number.isFinite(Number(data.format.duration))
              ? Number(data.format.duration)
              : null,
          advisory: bandwidthAdvice(bitrateKbps),
        });
      });
    } catch (err) {
      clearTimeout(timer);
      finish({
        ok: false,
        url: input.url,
        error: (err as Error).message,
      });
    }
  });
}

/** Parse "30000/1001" or "29.97" style frame-rate strings. */
function parseFps(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  if (raw.includes("/")) {
    const [n, d] = raw.split("/").map(Number);
    if (n && d) return Math.round((n / d) * 100) / 100;
  }
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : undefined;
}

/**
 * ffprobe error messages can be noisy (full ffmpeg banner). Trim the output
 * to the most useful tail so the UI can show something readable.
 */
export function cleanupFfprobeError(msg: string): string {
  const lines = msg
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("ffprobe version") && !l.startsWith("built with"));
  const meaningful = lines.filter(
    (l) => !l.startsWith("configuration:") && !l.startsWith("lib") && !l.startsWith("Input #")
  );
  const tail = meaningful.slice(-3).join(" ");
  return tail || msg.slice(0, 200);
}
