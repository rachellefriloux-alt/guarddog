/**
 * In-memory registry of Expo push tokens with per-camera opt-in.
 *
 * Mirrors the rest of the backend's "in-memory map; swap for Redis later"
 * pattern (see e.g. stream-supervisor). All public methods validate inputs
 * so the controller can stay thin and the service can be reused from
 * EventsService without re-checking.
 */
import { Injectable, Logger } from '@nestjs/common';

export interface PushSubscription {
  /** Expo push token, e.g. ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx] */
  token: string;
  /** Optional human-readable device label (mobile device, not camera). */
  deviceLabel?: string;
  /**
   * Camera IDs this device wants alerts for. Empty array means "all cameras".
   */
  cameraIds: string[];
  /** Last time the mobile client registered or refreshed this token. */
  updatedAt: number;
}

export interface PushPayload {
  /** Camera that produced the event (used for routing/filtering). */
  cameraId?: string;
  /** Event type (e.g. "person_detected"). */
  type: string;
  /** ISO timestamp string. */
  timestamp: string;
  /** Optional thumbnail URL (absolute or server-relative). */
  thumbnailUrl?: string;
  /** Optional event id so the mobile app can deep-link to it. */
  eventId?: string;
}

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

// Expo's published token formats. Both the legacy ExponentPushToken[...]
// and the newer ExpoPushToken[...] forms are accepted; anything else is
// rejected to prevent spoofing the registry with arbitrary strings.
const TOKEN_RE = /^Exp(?:onent)?PushToken\[[A-Za-z0-9_-]+\]$/;

export function isValidExpoPushToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly subs = new Map<string, PushSubscription>();

  /** Register or refresh a push token. Returns the stored subscription. */
  register(input: {
    token: string;
    deviceLabel?: string;
    cameraIds?: string[];
  }): PushSubscription {
    if (!isValidExpoPushToken(input.token)) {
      throw new Error('Invalid Expo push token');
    }
    const cameraIds = Array.isArray(input.cameraIds)
      ? input.cameraIds.filter((c): c is string => typeof c === 'string' && c.length > 0)
      : [];
    const sub: PushSubscription = {
      token: input.token,
      deviceLabel: typeof input.deviceLabel === 'string' ? input.deviceLabel : undefined,
      cameraIds,
      updatedAt: Date.now(),
    };
    this.subs.set(sub.token, sub);
    return sub;
  }

  /** Remove a token from the registry. Returns true if it was present. */
  unregister(token: string): boolean {
    if (!isValidExpoPushToken(token)) return false;
    return this.subs.delete(token);
  }

  /** Snapshot of all current subscriptions (for diagnostics/tests). */
  list(): PushSubscription[] {
    return Array.from(this.subs.values());
  }

  /**
   * Fan a payload out to every subscribed token whose opt-in matches the
   * payload's cameraId. Subscriptions with an empty `cameraIds` array
   * receive everything.
   */
  async notify(payload: PushPayload): Promise<{ sent: number }> {
    const targets: string[] = [];
    for (const sub of this.subs.values()) {
      if (sub.cameraIds.length === 0) {
        targets.push(sub.token);
        continue;
      }
      if (payload.cameraId && sub.cameraIds.includes(payload.cameraId)) {
        targets.push(sub.token);
      }
    }
    if (targets.length === 0) return { sent: 0 };
    await this.sendToExpo(targets, payload);
    return { sent: targets.length };
  }

  /**
   * Send a synthetic test payload to a single token. Used by /api/push/test
   * so a freshly-paired mobile device can verify its registration.
   */
  async sendTest(token: string): Promise<{ sent: number }> {
    if (!isValidExpoPushToken(token)) {
      throw new Error('Invalid Expo push token');
    }
    await this.sendToExpo([token], {
      type: 'test',
      timestamp: new Date().toISOString(),
    });
    return { sent: 1 };
  }

  /**
   * POST a batch to the Expo push API. We chunk at 100 messages per Expo's
   * documented batch limit. Failures are logged but do not throw, so a
   * single bad token cannot block AI detection from being persisted.
   */
  private async sendToExpo(tokens: string[], payload: PushPayload): Promise<void> {
    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      title: payload.type === 'test' ? 'GuardDog test' : `GuardDog: ${payload.type}`,
      body: payload.cameraId
        ? `Camera ${payload.cameraId} • ${payload.timestamp}`
        : payload.timestamp,
      data: {
        cameraId: payload.cameraId,
        type: payload.type,
        timestamp: payload.timestamp,
        thumbnailUrl: payload.thumbnailUrl,
        eventId: payload.eventId,
      },
    }));

    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      try {
        const res = await fetch(EXPO_PUSH_ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'accept-encoding': 'gzip, deflate',
          },
          body: JSON.stringify(batch),
        });
        if (!res.ok) {
          this.logger.warn(`Expo push HTTP ${res.status}`);
        }
      } catch (err) {
        this.logger.warn(`Expo push failed: ${(err as Error).message}`);
      }
    }
  }
}
