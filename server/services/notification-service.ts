/**
 * Notification fan-out service.
 *
 * Plugs in zero, one, or many notification sinks driven entirely by env vars
 * so end users don't have to write code to wire up Pushover / ntfy.sh /
 * Discord / a generic webhook. Sinks are evaluated independently — failure of
 * one sink does not stop the others.
 *
 * Env knobs (all optional, all may coexist):
 *   NTFY_TOPIC_URL           e.g. https://ntfy.sh/my-guarddog-alerts
 *   DISCORD_WEBHOOK_URL      Discord channel webhook
 *   GENERIC_WEBHOOK_URL      POSTed JSON {title, message, ...}
 *   PUSHOVER_USER_KEY        + PUSHOVER_API_TOKEN
 *
 * The audit log records every send for visibility.
 */

import { auditLog } from "./audit-log";

export type NotificationLevel = "info" | "alert" | "critical";

export interface NotificationPayload {
  title: string;
  message: string;
  level?: NotificationLevel;
  /** Optional link the user can click in the notification. */
  url?: string;
  /** Free-form structured metadata. */
  meta?: Record<string, unknown>;
}

export interface NotificationChannel {
  id: string;
  label: string;
  enabled: boolean;
  /** Brief description of how to enable this channel (shown in Settings). */
  description?: string;
}

interface SinkResult {
  channel: string;
  ok: boolean;
  error?: string;
}

class NotificationService {
  /** All available channels and whether they are configured via env. */
  getChannels(): NotificationChannel[] {
    return [
      {
        id: "ntfy",
        label: "ntfy.sh",
        enabled: Boolean(process.env.NTFY_TOPIC_URL),
        description: "Set NTFY_TOPIC_URL to a topic URL (e.g. https://ntfy.sh/my-topic).",
      },
      {
        id: "discord",
        label: "Discord webhook",
        enabled: Boolean(process.env.DISCORD_WEBHOOK_URL),
        description: "Paste a Discord channel webhook URL into DISCORD_WEBHOOK_URL.",
      },
      {
        id: "pushover",
        label: "Pushover",
        enabled: Boolean(process.env.PUSHOVER_USER_KEY && process.env.PUSHOVER_API_TOKEN),
        description: "Set PUSHOVER_USER_KEY and PUSHOVER_API_TOKEN.",
      },
      {
        id: "webhook",
        label: "Generic webhook",
        enabled: Boolean(process.env.GENERIC_WEBHOOK_URL),
        description: "Set GENERIC_WEBHOOK_URL — receives JSON {title, message, level, url, meta}.",
      },
    ];
  }

  /** Send a notification through every enabled sink. */
  async send(payload: NotificationPayload): Promise<SinkResult[]> {
    const enabledChannels = this.getChannels().filter((c) => c.enabled);
    if (enabledChannels.length === 0) {
      return [];
    }

    const results = await Promise.all(enabledChannels.map((c) => this.dispatch(c.id, payload)));

    auditLog.record({
      event: "notification.send",
      detail: `${payload.title} → ${enabledChannels.map((c) => c.id).join(", ")}`,
    });
    return results;
  }

  private async dispatch(channelId: string, payload: NotificationPayload): Promise<SinkResult> {
    try {
      switch (channelId) {
        case "ntfy":
          return await this.sendNtfy(payload);
        case "discord":
          return await this.sendDiscord(payload);
        case "pushover":
          return await this.sendPushover(payload);
        case "webhook":
          return await this.sendWebhook(payload);
        default:
          return { channel: channelId, ok: false, error: "unknown channel" };
      }
    } catch (err) {
      return { channel: channelId, ok: false, error: (err as Error).message };
    }
  }

  private async sendNtfy(payload: NotificationPayload): Promise<SinkResult> {
    const url = process.env.NTFY_TOPIC_URL!;
    const priority = payload.level === "critical" ? "5" : payload.level === "alert" ? "4" : "3";
    const headers: Record<string, string> = {
      Title: payload.title,
      Priority: priority,
    };
    if (payload.url) headers.Click = payload.url;
    const res = await fetch(url, { method: "POST", headers, body: payload.message });
    return { channel: "ntfy", ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  }

  private async sendDiscord(payload: NotificationPayload): Promise<SinkResult> {
    const url = process.env.DISCORD_WEBHOOK_URL!;
    const colour = payload.level === "critical" ? 0xc0392b : payload.level === "alert" ? 0xe67e22 : 0x3498db;
    const body = JSON.stringify({
      username: "GuardDog",
      embeds: [
        {
          title: payload.title,
          description: payload.message,
          color: colour,
          url: payload.url,
        },
      ],
    });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return { channel: "discord", ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  }

  private async sendPushover(payload: NotificationPayload): Promise<SinkResult> {
    const params = new URLSearchParams({
      token: process.env.PUSHOVER_API_TOKEN!,
      user: process.env.PUSHOVER_USER_KEY!,
      title: payload.title,
      message: payload.message,
      priority: payload.level === "critical" ? "1" : "0",
    });
    if (payload.url) params.set("url", payload.url);
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    return { channel: "pushover", ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  }

  private async sendWebhook(payload: NotificationPayload): Promise<SinkResult> {
    const url = process.env.GENERIC_WEBHOOK_URL!;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { channel: "webhook", ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  }
}

export const notificationService = new NotificationService();
