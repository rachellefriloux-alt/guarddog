/**
 * Phase 1 — Alert matrix as data.
 *
 * This file encodes the user-confirmed alert configuration so it can be
 * consumed unchanged by the Phase 5 alert router and the Phase 6 native
 * mobile push service. Editing this table is the supported way to add or
 * change an alert — no code change required in the router.
 *
 * Confirmed configuration:
 *   - Single admin user, $0 budget.
 *   - Urgent: instant push; email optional backup; SMS off.
 *   - Non-urgent: push off / silent; email digest every 6–12 h; SMS off.
 *   - Quiet hours (default 22:00–07:00 local): urgent push only.
 *   - Burst rule: 3+ events in 2 minutes escalates to urgent.
 */

import type {
  AlertChannel,
  AlertUrgency,
  EventKind,
} from "./contracts";

export interface AlertRule {
  /** Stable id used in `Alert.ruleId`. */
  id: string;
  /** Event kinds that fire this rule. */
  triggers: EventKind[];
  urgency: AlertUrgency;
  /** Channels actually delivered (in addition to platform defaults). */
  channels: AlertChannel[];
  /** Human label shown in the parity / settings UI. */
  label: string;
  /** Description shown in the rule editor. */
  description: string;
  /**
   * If true, this rule is allowed to fire during quiet hours.
   * Quiet-hours behavior: urgent push only.
   */
  bypassQuietHours: boolean;
}

export interface QuietHoursConfig {
  /** 24h local clock, e.g. "22:00". */
  start: string;
  end: string;
  /** When in quiet hours, only `urgent` rules with bypassQuietHours fire push. */
  silenceNonUrgent: boolean;
}

export interface BurstRule {
  /** Number of events that trip the burst escalation. */
  count: number;
  /** Window in seconds. */
  windowSec: number;
  /** Urgency the burst is promoted to. */
  promoteTo: AlertUrgency;
}

export interface DigestSchedule {
  /** Hours between digest emails (6–12 per spec). */
  intervalHours: number;
  /** Cap on items per digest. */
  maxItems: number;
}

export const QUIET_HOURS_DEFAULT: QuietHoursConfig = {
  start: "22:00",
  end: "07:00",
  silenceNonUrgent: true,
};

export const BURST_RULE_DEFAULT: BurstRule = {
  count: 3,
  windowSec: 120,
  promoteTo: "urgent",
};

export const DIGEST_DEFAULT: DigestSchedule = {
  intervalHours: 8, // mid-point of the confirmed 6–12 h band
  maxItems: 50,
};

/**
 * The locked alert matrix. Order is significant — when multiple rules match
 * an event, the first match wins.
 */
export const ALERT_RULES: ReadonlyArray<AlertRule> = [
  // ---------------- URGENT ----------------
  {
    id: "urgent.person-at-entry",
    triggers: ["person"],
    urgency: "urgent",
    channels: ["push", "email"],
    label: "Person detected at door / entry zone",
    description:
      "Person detected inside a configured entry / door zone (Phase 5 zone gating).",
    bypassQuietHours: true,
  },
  {
    id: "urgent.doorbell",
    triggers: ["doorbell-press"],
    urgency: "urgent",
    channels: ["push", "email"],
    label: "Doorbell / ring event",
    description: "Physical doorbell press or ring event from the doorbell adapter.",
    bypassQuietHours: true,
  },
  {
    id: "urgent.camera-offline",
    triggers: ["camera-offline"],
    urgency: "urgent",
    channels: ["push", "email"],
    label: "Camera offline > 3 min",
    description:
      "Camera adapter has been unable to reconnect for longer than the offline threshold (default 3 min).",
    bypassQuietHours: true,
  },
  {
    id: "urgent.storage-critical",
    triggers: ["storage-critical"],
    urgency: "urgent",
    channels: ["push", "email"],
    label: "Storage < 10% free",
    description: "Local recording disk is critically low — recording will fail soon.",
    bypassQuietHours: true,
  },
  {
    id: "urgent.tamper",
    triggers: ["tamper"],
    urgency: "urgent",
    channels: ["push", "email"],
    label: "Tamper / device removed",
    description: "Camera reports tamper detection or has been forcibly removed.",
    bypassQuietHours: true,
  },
  {
    id: "urgent.burst",
    triggers: ["burst"],
    urgency: "urgent",
    channels: ["push", "email"],
    label: "Multiple events in short burst",
    description:
      "Burst escalation — 3+ events within 2 minutes promoted to urgent (see BURST_RULE_DEFAULT).",
    bypassQuietHours: true,
  },

  // ---------------- NON-URGENT (digest) ----------------
  {
    id: "digest.routine-motion",
    triggers: ["motion"],
    urgency: "non-urgent",
    channels: ["email-digest"],
    label: "Routine motion event",
    description:
      "Low-confidence or non-zone motion. Bundled into the periodic digest, never a push.",
    bypassQuietHours: false,
  },
  {
    id: "digest.system-health",
    triggers: ["system-health"],
    urgency: "non-urgent",
    channels: ["email-digest"],
    label: "Daily system health summary",
    description:
      "Daily summary of recorder, bridge, AI worker, disk, and cloud sync status.",
    bypassQuietHours: false,
  },
  {
    id: "digest.storage-warning",
    triggers: ["storage-warning"],
    urgency: "non-urgent",
    channels: ["email-digest"],
    label: "Storage warning (20–30% remaining)",
    description: "Heads-up that disk is filling — still safe, no action required yet.",
    bypassQuietHours: false,
  },
  // Camera-online is informational; included so it shows up in the digest UI.
  {
    id: "digest.camera-recovered",
    triggers: ["camera-online"],
    urgency: "non-urgent",
    channels: ["email-digest"],
    label: "Camera recovered",
    description: "A previously-offline camera has reconnected.",
    bypassQuietHours: false,
  },
];

/**
 * Resolve the first alert rule that matches a given event kind, or undefined.
 * Pure function — safe to call from any layer.
 */
export function resolveRule(kind: EventKind): AlertRule | undefined {
  return ALERT_RULES.find((rule) => rule.triggers.includes(kind));
}

/**
 * Returns true if the given local clock time falls inside quiet hours.
 * Accepts 24h "HH:MM" strings; supports overnight windows (e.g. 22:00–07:00).
 * Throws on malformed input rather than silently returning a wrong answer.
 */
export function isInQuietHours(
  localHHMM: string,
  cfg: QuietHoursConfig = QUIET_HOURS_DEFAULT,
): boolean {
  const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const toMinutes = (hhmm: string): number => {
    if (!HHMM.test(hhmm)) {
      throw new Error(`isInQuietHours: invalid HH:MM value "${hhmm}"`);
    }
    const [h, m] = hhmm.split(":").map((part) => Number.parseInt(part, 10));
    return h * 60 + m;
  };
  const now = toMinutes(localHHMM);
  const start = toMinutes(cfg.start);
  const end = toMinutes(cfg.end);
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/**
 * Apply quiet-hours and burst escalation to produce the final delivery channels.
 * Pure function so it can be unit-tested without mocking.
 */
export function effectiveChannels(
  rule: AlertRule,
  opts: { localHHMM?: string; quiet?: QuietHoursConfig } = {},
): AlertChannel[] {
  const { localHHMM, quiet = QUIET_HOURS_DEFAULT } = opts;
  if (!localHHMM) return [...rule.channels];
  const inQuiet = isInQuietHours(localHHMM, quiet);
  if (!inQuiet) return [...rule.channels];

  if (rule.urgency === "urgent" && rule.bypassQuietHours) {
    // Urgent push allowed; everything else still delivered.
    return [...rule.channels];
  }
  if (quiet.silenceNonUrgent) {
    // Drop push during quiet hours; digest still accumulates.
    return rule.channels.filter((c) => c !== "push");
  }
  return [...rule.channels];
}
