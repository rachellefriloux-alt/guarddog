/**
 * Audit log
 *
 * Lightweight in-memory ring buffer of notable events (logins, config
 * changes, clip exports, notifications). Persistence is deliberately not
 * required — the goal is operator visibility for the current session, not a
 * compliance log. The buffer is bounded so it can't leak memory.
 */

export type AuditEvent =
  | "auth.login"
  | "auth.logout"
  | "camera.create"
  | "camera.update"
  | "camera.delete"
  | "camera.test_url"
  | "stream.start"
  | "stream.stop"
  | "recording.share"
  | "notification.send"
  | "diagnostics.run"
  | "settings.update"
  | "discovery.run";

export interface AuditEntry {
  id: number;
  timestamp: string; // ISO
  event: AuditEvent | string;
  detail?: string;
  user?: string;
  ip?: string;
}

const DEFAULT_MAX_ENTRIES = 500;

class AuditLog {
  private entries: AuditEntry[] = [];
  private nextId = 1;
  private readonly maxEntries: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = Math.max(50, maxEntries);
  }

  record(entry: Omit<AuditEntry, "id" | "timestamp"> & { timestamp?: string }): AuditEntry {
    const stored: AuditEntry = {
      id: this.nextId++,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      event: entry.event,
      detail: entry.detail,
      user: entry.user,
      ip: entry.ip,
    };
    this.entries.push(stored);
    if (this.entries.length > this.maxEntries) {
      // Drop oldest entries while preserving id continuity.
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
    return stored;
  }

  list(limit = 100): AuditEntry[] {
    if (limit >= this.entries.length) {
      return [...this.entries].reverse();
    }
    return this.entries.slice(-limit).reverse();
  }

  clear(): void {
    this.entries = [];
  }

  size(): number {
    return this.entries.length;
  }
}

export const auditLog = new AuditLog();
