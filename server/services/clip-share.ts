/**
 * Clip share service
 *
 * Mints short-lived signed share tokens for individual recordings so a user
 * can hand a single URL to a neighbor / police officer without exposing the
 * rest of their library. Tokens are HMAC'd against SESSION_SECRET (or a
 * fallback dev secret) and carry both the recording id and an expiry — so we
 * don't need a database row per share.
 *
 * The download endpoint validates the token, checks the expiry, and streams
 * the recording. No authentication required for the download itself, which
 * is the whole point of the share link.
 */

import crypto from "node:crypto";

const DEFAULT_TTL_DAYS = 7;
const DEV_SECRET = "guarddog-share-dev-secret";

function secret(): string {
  return process.env.SESSION_SECRET || DEV_SECRET;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(str.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

export interface ShareToken {
  /** Opaque token string the user gets handed. */
  token: string;
  /** Pre-built relative URL that includes the token. */
  url: string;
  /** Unix epoch (ms) when this token stops being valid. */
  expiresAt: number;
}

/** Mint a share token for a recording id. */
export function mintShareToken(recordingId: string, ttlDays = DEFAULT_TTL_DAYS): ShareToken {
  const ttlMs = Math.max(1, Math.min(ttlDays, 90)) * 24 * 60 * 60 * 1000;
  const expiresAt = Date.now() + ttlMs;
  const payload = `${recordingId}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest();
  const token = `${base64url(Buffer.from(payload, "utf8"))}.${base64url(sig)}`;
  return {
    token,
    url: `/api/share/${encodeURIComponent(token)}`,
    expiresAt,
  };
}

export interface VerifyResult {
  ok: boolean;
  recordingId?: string;
  expiresAt?: number;
  error?: string;
}

/** Verify a share token, returning the decoded recording id when valid. */
export function verifyShareToken(token: string): VerifyResult {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { ok: false, error: "malformed token" };
  }
  const [payloadB64, sigB64] = token.split(".");
  let payloadBuf: Buffer;
  let sigBuf: Buffer;
  try {
    payloadBuf = fromBase64url(payloadB64);
    sigBuf = fromBase64url(sigB64);
  } catch {
    return { ok: false, error: "malformed token" };
  }
  const expectedSig = crypto.createHmac("sha256", secret()).update(payloadBuf).digest();
  if (expectedSig.length !== sigBuf.length || !crypto.timingSafeEqual(expectedSig, sigBuf)) {
    return { ok: false, error: "bad signature" };
  }
  const payload = payloadBuf.toString("utf8");
  const lastDot = payload.lastIndexOf(".");
  if (lastDot < 1) {
    return { ok: false, error: "malformed payload" };
  }
  const recordingId = payload.slice(0, lastDot);
  const expiresAt = Number(payload.slice(lastDot + 1));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return { ok: false, error: "expired" };
  }
  return { ok: true, recordingId, expiresAt };
}
